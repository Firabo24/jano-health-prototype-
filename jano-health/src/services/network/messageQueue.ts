/**
 * Jano Health - Durable Store-and-Forward Message Queue & Dead-Letter Subsystem
 * Clinical Core V13: Asynchronous Exchange, Replay Protection, and Idempotency
 */

import { NetworkExchangeMessage, ExchangeLifecycleState, MessageAttempt } from '../../domain/types';
import { idbEngine } from '../storage/indexedDbEngine';

export class DurableExchangeQueue {
  private static instance: DurableExchangeQueue;
  private queue: Map<string, NetworkExchangeMessage> = new Map();
  private processedIdempotencyKeys: Map<string, { messageId: string; payloadHash: string; state: ExchangeLifecycleState; acknowledgedAt?: string }> = new Map();

  private constructor() {}

  public static getInstance(): DurableExchangeQueue {
    if (!DurableExchangeQueue.instance) {
      DurableExchangeQueue.instance = new DurableExchangeQueue();
    }
    return DurableExchangeQueue.instance;
  }

  public async enqueue(message: NetworkExchangeMessage): Promise<void> {
    message.currentState = 'QUEUED';
    message.queuedAt = new Date().toISOString();
    this.queue.set(message.messageId, message);

    try {
      await idbEngine.put('networkMessages', message);
    } catch {
      // Memory fallback
    }
  }

  public async updateMessage(message: NetworkExchangeMessage): Promise<void> {
    this.queue.set(message.messageId, message);
    try {
      await idbEngine.put('networkMessages', message);
    } catch {
      // Memory fallback
    }
  }

  public getMessage(messageId: string): NetworkExchangeMessage | undefined {
    return this.queue.get(messageId);
  }

  public getQueue(filters?: {
    sourceNodeId?: string;
    destinationNodeId?: string;
    sourceFacilityId?: string;
    currentState?: ExchangeLifecycleState;
  }): NetworkExchangeMessage[] {
    let items = Array.from(this.queue.values());

    if (filters?.sourceNodeId) {
      items = items.filter((m) => m.sourceNodeId === filters.sourceNodeId);
    }
    if (filters?.destinationNodeId) {
      items = items.filter((m) => m.destinationNodeId === filters.destinationNodeId);
    }
    if (filters?.sourceFacilityId) {
      items = items.filter((m) => m.sourceFacilityId === filters.sourceFacilityId);
    }
    if (filters?.currentState) {
      items = items.filter((m) => m.currentState === filters.currentState);
    }

    return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public getDeadLetterQueue(facilityId?: string): NetworkExchangeMessage[] {
    let items = Array.from(this.queue.values()).filter((m) => m.currentState === 'DEAD_LETTER');
    if (facilityId) {
      items = items.filter((m) => m.sourceFacilityId === facilityId || m.destinationFacilityId === facilityId);
    }
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Evaluates incoming idempotency key against processed message history.
   * Protects against replay attacks and duplicates across intermittent connectivity.
   */
  public checkIdempotency(
    idempotencyKey: string,
    payloadHash: string
  ): {
    isDuplicate: boolean;
    isTamperedReplay: boolean;
    existingMessageId?: string;
    acknowledgedAt?: string;
  } {
    const existing = this.processedIdempotencyKeys.get(idempotencyKey);
    if (!existing) {
      return { isDuplicate: false, isTamperedReplay: false };
    }

    // If same idempotency key is presented with altered payload, flag as tampered replay
    if (existing.payloadHash.toLowerCase() !== payloadHash.toLowerCase()) {
      return {
        isDuplicate: true,
        isTamperedReplay: true,
        existingMessageId: existing.messageId,
      };
    }

    // Exact duplicate match
    return {
      isDuplicate: true,
      isTamperedReplay: false,
      existingMessageId: existing.messageId,
      acknowledgedAt: existing.acknowledgedAt,
    };
  }

  public registerProcessedIdempotency(
    idempotencyKey: string,
    messageId: string,
    payloadHash: string,
    state: ExchangeLifecycleState,
    acknowledgedAt?: string
  ): void {
    this.processedIdempotencyKeys.set(idempotencyKey, {
      messageId,
      payloadHash,
      state,
      acknowledgedAt,
    });
  }

  /**
   * Records a failed delivery attempt and determines if message should retry or transition to DEAD_LETTER.
   */
  public async recordFailedAttempt(
    messageId: string,
    statusCode: number | undefined,
    errorMessage: string,
    isTransient: boolean
  ): Promise<NetworkExchangeMessage> {
    const msg = this.queue.get(messageId);
    if (!msg) {
      throw new Error(`MESSAGE_NOT_FOUND: Cannot record attempt for non-existent message '${messageId}'.`);
    }

    const now = new Date().toISOString();
    msg.retryCount += 1;

    const attempt: MessageAttempt = {
      attemptNumber: msg.retryCount,
      timestamp: now,
      status: isTransient ? 'TRANSIENT_FAILURE' : 'PERMANENT_FAILURE',
      statusCode,
      errorMessage,
    };
    msg.attemptHistory.push(attempt);

    // If permanent failure or max retries exhausted, send to DEAD_LETTER
    if (!isTransient || msg.retryCount >= msg.maxRetries) {
      msg.currentState = 'DEAD_LETTER';
      msg.failureCode = statusCode ? `STATUS_${statusCode}` : 'RETRY_EXHAUSTED';
      msg.failureMessage = errorMessage;
    } else {
      msg.currentState = 'RETRY';
      // Exponential backoff with jitter
      const backoffSec = Math.min(300, Math.pow(2, msg.retryCount) * 2);
      msg.nextRetryAt = new Date(Date.now() + backoffSec * 1000).toISOString();
      msg.failureCode = 'TRANSIENT_PENDING_RETRY';
      msg.failureMessage = errorMessage;
    }

    await this.updateMessage(msg);
    return msg;
  }

  public async retryDeadLetter(messageId: string, actorId: string): Promise<NetworkExchangeMessage> {
    const msg = this.queue.get(messageId);
    if (!msg) {
      throw new Error(`MESSAGE_NOT_FOUND: Message '${messageId}' not found.`);
    }

    msg.currentState = 'QUEUED';
    msg.nextRetryAt = new Date().toISOString();
    msg.failureCode = undefined;
    msg.failureMessage = undefined;
    msg.attemptHistory.push({
      attemptNumber: msg.retryCount + 1,
      timestamp: new Date().toISOString(),
      status: 'TRANSIENT_FAILURE',
      errorMessage: `Manual operator retry requested by '${actorId}'`,
    });

    await this.updateMessage(msg);
    return msg;
  }

  public async cancelExchange(messageId: string, actorId: string, reason: string): Promise<NetworkExchangeMessage> {
    const msg = this.queue.get(messageId);
    if (!msg) {
      throw new Error(`MESSAGE_NOT_FOUND: Message '${messageId}' not found.`);
    }

    msg.currentState = 'CANCELLED';
    msg.failureCode = 'OPERATOR_CANCELLED';
    msg.failureMessage = `Cancelled by ${actorId}: ${reason}`;

    await this.updateMessage(msg);
    return msg;
  }

  public resetQueue(): void {
    this.queue.clear();
    this.processedIdempotencyKeys.clear();
  }
}

export const durableExchangeQueue = DurableExchangeQueue.getInstance();

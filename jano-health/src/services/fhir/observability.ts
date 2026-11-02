/**
 * Jano Health - FHIR Observability & Metrics Registry
 * Clinical Core V12: Safe Telemetry Without PHI Leakage
 */

import { GatewayMetrics } from './gatewayTypes';

export class GatewayObservability {
  private static instance: GatewayObservability;
  private metrics: GatewayMetrics = {
    requestCount: 0,
    successCount: 0,
    clientErrorCount: 0,
    serverErrorCount: 0,
    rateLimitExceededCount: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    exchangeFailures: 0,
    retryCount: 0,
    deadLetterCount: 0,
    identityReconciliationCount: 0,
    validationFailureCount: 0,
    lastUpdated: new Date().toISOString(),
  };

  private constructor() {}

  public static getInstance(): GatewayObservability {
    if (!GatewayObservability.instance) {
      GatewayObservability.instance = new GatewayObservability();
    }
    return GatewayObservability.instance;
  }

  public recordRequest(status: number, latencyMs: number): void {
    this.metrics.requestCount++;
    this.metrics.totalLatencyMs += latencyMs;
    this.metrics.averageLatencyMs = Math.round(this.metrics.totalLatencyMs / this.metrics.requestCount);

    if (status >= 200 && status < 300) {
      this.metrics.successCount++;
    } else if (status === 429) {
      this.metrics.rateLimitExceededCount++;
      this.metrics.clientErrorCount++;
    } else if (status >= 400 && status < 500) {
      this.metrics.clientErrorCount++;
    } else if (status >= 500) {
      this.metrics.serverErrorCount++;
      this.metrics.exchangeFailures++;
    }

    this.metrics.lastUpdated = new Date().toISOString();
  }

  public recordValidationFailure(): void {
    this.metrics.validationFailureCount++;
  }

  public recordIdentityReconciliation(): void {
    this.metrics.identityReconciliationCount++;
  }

  public recordRetry(): void {
    this.metrics.retryCount++;
  }

  public recordDeadLetter(): void {
    this.metrics.deadLetterCount++;
  }

  public getMetrics(): GatewayMetrics {
    return { ...this.metrics };
  }

  public reset(): void {
    this.metrics = {
      requestCount: 0,
      successCount: 0,
      clientErrorCount: 0,
      serverErrorCount: 0,
      rateLimitExceededCount: 0,
      totalLatencyMs: 0,
      averageLatencyMs: 0,
      exchangeFailures: 0,
      retryCount: 0,
      deadLetterCount: 0,
      identityReconciliationCount: 0,
      validationFailureCount: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export const gatewayObservability = GatewayObservability.getInstance();

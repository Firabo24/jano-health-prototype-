/**
 * Jano Health - Network Transport Abstraction
 * Clinical Core V13: Transport Boundary, Anti-SSRF Protections, and Offline Simulation
 */

import { NetworkExchangeMessage } from '../../domain/types';
import { INetworkTransport, NetworkTransportResult } from './types';
import { janoNodeRegistryService } from './nodeRegistry';

export class LocalNetworkTransport implements INetworkTransport {
  public readonly transportName = 'local_mesh_transport';
  private offlineNodes: Set<string> = new Set();
  private transientFailureNodes: Set<string> = new Set();
  private permanentFailureNodes: Set<string> = new Set();
  private dropBeforeAckNodes: Set<string> = new Set();
  private simulatedLatencyMs = 10;
  private messageReceiverHandler?: (message: NetworkExchangeMessage) => Promise<{ success: boolean; error?: string; payload?: any }>;

  public setReceiverHandler(handler: (message: NetworkExchangeMessage) => Promise<{ success: boolean; error?: string; payload?: any }>): void {
    this.messageReceiverHandler = handler;
  }

  public simulateNodeOffline(nodeId: string, isOffline = true): void {
    if (isOffline) {
      this.offlineNodes.add(nodeId);
      janoNodeRegistryService.updateNetworkStatus(nodeId, 'OFFLINE');
    } else {
      this.offlineNodes.delete(nodeId);
      janoNodeRegistryService.updateNetworkStatus(nodeId, 'ONLINE');
    }
  }

  public simulateTransientFailure(nodeId: string, enable = true): void {
    if (enable) this.transientFailureNodes.add(nodeId);
    else this.transientFailureNodes.delete(nodeId);
  }

  public simulatePermanentFailure(nodeId: string, enable = true): void {
    if (enable) this.permanentFailureNodes.add(nodeId);
    else this.permanentFailureNodes.delete(nodeId);
  }

  public simulateDropBeforeAck(nodeId: string, enable = true): void {
    if (enable) this.dropBeforeAckNodes.add(nodeId);
    else this.dropBeforeAckNodes.delete(nodeId);
  }

  public setSimulatedLatency(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  public resetSimulations(): void {
    this.offlineNodes.clear();
    this.transientFailureNodes.clear();
    this.permanentFailureNodes.clear();
    this.dropBeforeAckNodes.clear();
    this.simulatedLatencyMs = 10;
  }

  public async ping(nodeId: string): Promise<boolean> {
    if (this.offlineNodes.has(nodeId)) return false;
    const node = janoNodeRegistryService.getNode(nodeId);
    if (!node || node.networkStatus === 'OFFLINE' || node.trustStatus === 'REVOKED') return false;
    return true;
  }

  public async send(message: NetworkExchangeMessage): Promise<NetworkTransportResult> {
    const startTime = Date.now();

    if (this.simulatedLatencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulatedLatencyMs));
    }

    // Check if source node is offline
    if (this.offlineNodes.has(message.sourceNodeId)) {
      return {
        success: false,
        statusCode: 0,
        acknowledged: false,
        error: `SOURCE_OFFLINE: Source node '${message.sourceNodeId}' is currently disconnected. Message retained in store-and-forward queue.`,
        isTransient: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // Check if destination node is offline
    if (this.offlineNodes.has(message.destinationNodeId)) {
      return {
        success: false,
        statusCode: 503,
        acknowledged: false,
        error: `DESTINATION_UNREACHABLE: Destination node '${message.destinationNodeId}' is offline. Enqueued for retry.`,
        isTransient: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // Check simulated permanent failure
    if (this.permanentFailureNodes.has(message.destinationNodeId)) {
      return {
        success: false,
        statusCode: 400,
        acknowledged: false,
        error: `BAD_REQUEST: Destination rejected payload format permanently.`,
        isTransient: false,
        latencyMs: Date.now() - startTime,
      };
    }

    // Check simulated transient failure
    if (this.transientFailureNodes.has(message.destinationNodeId)) {
      return {
        success: false,
        statusCode: 504,
        acknowledged: false,
        error: `GATEWAY_TIMEOUT: Destination node did not respond within timeout window.`,
        isTransient: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // Check drop before ack (delivered to transport, but connection dropped before sender gets ack)
    if (this.dropBeforeAckNodes.has(message.destinationNodeId)) {
      if (this.messageReceiverHandler) {
        await this.messageReceiverHandler(message);
      }
      return {
        success: false,
        statusCode: 0,
        acknowledged: false,
        error: `CONNECTION_RESET_BEFORE_ACK: Message reached receiver but transport dropped prior to acknowledgement. Sender will retry.`,
        isTransient: true,
        latencyMs: Date.now() - startTime,
      };
    }

    // Process via receiver handler if registered
    let handlerResult: { success: boolean; payload?: any; error?: string } = { success: true, payload: undefined, error: undefined };
    if (this.messageReceiverHandler) {
      try {
        handlerResult = await this.messageReceiverHandler(message);
      } catch (err: any) {
        return {
          success: false,
          statusCode: 500,
          acknowledged: false,
          error: err?.message || 'INBOUND_PROCESSING_FAILED',
          isTransient: true,
          latencyMs: Date.now() - startTime,
        };
      }
    }

    if (!handlerResult.success) {
      return {
        success: false,
        statusCode: 422,
        acknowledged: false,
        error: handlerResult.error || 'UNPROCESSABLE_ENTITY',
        isTransient: false,
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      statusCode: 200,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
      responsePayload: handlerResult.payload,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Production-ready HTTP transport with anti-SSRF protections and configurable timeout.
 */
export class HttpNetworkTransport implements INetworkTransport {
  public readonly transportName = 'http_network_transport';

  public static isSafeUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:') return false;

      const hostname = parsed.hostname.toLowerCase();
      // Anti-SSRF: reject cloud metadata and link-local addresses
      if (
        hostname === '169.254.169.254' ||
        hostname === 'metadata.google.internal' ||
        hostname.endsWith('.internal') ||
        hostname === '0.0.0.0'
      ) {
        return false;
      }

      // Block AWS/GCP instance metadata path lookups
      if (parsed.pathname.includes('/latest/meta-data') || parsed.pathname.includes('/computeMetadata')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public async ping(nodeId: string): Promise<boolean> {
    const node = janoNodeRegistryService.getNode(nodeId);
    if (!node || !node.endpointMetadata.url) return false;
    if (!HttpNetworkTransport.isSafeUrl(node.endpointMetadata.url)) return false;
    return node.networkStatus === 'ONLINE';
  }

  public async send(message: NetworkExchangeMessage): Promise<NetworkTransportResult> {
    const destNode = janoNodeRegistryService.getNode(message.destinationNodeId);
    if (!destNode || !destNode.endpointMetadata.url) {
      return {
        success: false,
        statusCode: 400,
        acknowledged: false,
        error: `NO_ENDPOINT_CONFIGURED: Destination node '${message.destinationNodeId}' lacks a valid endpoint URL.`,
        isTransient: false,
      };
    }

    if (!HttpNetworkTransport.isSafeUrl(destNode.endpointMetadata.url)) {
      return {
        success: false,
        statusCode: 403,
        acknowledged: false,
        error: `SSRF_BLOCKED: Endpoint URL for node '${message.destinationNodeId}' targets prohibited or link-local address.`,
        isTransient: false,
      };
    }

    const startTime = Date.now();
    try {
      // In web/browser/node environments, execute real fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), destNode.endpointMetadata.timeoutMs || 8000);

      const resp = await fetch(destNode.endpointMetadata.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Jano-Source-Node': message.sourceNodeId,
          'X-Jano-Correlation-Id': message.correlationId,
          'X-Jano-Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const isSuccess = resp.status >= 200 && resp.status < 300;
      let body: any = null;
      try {
        body = await resp.json();
      } catch {
        // text or empty
      }

      return {
        success: isSuccess,
        statusCode: resp.status,
        acknowledged: isSuccess,
        acknowledgedAt: isSuccess ? new Date().toISOString() : undefined,
        responsePayload: body,
        error: isSuccess ? undefined : `HTTP_${resp.status}`,
        isTransient: resp.status >= 500 || resp.status === 429,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        statusCode: 0,
        acknowledged: false,
        error: err?.message || 'NETWORK_CONNECTION_FAILED',
        isTransient: true,
        latencyMs: Date.now() - startTime,
      };
    }
  }
}

export const localNetworkTransport = new LocalNetworkTransport();
export const httpNetworkTransport = new HttpNetworkTransport();

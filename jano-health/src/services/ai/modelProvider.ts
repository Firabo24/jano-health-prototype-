/**
 * Jano Health - Clinical Core V10: AI Model Provider & Provider Architecture
 * 
 * Centralizes:
 * - PRIMARY_MODEL: gemini-3.8-flash
 * - FALLBACK_MODEL: gemini-3.7-flash
 * 
 * Rules:
 * - Model availability is governed by server/provider configuration.
 * - Transient fallback is permitted ONLY on transient network/capacity errors.
 * - FALLBACK IS STRICTLY FORBIDDEN on:
 *   1. Authentication failures (401)
 *   2. Authorization failures (403)
 *   3. Malformed requests (400)
 *   4. Safety rejections (422)
 *   5. Invalid patient context
 *   6. Policy violations
 */

import { PRIMARY_MODEL, FALLBACK_MODEL, AICapability } from '../../domain/aiTypes';
import { getAuthAdapter } from '../security/authAdapter';
import { syncEngine } from '../sync/syncEngine';

export interface ModelGenerationRequest {
  requestId: string;
  taskType: AICapability;
  systemInstruction: string;
  promptText: string;
  patientId?: string;
  facilityId: string;
  actorId: string;
  actorRole: string;
  timeoutMs?: number;
}

export interface ModelGenerationResponse {
  rawText: string;
  model: string;
  modelVersion: string;
  usedFallback: boolean;
  provider: 'gemini_cloud' | 'local_deterministic_rules' | 'future_local_model';
  latencyMs: number;
}

export interface ModelHealthStatus {
  primaryAvailable: boolean;
  fallbackAvailable: boolean;
  offlineCapable: boolean;
  geminiConfigured: boolean;
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
}

export interface IAIModelProvider {
  generate(request: ModelGenerationRequest): Promise<ModelGenerationResponse>;
  healthCheck(): Promise<ModelHealthStatus>;
}

export class GeminiCloudModelProvider implements IAIModelProvider {
  private static instance: GeminiCloudModelProvider;

  public static getInstance(): GeminiCloudModelProvider {
    if (!GeminiCloudModelProvider.instance) {
      GeminiCloudModelProvider.instance = new GeminiCloudModelProvider();
    }
    return GeminiCloudModelProvider.instance;
  }

  public async healthCheck(): Promise<ModelHealthStatus> {
    const isOnline = syncEngine.isEffectivelyOnline();
    if (!isOnline) {
      return {
        primaryAvailable: false,
        fallbackAvailable: false,
        offlineCapable: true,
        geminiConfigured: false,
        status: 'DEGRADED',
      };
    }

    try {
      const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        const data = await res.json();
        return {
          primaryAvailable: Boolean(data.geminiConfigured),
          fallbackAvailable: Boolean(data.geminiConfigured),
          offlineCapable: true,
          geminiConfigured: Boolean(data.geminiConfigured),
          status: data.geminiConfigured ? 'HEALTHY' : 'DEGRADED',
        };
      }
    } catch {
      // offline or unreachable
    }

    return {
      primaryAvailable: false,
      fallbackAvailable: false,
      offlineCapable: true,
      geminiConfigured: false,
      status: 'UNAVAILABLE',
    };
  }

  public async generate(request: ModelGenerationRequest): Promise<ModelGenerationResponse> {
    const startTime = Date.now();
    const isOnline = syncEngine.isEffectivelyOnline();

    if (!isOnline) {
      throw new Error('OFFLINE_NETWORK_UNAVAILABLE: Cloud model is inaccessible while client is offline.');
    }

    const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:3000';
    const token = await getAuthAdapter().getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': request.actorId,
      'X-Facility-Id': request.facilityId,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = {
      requestId: request.requestId,
      taskType: request.taskType,
      systemInstruction: request.systemInstruction,
      clinicalQuery: request.promptText,
      facilityId: request.facilityId,
      patientId: request.patientId,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || 8000);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/ai/clinical-assist`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      throw new Error(`TRANSIENT_FETCH_FAILURE: ${fetchErr?.message || 'Network timeout contacting AI service'}`);
    } finally {
      clearTimeout(timeoutId);
    }

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const status = response.status;
      const errorType = errorJson.error || 'API_ERROR';

      // DO NOT fallback on auth, forbidden, malformed, or safety errors
      if (status === 401 || status === 403) {
        throw new Error(`SECURITY_AUTHORIZATION_FAILURE (${status}): ${errorJson.message || 'Access denied'}`);
      }
      if (status === 400) {
        throw new Error(`MALFORMED_REQUEST (400): ${errorJson.message || 'Invalid parameters'}`);
      }
      if (status === 422 || errorType === 'SAFETY_POLICY_REJECTION') {
        throw new Error(`SAFETY_POLICY_REJECTION: ${errorJson.message || 'Blocked by safety policy'}`);
      }

      throw new Error(`MODEL_SERVICE_FAILURE (${status}): ${errorJson.message || 'AI service error'}`);
    }

    const result = await response.json();
    const rawText = result.structuredOutput ? JSON.stringify(result.structuredOutput) : result.content || '';

    return {
      rawText,
      model: result.model || PRIMARY_MODEL,
      modelVersion: result.model?.includes(FALLBACK_MODEL) ? 'gemini-3.7-flash-prod' : 'gemini-3.8-flash-prod',
      usedFallback: result.model === FALLBACK_MODEL,
      provider: 'gemini_cloud',
      latencyMs,
    };
  }
}

export const geminiCloudModelProvider = GeminiCloudModelProvider.getInstance();

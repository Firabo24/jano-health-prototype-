/**
 * Jano Health - Gateway Rate Limiter & Concurrency Controller
 * Clinical Core V12: Anti-DoS & Rate Limiting Guard
 */

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
  limit: number;
}

export class GatewayRateLimiter {
  private static instance: GatewayRateLimiter;
  // Key: systemId or IP -> Array of timestamp MS
  private requests = new Map<string, number[]>();
  private defaultLimitPerMinute = 120;

  private constructor() {}

  public static getInstance(): GatewayRateLimiter {
    if (!GatewayRateLimiter.instance) {
      GatewayRateLimiter.instance = new GatewayRateLimiter();
    }
    return GatewayRateLimiter.instance;
  }

  public checkLimit(key: string, limitPerMinute?: number): RateLimitStatus {
    const limit = limitPerMinute || this.defaultLimitPerMinute;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    let history = this.requests.get(key) || [];
    // Clean entries older than 1 minute
    history = history.filter((ts) => ts > oneMinuteAgo);

    if (history.length >= limit) {
      const oldest = history[0];
      const resetTimeMs = oldest + 60000;
      this.requests.set(key, history);
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs,
        limit,
      };
    }

    history.push(now);
    this.requests.set(key, history);

    return {
      allowed: true,
      remaining: limit - history.length,
      resetTimeMs: now + 60000,
      limit,
    };
  }

  public reset(key?: string): void {
    if (key) {
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }
}

export const gatewayRateLimiter = GatewayRateLimiter.getInstance();

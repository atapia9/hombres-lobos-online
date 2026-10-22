// Token bucket (ADR-007): bursts of `capacity` events, refilled at `refillPerSecond`.

export const DEFAULT_RATE_LIMIT = Object.freeze({ capacity: 20, refillPerSecond: 5, maxStrikes: 40 });

export function createRateLimiter({ capacity, refillPerSecond, now = Date.now }) {
  let tokens = capacity;
  let last = now();
  return {
    /** Takes one token. Returns false when the bucket is empty. */
    take() {
      const current = now();
      tokens = Math.min(capacity, tokens + ((current - last) / 1000) * refillPerSecond);
      last = current;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

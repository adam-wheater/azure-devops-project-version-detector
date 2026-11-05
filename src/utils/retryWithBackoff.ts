const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
}

/** True for transient Azure DevOps REST failures (throttling, network blips, gateway errors). */
export function isRetryableError(err: any): boolean {
  if (!err) return false;
  if (err.name === "NetworkException") return true;
  return typeof err.status === "number" && RETRYABLE_STATUSES.has(err.status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    // The abort listener is removed when the timer fires. One scan shares a
    // single signal across thousands of requests, so leaving a listener behind
    // after every backoff kept each retry's closure alive for the whole scan.
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Retries a REST call with exponential backoff + jitter when Azure DevOps
 * responds with a throttling (429) or gateway (502/503/504) error. Many
 * concurrent scans (multiple users, or high per-scan concurrency) can trip
 * the org's shared rate limit; without this, one throttled request fails
 * the whole repo instead of just slowing down.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 4, baseDelayMs = 500, signal } = options;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (signal?.aborted || attempt >= maxAttempts || !isRetryableError(err)) {
        throw err;
      }
      const jitter = 0.75 + Math.random() * 0.5;
      const delay = baseDelayMs * 2 ** (attempt - 1) * jitter;
      await sleep(delay, signal);
      if (signal?.aborted) {
        throw err;
      }
    }
  }
}

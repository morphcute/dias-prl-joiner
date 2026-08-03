/**
 * Utility for robust API requests with auto-reconnect and exponential backoff retry.
 * Handles rate limits (429), server errors (500/502/503/504), and socket timeouts (ECONNRESET/ETIMEDOUT).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1200,
  contextLabel = "Google API",
  timeoutMs = 8000
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt++;
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout of ${timeoutMs}ms exceeded for ${contextLabel}`)), timeoutMs);
      });
      const result = await Promise.race([fn(), timeoutPromise]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      const status = err?.status || err?.code || err?.response?.status;
      const message = err?.message || String(err);

      const isRateLimit = status === 429 || message.includes("Quota") || message.includes("RATE_LIMIT") || message.includes("User Rate Limit Exceeded");
      const isTransientServer = (typeof status === "number" && status >= 500 && status <= 599) || message.includes("503") || message.includes("500");
      const isNetworkTimeout =
        message.includes("ETIMEDOUT") ||
        message.includes("ECONNRESET") ||
        message.includes("ENOTFOUND") ||
        message.includes("socket hang up") ||
        message.includes("timeout") ||
        message.includes("network");

      const isRetryable = isRateLimit || isTransientServer || isNetworkTimeout;

      if (isRetryable && attempt <= retries) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        console.warn(`[Auto-Reconnect][${contextLabel}] Retrying attempt ${attempt}/${retries} after ${backoff}ms due to: ${message}`);
        await new Promise((r) => setTimeout(r, backoff));
      } else {
        throw err;
      }
    }
  }
}

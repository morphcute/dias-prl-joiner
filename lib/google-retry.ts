/**
 * Utility for robust API requests with auto-reconnect and exponential backoff retry.
 * Handles rate limits (429), server errors (500/502/503/504), and socket timeouts (ECONNRESET/ETIMEDOUT).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 4,
  delayMs = 1500,
  contextLabel = "Google API",
  timeoutMs = 30000
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt++;
    let timer: NodeJS.Timeout | undefined;
    const currentTimeout = timeoutMs + (attempt - 1) * 5000;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timeout of ${currentTimeout}ms exceeded for ${contextLabel}`)),
          currentTimeout
        );
      });
      const result = await Promise.race([fn(), timeoutPromise]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      const status = err?.status || err?.code || err?.response?.status;
      const message = err?.message || String(err);

      const isRateLimit =
        status === 429 ||
        message.includes("Quota") ||
        message.includes("RATE_LIMIT") ||
        message.includes("User Rate Limit Exceeded") ||
        message.includes("rateLimitExceeded");

      const isTransientServer =
        (typeof status === "number" && status >= 500 && status <= 599) ||
        message.includes("503") ||
        message.includes("502") ||
        message.includes("500") ||
        message.includes("504") ||
        message.includes("backendError");

      const isNetworkTimeout =
        message.includes("ETIMEDOUT") ||
        message.includes("ECONNRESET") ||
        message.includes("ENOTFOUND") ||
        message.includes("socket hang up") ||
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("network") ||
        message.includes("fetch failed");

      const isPermissionOrNotFound =
        status === 403 ||
        status === 404 ||
        message.includes("403") ||
        message.includes("404") ||
        message.includes("The caller does not have permission") ||
        message.includes("Requested entity was not found");

      // Do NOT retry hard 403/404 permission or not found errors
      const isRetryable = (isRateLimit || isTransientServer || isNetworkTimeout) && !isPermissionOrNotFound;

      if (isRetryable && attempt <= retries) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[Auto-Reconnect][${contextLabel}] Retrying attempt ${attempt}/${retries} after ${backoff}ms due to: ${message}`
        );
        await new Promise((r) => setTimeout(r, backoff));
      } else {
        throw err;
      }
    }
  }
}

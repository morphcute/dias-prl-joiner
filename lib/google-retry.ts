/**
 * Utility for robust API requests with auto-reconnect, request pacing, and exponential backoff retry.
 * Handles rate limits (429 / 403 Quota Exceeded), server errors (500/502/503/504), and socket timeouts (ECONNRESET/ETIMEDOUT).
 */

// Global request pacer to prevent bursting over Google Sheets' 60 reads/minute per user limit
let lastGoogleRequestTimestamp = 0;
const MIN_REQUEST_INTERVAL_MS = 350; // Smooths requests to safe rate across all calls

/**
 * Throttle requests so we never spam Google Sheets API faster than allowed
 */
export async function paceGoogleRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastGoogleRequestTimestamp;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLast;
    await new Promise((r) => setTimeout(r, waitTime));
  }
  lastGoogleRequestTimestamp = Date.now();
}

/**
 * Sleep helper
 */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 4,
  delayMs = 2000,
  contextLabel = "Google API",
  timeoutMs = 35000
): Promise<T> {
  let attempt = 0;

  while (true) {
    attempt++;
    let timer: NodeJS.Timeout | undefined;
    const currentTimeout = timeoutMs + (attempt - 1) * 5000;

    try {
      // Ensure requests are paced
      await paceGoogleRequest();

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
      const message = String(err?.message || err?.response?.data?.error?.message || err || "");
      const errorList = err?.errors || err?.response?.data?.error?.errors || [];

      // Check if this error is specifically a Google Quota or Rate Limit error
      const isQuotaOrRateLimit =
        status === 429 ||
        /quota/i.test(message) ||
        /rate.*limit/i.test(message) ||
        /userRateLimitExceeded/i.test(message) ||
        /quotaExceeded/i.test(message) ||
        /Read requests per minute per user/i.test(message) ||
        (Array.isArray(errorList) &&
          errorList.some((e: any) =>
            /rateLimit|quota|userRateLimitExceeded|quotaExceeded/i.test(String(e?.reason || ""))
          ));

      // Check for transient server errors
      const isTransientServer =
        (typeof status === "number" && status >= 500 && status <= 599) ||
        message.includes("503") ||
        message.includes("502") ||
        message.includes("500") ||
        message.includes("504") ||
        message.includes("backendError");

      // Check for transient network socket disconnects
      const isNetworkTimeout =
        message.includes("ETIMEDOUT") ||
        message.includes("ECONNRESET") ||
        message.includes("ENOTFOUND") ||
        message.includes("socket hang up") ||
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("network") ||
        message.includes("fetch failed");

      // Check if it's a permanent permission denial or missing document (NOT a quota 403)
      const isPermanentPermissionOrNotFound =
        !isQuotaOrRateLimit &&
        (status === 404 ||
          message.includes("The caller does not have permission") ||
          message.includes("Requested entity was not found") ||
          (status === 403 && !isQuotaOrRateLimit));

      // Retryable conditions: Quota errors ALWAYS take precedence and are retryable!
      const isRetryable =
        (isQuotaOrRateLimit || isTransientServer || isNetworkTimeout) &&
        !isPermanentPermissionOrNotFound;

      // Allow up to 5 attempts for quota exhaustion so the 1-minute window has time to reset
      const effectiveMaxAttempts = isQuotaOrRateLimit ? Math.max(retries, 5) : retries;

      if (isRetryable && attempt <= effectiveMaxAttempts) {
        let backoff: number;

        if (isQuotaOrRateLimit) {
          // Google Sheets per-minute read quota resets across a 60s sliding window
          // Attempt 1: 10s, Attempt 2: 20s, Attempt 3: 35s, Attempt 4: 50s, Attempt 5: 65s
          const quotaCooldowns = [10000, 20000, 35000, 50000, 65000];
          backoff = quotaCooldowns[Math.min(attempt - 1, quotaCooldowns.length - 1)];
          console.warn(
            `[Quota Cooldown][${contextLabel}] Google Sheets API read quota exceeded. Pausing for ${backoff / 1000}s to allow quota window to refill (Attempt ${attempt}/${effectiveMaxAttempts})...`
          );
        } else {
          backoff = delayMs * Math.pow(2, attempt - 1);
          console.warn(
            `[Auto-Reconnect][${contextLabel}] Retrying attempt ${attempt}/${effectiveMaxAttempts} after ${backoff}ms due to: ${message}`
          );
        }

        await delay(backoff);
      } else {
        throw err;
      }
    }
  }
}

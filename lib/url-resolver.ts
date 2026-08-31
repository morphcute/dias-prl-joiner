/**
 * Resolves shortened URLs (tinyurl, bit.ly, gothis.link, cutt.ly, is.gd, rebrand.ly, etc.)
 * to final Google Spreadsheet URLs and extracts spreadsheet IDs.
 */

export interface ResolveResult {
  spreadsheetId: string;
  finalUrl: string;
}

export interface ResolveError {
  error: string;
}

const SPREADSHEET_ID_REGEXES = [
  /\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/i,
  /\/file\/d\/([a-zA-Z0-9-_]+)/i,
  /[?&]id=([a-zA-Z0-9-_]{20,})/i,
  /\/open\?id=([a-zA-Z0-9-_]{20,})/i,
  /\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/i,
];

/**
 * Extract spreadsheet ID from a Google Sheets or Google Drive URL
 */
export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  for (const regex of SPREADSHEET_ID_REGEXES) {
    const match = url.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Resolve a shortened URL by following redirects.
 * Supports tinyurl, bit.ly, gothis.link, cutt.ly, is.gd, rebrandly, and custom shortener services.
 */
export async function resolveUrl(shortUrl: string): Promise<ResolveResult | ResolveError> {
  let url = String(shortUrl ?? "").trim();
  if (!url) return { error: "Empty URL provided" };

  // Check if it's already a direct Google Sheets / Drive URL with an extractable ID
  const directId = extractSpreadsheetId(url);
  if (directId && (url.includes("docs.google.com") || url.includes("drive.google.com"))) {
    return { spreadsheetId: directId, finalUrl: url };
  }

  // Ensure URL has protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    let currentUrl = url;
    let attempts = 0;
    const maxAttempts = 12;

    while (attempts < maxAttempts) {
      attempts++;

      // Check currentUrl on every hop
      const hopId = extractSpreadsheetId(currentUrl);
      if (hopId && (currentUrl.includes("docs.google.com") || currentUrl.includes("drive.google.com"))) {
        return { spreadsheetId: hopId, finalUrl: currentUrl };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        clearTimeout(timeoutId);
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        // Retry once with redirect: "follow" in case cloud proxies reject manual redirects
        try {
          const followRes = await fetch(currentUrl, {
            method: "GET",
            redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
          });
          const followId = extractSpreadsheetId(followRes.url);
          if (followId) {
            return { spreadsheetId: followId, finalUrl: followRes.url };
          }
        } catch (e) {}

        if (fetchErr.name === "AbortError") {
          return { error: `URL resolution timed out after 6s at ${currentUrl}` };
        }
        return { error: `Network error resolving ${currentUrl}: ${fetchErr.message}` };
      }

      // Check for 3xx redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { error: `Redirect with no location header at ${currentUrl}` };
        }

        let nextUrl = location.trim();
        if (nextUrl.startsWith("/")) {
          const urlObj = new URL(currentUrl);
          nextUrl = `${urlObj.protocol}//${urlObj.host}${nextUrl}`;
        }

        const id = extractSpreadsheetId(nextUrl);
        if (id && (nextUrl.includes("docs.google.com") || nextUrl.includes("drive.google.com"))) {
          return { spreadsheetId: id, finalUrl: nextUrl };
        }

        currentUrl = nextUrl;
        continue;
      }

      // Fallback check if response not ok
      if (!response.ok && response.status !== 404) {
        try {
          const followRes = await fetch(currentUrl, {
            method: "GET",
            redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
          });
          const followId = extractSpreadsheetId(followRes.url);
          if (followId) {
            return { spreadsheetId: followId, finalUrl: followRes.url };
          }
        } catch (e) {}
      }

      // Check for 200 OK
      if (response.ok) {
        const finalId = extractSpreadsheetId(currentUrl);
        if (finalId) return { spreadsheetId: finalId, finalUrl: currentUrl };

        const body = await response.text();

        // Check for any Google Sheets / Drive URL in HTML body
        const bodyMatch = body.match(/https:\/\/(?:docs|drive)\.google\.com\/(?:spreadsheets(?:\/u\/\d+)?\/d|file\/d|open\?id=)\/([a-zA-Z0-9-_]+)/i);
        if (bodyMatch) {
          const foundUrl = bodyMatch[0];
          const extracted = extractSpreadsheetId(foundUrl) || bodyMatch[1];
          return { spreadsheetId: extracted, finalUrl: foundUrl };
        }

        // Check for meta refresh redirect
        const metaMatch = body.match(/content=["'][^"']*url=([^"']+)["']/i) || body.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
        if (metaMatch) {
          let nextUrl = metaMatch[1].trim();
          if (nextUrl.startsWith("/")) {
            const urlObj = new URL(currentUrl);
            nextUrl = `${urlObj.protocol}//${urlObj.host}${nextUrl}`;
          }
          const metaId = extractSpreadsheetId(nextUrl);
          if (metaId) return { spreadsheetId: metaId, finalUrl: nextUrl };
          currentUrl = nextUrl;
          continue;
        }

        // Check for JS redirect (location.href = "...", window.location = "...")
        const jsMatch = body.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i) || body.match(/location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i);
        if (jsMatch) {
          let nextUrl = jsMatch[1].trim();
          if (nextUrl.startsWith("/")) {
            const urlObj = new URL(currentUrl);
            nextUrl = `${urlObj.protocol}//${urlObj.host}${nextUrl}`;
          }
          const jsId = extractSpreadsheetId(nextUrl);
          if (jsId) return { spreadsheetId: jsId, finalUrl: nextUrl };
          currentUrl = nextUrl;
          continue;
        }

        return { error: `Resolved to ${currentUrl} but no Google Sheets URL found` };
      }

      return { error: `HTTP ${response.status} when resolving ${currentUrl}` };
    }

    return { error: "Too many redirects" };
  } catch (error: any) {
    return { error: `Failed to resolve URL: ${error.message}` };
  }
}

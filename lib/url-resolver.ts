/**
 * Resolves shortened URLs (tinyurl, bit.ly, gothis.link, etc.)
 * to final Google Spreadsheet URLs and extracts spreadsheet IDs.
 */

export interface ResolveResult {
  spreadsheetId: string;
  finalUrl: string;
}

export interface ResolveError {
  error: string;
}

const SPREADSHEET_ID_REGEX = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

/**
 * Extract spreadsheet ID from a Google Sheets URL
 */
function extractSpreadsheetId(url: string): string | null {
  const match = url.match(SPREADSHEET_ID_REGEX);
  return match ? match[1] : null;
}

/**
 * Resolve a shortened URL by following redirects.
 * Supports tinyurl, bit.ly, gothis.link, and similar services.
 */
export async function resolveUrl(shortUrl: string): Promise<ResolveResult | ResolveError> {
  let url = shortUrl.trim();

  // If it's already a Google Sheets URL, just extract the ID
  if (url.includes("docs.google.com/spreadsheets")) {
    const id = extractSpreadsheetId(url);
    if (id) return { spreadsheetId: id, finalUrl: url };
    return { error: "Could not extract spreadsheet ID from URL" };
  }

  // Ensure URL has protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    // Follow redirects manually to handle various shortener services
    let currentUrl = url;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;

      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      // Check if we got a redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { error: `Redirect with no location header at ${currentUrl}` };
        }

        // Handle relative redirects
        if (location.startsWith("/")) {
          const urlObj = new URL(currentUrl);
          currentUrl = `${urlObj.protocol}//${urlObj.host}${location}`;
        } else {
          currentUrl = location;
        }

        // Check if we've reached a Google Sheets URL
        const id = extractSpreadsheetId(currentUrl);
        if (id) return { spreadsheetId: id, finalUrl: currentUrl };

        continue;
      }

      // If we got a 200, check if the final URL or body contains the Google Sheets URL
      if (response.ok) {
        // Check the current URL first
        const id = extractSpreadsheetId(currentUrl);
        if (id) return { spreadsheetId: id, finalUrl: currentUrl };

        // Some shorteners use JavaScript or meta refresh - try reading the body
        const body = await response.text();
        
        // Look for Google Sheets URLs in the body
        const bodyMatch = body.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (bodyMatch) {
          const finalUrl = bodyMatch[0];
          return { spreadsheetId: bodyMatch[1], finalUrl };
        }

        // Look for meta refresh
        const metaMatch = body.match(/content="[^"]*url=([^"]+)"/i);
        if (metaMatch) {
          currentUrl = metaMatch[1];
          const metaId = extractSpreadsheetId(currentUrl);
          if (metaId) return { spreadsheetId: metaId, finalUrl: currentUrl };
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

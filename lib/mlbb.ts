export interface MlbbVerificationResult {
  success: boolean;
  ign?: string;
  error?: string;
}

// In-memory LRU Cache for MLBB UIDs to avoid duplicate external API calls
const verificationCache = new Map<string, MlbbVerificationResult>();
const MAX_CACHE_SIZE = 2000;

function setCache(key: string, result: MlbbVerificationResult) {
  if (verificationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = verificationCache.keys().next().value;
    if (firstKey) verificationCache.delete(firstKey);
  }
  verificationCache.set(key, result);
}

export async function verifyMlbbId(userId: string, zoneId: string): Promise<MlbbVerificationResult> {
  const cleanUid = userId.trim();
  const cleanZone = zoneId.trim();

  if (!cleanUid || !cleanZone) {
    return { success: false, error: "Missing UID or Zone" };
  }

  const cacheKey = `${cleanUid}_${cleanZone}`;
  if (verificationCache.has(cacheKey)) {
    return verificationCache.get(cacheKey)!;
  }

  const url = "https://moogold.com/wp-content/plugins/id-validation-new/id-validation-ajax.php";

  const payload = new URLSearchParams();
  payload.append("attribute_amount", "Weekly Pass");
  payload.append("text-5f6f144f8ffee", cleanUid);
  payload.append("text-1601115253775", cleanZone);
  payload.append("quantity", "1");
  payload.append("add-to-cart", "15145");
  payload.append("product_id", "15145");
  payload.append("variation_id", "4690783");

  // Attempt request with fast timeout and retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Referer": "https://moogold.com/product/mobile-legends/",
          "Origin": "https://moogold.com",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: payload.toString(),
        signal: AbortSignal.timeout(3500) // Fast 3.5s timeout per attempt
      });

      if (!response.ok) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        const res = { success: false, error: `HTTP ${response.status}` };
        setCache(cacheKey, res);
        return res;
      }

      const text = await response.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch (e) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
        const res = { success: false, error: "Invalid API Response" };
        setCache(cacheKey, res);
        return res;
      }

      if (json && json.message) {
        const lines = json.message.split("\n");
        for (const line of lines) {
          const parts = line.split(":");
          if (parts[0] && parts[0].trim().toLowerCase().indexOf("name") !== -1) {
            const name = parts.slice(1).join(":").trim();
            const res = { success: true, ign: name };
            setCache(cacheKey, res);
            return res;
          }
        }
      }

      const res = { success: false, error: "Player not found" };
      setCache(cacheKey, res);
      return res;

    } catch (error: any) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      const res = { success: false, error: error.name === "TimeoutError" ? "Timeout" : "Connection Error" };
      setCache(cacheKey, res);
      return res;
    }
  }

  return { success: false, error: "Failed verification" };
}

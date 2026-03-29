export interface MlbbVerificationResult {
  success: boolean;
  ign?: string;
  error?: string;
}

export async function verifyMlbbId(userId: string, zoneId: string): Promise<MlbbVerificationResult> {
  const url = "https://moogold.com/wp-content/plugins/id-validation-new/id-validation-ajax.php";

  const payload = new URLSearchParams();
  payload.append("attribute_amount", "Weekly Pass");
  payload.append("text-5f6f144f8ffee", userId);
  payload.append("text-1601115253775", zoneId);
  payload.append("quantity", "1");
  payload.append("add-to-cart", "15145");
  payload.append("product_id", "15145");
  payload.append("variation_id", "4690783");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Referer": "https://moogold.com/product/mobile-legends/",
        "Origin": "https://moogold.com",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: payload.toString()
    });

    if (!response.ok) {
      return { success: false, error: `HTTP Error: ${response.status}` };
    }

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { success: false, error: "Invalid JSON response" };
    }

    if (json && json.message) {
      const lines = json.message.split("\n");
      for (const line of lines) {
        const parts = line.split(":");
        if (parts[0] && parts[0].trim().toLowerCase().indexOf("name") !== -1) {
          const name = parts.slice(1).join(":").trim();
          return { success: true, ign: name };
        }
      }
    }

    return { success: false, error: "Player not found" };

  } catch (error: any) {
    console.error("MLBB Verification Error:", error);
    return { success: false, error: error.message };
  }
}

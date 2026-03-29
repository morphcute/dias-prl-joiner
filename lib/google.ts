import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export const getUserAuth = async (userId: string) => {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account) {
    throw new Error("No Google account found for user");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  oauth2Client.on("tokens", async (tokens) => {
    try {
      await prisma.account.update({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
        },
        data: {
          access_token: tokens.access_token ?? account.access_token,
          refresh_token: tokens.refresh_token ?? account.refresh_token,
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : account.expires_at,
        },
      });
    } catch (error) {
      console.error("Failed to persist refreshed Google tokens:", error);
    }
  });

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  try {
    await oauth2Client.getAccessToken();
  } catch (error: any) {
    const reason = error?.response?.data?.error || error?.message || "";
    if (/invalid_grant/i.test(String(reason))) {
      throw new Error("Google authorization expired or revoked. Please sign out and sign in again.");
    }
    throw error;
  }

  return oauth2Client;
};

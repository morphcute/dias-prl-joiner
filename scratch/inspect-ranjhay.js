const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resolveUrl(shortUrl) {
  let url = String(shortUrl || "").trim();
  if (!url.startsWith("http")) url = "https://" + url;
  try {
    let currentUrl = url;
    for (let i = 0; i < 10; i++) {
      const match = currentUrl.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/i);
      if (match) return { spreadsheetId: match[1], finalUrl: currentUrl };
      const res = await fetch(currentUrl, { method: "GET", redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) break;
        currentUrl = loc.startsWith("/") ? new URL(currentUrl).origin + loc : loc;
        continue;
      }
      break;
    }
  } catch (e) {}
  return { error: "Not found" };
}

async function run() {
  const user = await prisma.user.findFirst();
  const account = await prisma.account.findFirst({ where: { userId: user.id } });
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: account.access_token });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await resolveUrl('https://bit.ly/DIYPRL');
  console.log('Ranjhay Resolved:', res);
  if (res.spreadsheetId) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: res.spreadsheetId });
    console.log('Tabs in Ranjhay:');
    meta.data.sheets.forEach((s, idx) => {
      console.log(`[${idx}] "${s.properties.title}" (id: ${s.properties.sheetId}, hidden: ${s.properties.hidden || false})`);
    });

    for (const s of meta.data.sheets) {
      const t = s.properties.title;
      const v = await sheets.spreadsheets.values.get({ spreadsheetId: res.spreadsheetId, range: `'${t}'!A1:Z10` });
      console.log(`Tab '${t}' rows:`, v.data.values?.length || 0, 'Row 1:', JSON.stringify(v.data.values?.[0]));
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

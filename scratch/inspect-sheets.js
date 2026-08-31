const path = require('path');
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
      if (res.ok) {
        const body = await res.text();
        const bMatch = body.match(/https:\/\/(?:docs|drive)\.google\.com\/(?:spreadsheets(?:\/u\/\d+)?\/d|file\/d|open\?id=)\/([a-zA-Z0-9-_]+)/i);
        if (bMatch) return { spreadsheetId: bMatch[1], finalUrl: bMatch[0] };
        break;
      }
      break;
    }
  } catch (e) {
    return { error: e.message };
  }
  return { error: "Not found" };
}

async function run() {
  const user = await prisma.user.findFirst();
  const account = await prisma.account.findFirst({ where: { userId: user.id } });
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: account.access_token });
  const sheets = google.sheets({ version: 'v4', auth });

  const list = [
    { name: 'Pitts', url: 'https://tinyurl.com/bddppwe7' },
    { name: 'Angela', url: 'https://tinyurl.com/3hsn4kz4' },
    { name: 'Hersh', url: 'https://tinyurl.com/3uwyemvy' },
    { name: 'Dan', url: 'https://tinyurl.com/45wuhvpe' },
    { name: 'MadamBridgette', url: 'https://tinyurl.com/3r24eyu9' },
    { name: 'Sevvyy', url: 'https://tinyurl.com/2026DIYPRL' },
    { name: 'Apol', url: 'https://bit.ly/090526PreReq' },
    { name: 'RAPPY', url: 'https://tinyurl.com/43crw48r' },
    { name: 'Aecer', url: 'https://tinyurl.com/3xf9868n' },
    { name: 'Franky', url: 'https://tinyurl.com/422dc89a' },
    { name: 'Sonichi', url: 'https://tinyurl.com/447du4xf' },
  ];

  for (const item of list) {
    console.log('\n=== Checking ' + item.name + ' ===');
    const res = await resolveUrl(item.url);
    console.log('Resolve:', JSON.stringify(res));
    if (res.spreadsheetId) {
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: res.spreadsheetId });
        console.log('Tabs:', meta.data.sheets.map(s => s.properties.title + ' (id: ' + s.properties.sheetId + ')'));
        const tab = meta.data.sheets[0].properties.title;
        const vals = await sheets.spreadsheets.values.get({ spreadsheetId: res.spreadsheetId, range: `'${tab}'!A1:Z50` });
        const rows = vals.data.values || [];
        console.log(`Row count in tab '${tab}':`, rows.length);
        if (rows.length > 0) {
          console.log('Row 1:', JSON.stringify(rows[0]));
          if (rows.length > 1) console.log('Row 2:', JSON.stringify(rows[1]));
          if (rows.length > 2) console.log('Row 3:', JSON.stringify(rows[2]));
        }
      } catch (err) {
        console.log('Read Error:', err.message);
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

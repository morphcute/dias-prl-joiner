const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findFirst();
  const account = await prisma.account.findFirst({ where: { userId: user.id } });
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: account.access_token });
  const sheets = google.sheets({ version: 'v4', auth });

  const ids = [
    { name: 'MadamBridgette', id: '1WvCFo1AqNN1b1DPOhjaP5g7KzbrjpfyY6x0RjGBn2g8', tab: '09/05/26' },
    { name: 'Sevvyy', id: '1ZfuDQjyUBrxap18XgsOTCxuFDA1IT2JA0-V_EDB8f58', tab: '09/05/26' },
    { name: 'Franky', id: '1DT5cMvKaKgXrpHoBkk1aMZeXx5ZBCxolp53WRoSnBbc' },
    { name: 'Sonichi', id: '134vL794izVnzHbgS-TjrBhrDm7YrTj5luf4TjfasAoc' },
  ];

  for (const item of ids) {
    console.log('\n=== ' + item.name + ' ===');
    const meta = await sheets.spreadsheets.get({ spreadsheetId: item.id });
    console.log('Tabs:', meta.data.sheets.map(s => s.properties.title + ' (id: ' + s.properties.sheetId + ')'));
    for (const sheet of meta.data.sheets) {
      const title = sheet.properties.title;
      const vals = await sheets.spreadsheets.values.get({ spreadsheetId: item.id, range: `'${title}'!A1:Z60` });
      const rows = vals.data.values || [];
      console.log(`Tab '${title}' rows:`, rows.length);
      if (rows.length > 2) {
        console.log('  Row 1:', JSON.stringify(rows[0]));
        console.log('  Row 2:', JSON.stringify(rows[1]));
        console.log('  Row 3:', JSON.stringify(rows[2]));
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

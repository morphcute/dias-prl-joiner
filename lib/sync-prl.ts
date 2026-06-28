import { prisma } from "@/lib/prisma";
import { JoinerJob } from "@prisma/client";
import { google } from "googleapis";
import { getUserAuth } from "./google";
import { resolveUrl, ResolveResult } from "./url-resolver";
import { verifyMlbbId } from "./mlbb";
import { isFormulaOrError, adjustColumnsBasedOnData, detectReportingSheetColumns } from "./validations";

interface ChError {
  chName: string;
  error: string;
  type?: string;
}

/**
 * Read CH entries from the reporting sheet.
 * Column D (col letter D) = CH Nickname
 * Link column = PRL Link (col X, index 23) or Diamond Link (col M, index 12)
 * Starting from row 4.
 * Only include CHs that have a valid URL in the link column (skip DISSOLVED, empty, no event).
 *
 * Uses batchGet with separate ranges for Column D and the link column
 * to avoid ragged array issues with the Sheets API.
 */
interface ChEntry {
  chName: string;
  url: string;
  responseSheetUrl?: string;
  registeredTeams?: string;
}

async function readChEntriesFromReportingSheet(
  sheets: any,
  spreadsheetId: string,
  sheetName: string,
  type: "prl" | "diamonds"
): Promise<{ entries: ChEntry[]; errors: ChError[] }> {
  const entries: ChEntry[] = [];
  const errors: ChError[] = [];

  // Fetch the entire active area of the reporting sheet
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A1:AZ`,
  });

  const rows = result.data.values || [];
  if (rows.length === 0) {
    errors.push({ chName: "Reporting Sheet", error: "Reporting sheet is blank", type: "accessibility" });
    return { entries, errors };
  }

  // Detect columns dynamically
  const { nicknameCol, linkCol, responseSheetCol, registeredTeamsCol, headerRowIdx } = detectReportingSheetColumns(rows, type);

  if (nicknameCol === -1 || linkCol === -1) {
    const missing = nicknameCol === -1 ? (linkCol === -1 ? "CH Nickname and Link" : "CH Nickname") : "Link";
    errors.push({
      chName: "Reporting Sheet",
      error: `Could not find column for ${missing} in headers. Checked first 10 rows.`,
      type: "accessibility"
    });
    return { entries, errors };
  }

  console.log(`[ReportingSheet] Tab: "${sheetName}", Nickname Col Index: ${nicknameCol}, Link Col Index: ${linkCol}, Response Sheet Col Index: ${responseSheetCol}, Registered Teams Col Index: ${registeredTeamsCol}, Header Row Index: ${headerRowIdx}`);

  // Extract entries starting from the row after headers
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const chNickname = String(row[nicknameCol] ?? "").trim();
    const link = String(row[linkCol] ?? "").trim();

    if (!chNickname) continue;

    // Skip if no link, dissolved, or no event
    if (
      !link ||
      link.toUpperCase() === "DISSOLVED" ||
      link.toUpperCase().includes("NO EVENT") ||
      link.toUpperCase() === "EVENT" ||
      (!link.startsWith("http") && !link.startsWith("www"))
    ) {
      continue;
    }

    const responseSheetUrl = responseSheetCol !== -1 ? String(row[responseSheetCol] ?? "").trim() : "";
    const registeredTeams = registeredTeamsCol !== -1 ? String(row[registeredTeamsCol] ?? "").trim() : "";

    entries.push({ 
      chName: chNickname, 
      url: link,
      responseSheetUrl,
      registeredTeams
    });
  }

  console.log(`[ReportingSheet] Found ${entries.length} valid CH entries with links dynamically`);

  return { entries, errors };
}


export async function syncPrl(job: JoinerJob, runId: string) {
  console.log(`[PRL] Starting sync for job ${job.id} (${job.name})`);

  const updateProgress = async (percentage: number, message?: string) => {
    try {
      await prisma.joinerRun.update({
        where: { id: runId },
        data: {
          progress: Math.min(Math.max(percentage, 0), 100),
          progressMessage: message,
        },
      });
    } catch (e) {
      console.error("Failed to update progress:", e);
    }
  };

  if (!job.userId) throw new Error("Job must belong to a user");
  if (!job.targetSpreadsheetId) throw new Error("Missing target spreadsheet ID");

  const authClient = await getUserAuth(job.userId);
  const sheets = google.sheets({ version: "v4", auth: authClient });

  const errors: ChError[] = [];
  const chStats: { chName: string; count: number }[] = [];
  const allRows: string[][] = [];
  const duplicateRowIndices: number[] = [];
  const seenUids = new Map<string, { chName: string; rowIdx: number }>();

  // Header: CH, Players Name, Players IGN, Server, UID (NO "No." column)
  const HEADER = ["CH", "Players Name", "Players IGN", "Server", "UID"];
  if (job.validationEnabled) {
    HEADER.push("Status");
  }

  await updateProgress(2, "Reading reporting sheet...");

  // Step 1: Read CH entries from reporting sheet
  // The job's spreadsheetId is the reporting sheet
  // We need to find the correct tab
  const reportingSpreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: (job as any).spreadsheetId,
  });

  // Find the tab - use the sheetGid if available, otherwise use provided tab name or first tab
  let reportingTabName: string;
  if ((job as any).reportingSheetGid) {
    const targetTab = reportingSpreadsheet.data.sheets?.find(
      (s: any) => String(s.properties?.sheetId) === String((job as any).reportingSheetGid)
    );
    reportingTabName = targetTab?.properties?.title || reportingSpreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
  } else {
    reportingTabName = reportingSpreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
  }

  console.log(`[PRL] Tab: "${reportingTabName}", Mode: ${(job as any).gameMode || "5v5"}`);

  const { entries: chEntries, errors: reportingErrors } = await readChEntriesFromReportingSheet(
    sheets, (job as any).spreadsheetId, reportingTabName, "prl"
  );
  
  if (reportingErrors && reportingErrors.length > 0) {
    errors.push(...reportingErrors);
  }

  if (chEntries.length === 0) {
    await prisma.joinerRun.update({
      where: { id: runId },
      data: { errors: JSON.stringify(errors) },
    });
    return { rowsWritten: 0, success: true, errors };
  }

  const totalCh = chEntries.length;
  await updateProgress(5, `Found ${totalCh} CHs with PRL links. Resolving URLs...`);

  // Step 2: Resolve all URLs
  const resolvedEntries: { 
    chName: string; 
    spreadsheetId: string; 
    responseSheetUrl?: string; 
    registeredTeams?: string; 
  }[] = [];

  for (let i = 0; i < chEntries.length; i++) {
    const ch = chEntries[i];
    const pct = 5 + Math.floor((i / totalCh) * 15);
    await updateProgress(pct, `Resolving URLs: ${i + 1}/${totalCh} (${ch.chName})`);

    // Check if run was stopped by user
    const currentRun = await prisma.joinerRun.findUnique({
      where: { id: runId },
      select: { status: true }
    });
    if (currentRun && currentRun.status === "failed") {
      console.log(`[PRL] Job run ${runId} was stopped by user. Aborting URL resolution...`);
      return { rowsWritten: 0, success: false, errors };
    }

    const result = await resolveUrl(ch.url);
    if ("error" in result) {
      errors.push({ chName: ch.chName, error: `URL Resolution Failed: ${result.error}` });
      continue;
    }

    resolvedEntries.push({ 
      chName: ch.chName, 
      spreadsheetId: (result as ResolveResult).spreadsheetId,
      responseSheetUrl: ch.responseSheetUrl,
      registeredTeams: ch.registeredTeams
    });
  }

  const getRegisteredTeamsCount = async (chEntry: any) => {
    let responseCount: number | null = null;
    let responseError: string | null = null;

    if (chEntry.responseSheetUrl) {
      try {
        const resResult = await resolveUrl(chEntry.responseSheetUrl);
        if (!("error" in resResult)) {
          const resSpreadsheetId = (resResult as ResolveResult).spreadsheetId;
          const resSheet = await sheets.spreadsheets.values.get({
            spreadsheetId: resSpreadsheetId,
            range: "A1:Z100",
          });
          const resRows = resSheet.data.values || [];
          if (resRows.length > 0) {
            responseCount = Math.max(0, resRows.length - 1);
          } else {
            responseCount = 0;
          }
        } else {
          responseError = "Invalid Link";
        }
      } catch (e: any) {
        console.log(`Failed to read response sheet for ${chEntry.chName}:`, e);
        const msg = e?.message || String(e);
        if (msg.includes("403") || msg.includes("permission")) {
          responseError = "Private (Verify Link Sharing)";
        } else if (msg.includes("404") || msg.includes("not found")) {
          responseError = "Sheet Not Found";
        } else {
          responseError = "Inaccessible";
        }
      }
    }

    let fallbackCount: number | null = null;
    if (chEntry.registeredTeams) {
      const parsed = parseInt(chEntry.registeredTeams.replace(/\D/g, ""));
      if (!isNaN(parsed)) {
        fallbackCount = parsed;
      }
    }

    if (responseCount !== null) {
      return { count: String(responseCount), source: "sheet" };
    }
    if (fallbackCount !== null) {
      return { count: String(fallbackCount), source: "fallback" };
    }
    if (responseError) {
      return { count: responseError, source: "error" };
    }
    return { count: "0", source: "none" };
  };

  // Step 3: Read each CH's PRL sheet
  await updateProgress(20, "Reading CH PRL sheets...");

  for (let i = 0; i < resolvedEntries.length; i++) {
    const { chName, spreadsheetId } = resolvedEntries[i];
    const pct = 20 + Math.floor((i / resolvedEntries.length) * 40);
    await updateProgress(pct, `Reading CHs: ${i + 1}/${resolvedEntries.length} (${chName})`);

    // Check if run was stopped by user
    const currentRun = await prisma.joinerRun.findUnique({
      where: { id: runId },
      select: { status: true }
    });
    if (currentRun && currentRun.status === "failed") {
      console.log(`[PRL] Job run ${runId} was stopped by user. Aborting sheet reading...`);
      return { rowsWritten: 0, success: false, errors };
    }

    // Rate limiter: Wait 200ms between CH sheet fetches to avoid spamming Sheets API
    if (i > 0) {
      await new Promise((res) => setTimeout(res, 200));
    }

    try {
      // Read a broader range to dynamically detect headers with exponential backoff for rate limits
      let data: any = null;
      let retries = 0;
      while (retries < 3) {
        try {
          data = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "A1:Z",
          });
          break; // success
        } catch (e: any) {
          if (e.message && e.message.includes("Quota exceeded") && retries < 2) {
            retries++;
            const waitTime = retries * 8000; // wait 8s, then 16s
            console.log(`[PRL] Quota exceeded on ${chName}. Retrying in ${waitTime}ms... (Attempt ${retries}/2)`);
            await new Promise((res) => setTimeout(res, waitTime));
          } else {
            throw e; // Break while loop and trigger outer try/catch
          }
        }
      }

      const rows = data.data.values;
      if (!rows || rows.length === 0) {
        const teamsRes = await getRegisteredTeamsCount(resolvedEntries[i]);
        let teamsMessage = "";
        if (teamsRes.count !== "0" || teamsRes.source === "error") {
          teamsMessage = `.(Teams in responses sheet: ${teamsRes.count})`;
        }
        errors.push({ chName, error: `Sheet is blank or missing data${teamsMessage}` });
        continue;
      }

      // Find header row by looking for NAME/SERVER/UID columns
      let headerRowIdx = -1;
      let nameCol = -1, ignCol = -1, serverCol = -1, uidCol = -1;

      for (let r = 0; r < Math.min(rows.length, 30); r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] ?? "").trim().toUpperCase();
          if (val === "") continue;

          if ((val.includes("NAME") || val.includes("PLAYER")) && !val.includes("IGN") && !val.includes("GAME")) {
            nameCol = c;
          } else if (val === "IGN" || val.includes("IGN") || val.includes("GAME NAME")) {
            ignCol = c;
          } else if (val === "SERVER" || val.includes("SERVER")) {
            serverCol = c;
          } else if (val === "UID" || val.includes("UID") || val.includes("USER ID") || val === "ID") {
            uidCol = c;
          }
        }
        if (nameCol !== -1 && serverCol !== -1 && uidCol !== -1) {
          headerRowIdx = r;
          break;
        }
        nameCol = -1; ignCol = -1; serverCol = -1; uidCol = -1;
      }

      if (headerRowIdx === -1 || nameCol === -1) {
        errors.push({ chName, error: "Could not find header row with NAME/SERVER/UID columns", type: "accessibility" });
        continue;
      }

      // Run dynamic column correction based on data analysis
      const adjusted = adjustColumnsBasedOnData(rows, headerRowIdx, {
        nameCol,
        ignCol,
        serverCol,
        uidCol
      });
      
      if (adjusted.corrected) {
        nameCol = adjusted.nameCol;
        ignCol = adjusted.ignCol;
        serverCol = adjusted.serverCol;
        uidCol = adjusted.uidCol;
        errors.push({
          chName,
          error: "Auto-corrected column mapping: columns were misaligned in headers",
          type: "validation_fixed"
        });
      }

      let validRowCount = 0;
      let chHeaderAdded = false;

      // Extract data rows
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        let name = String(row[nameCol] ?? "").trim();
        let ign = ignCol !== -1 ? String(row[ignCol] ?? "").trim() : "";
        let server = String(row[serverCol] ?? "").trim();
        let uid = String(row[uidCol] ?? "").trim();

        if (!name && !uid) continue;

        // Skip formula placeholder rows and spreadsheet errors
        if (isFormulaOrError(name) || isFormulaOrError(server) || isFormulaOrError(uid) || (ignCol !== -1 && isFormulaOrError(ign))) {
          continue;
        }

        const upperName = name.toUpperCase();
        // Skip rows that look like "TOTAL" or header rows
        if (upperName === "TOTAL" || upperName === "TOTALS") continue;
        if (upperName.includes("PLAYER") || upperName === "NAME" || upperName === "IGN") continue;

        // Handle shifted columns for individual players who misaligned their inputs (C=IGN vs C=Server)

        // Pre-parse mixed IDs e.g. "243906066 (3533)" into separate nums
        const parseMixedId = (str: string) => {
          const nums = str.match(/\d+/g);
          if (nums && nums.length >= 2) {
            const n1 = nums[0];
            const n2 = nums[1];
            if (n1.length > 5 && n2.length <= 6) return { u: n1, s: n2 };
            if (n2.length > 5 && n1.length <= 6) return { u: n2, s: n1 };
          }
          return null;
        };

        const isValidServerVal = (str: string) => {
          const clean = str.trim().replace(/\D/g, "");
          return clean.length >= 3 && clean.length <= 6;
        };

        const isValidUidVal = (str: string) => {
          const clean = str.trim().replace(/\D/g, "");
          return clean.length >= 7 && clean.length <= 12;
        };

        // Report spaces or formatting in raw inputs
        if (uid && /\s/.test(uid)) {
          errors.push({ chName, error: `UID contains spaces for player ${name} (Input: '${uid}')` });
        }
        if (server && /\s/.test(server)) {
          errors.push({ chName, error: `Server contains spaces for player ${name} (Input: '${server}')` });
        }

        const mUid = !isValidServerVal(server) ? parseMixedId(uid) : null;
        const mServer = !isValidUidVal(uid) ? parseMixedId(server) : null;
        const mIgn = ignCol !== -1 && !isValidServerVal(server) && !isValidUidVal(uid) ? parseMixedId(ign) : null;

        if (mUid) {
          uid = mUid.u;
          server = mUid.s;
          errors.push({ chName, error: `Mixed Server/UID extracted for player ${name} (Server: ${server}, UID: ${uid})`, type: "validation_fixed" });
        } else if (mServer) {
          // Col D has mixed. In 4-col this is UID column.
          uid = mServer.u;
          if (ign.length <= 6 && /^\d+$/.test(ign)) {
            server = ign;
            ign = "";
          } else {
            server = mServer.s;
          }
          errors.push({ chName, error: `Mixed Server/UID extracted for player ${name} (Server: ${server}, UID: ${uid})`, type: "validation_fixed" });
        } else if (mIgn) {
          // Col C has mixed. In 4-col this is SERVER column. Interchanged + Mixed!
          uid = mIgn.u;
          server = mIgn.s;
          ign = "";
          // Auto-fixed interchanged and mixed ID, no error thrown
        }

        const ignIsNum = /^-?\d+$/.test(ign);
        const serverIsNum = /^-?\d+$/.test(server);

        if (!uid && ignIsNum && serverIsNum) {
          const ignNumLen = ign.replace("-", "").length;
          const srvNumLen = server.replace("-", "").length;

          if (ignNumLen <= 6 && srvNumLen > 5) {
            // Valid shifted: C=Server, D=UID
            uid = server;
            server = ign;
            ign = "";
          } else if (ignNumLen > 5 && srvNumLen <= 6) {
            // Interchanged shifted: C=UID, D=Server
            uid = ign;
            // server stays in D
            ign = "";
            // Auto-fixed interchanged IDs, no error thrown
          } else {
            // Catch-all: BOTH are short (user entered server twice) or both are long. Still shifted!
            uid = server;
            server = ign;
            ign = "";
            if (ignNumLen <= 6 && srvNumLen <= 6) {
              errors.push({ chName, error: `Server entered in UID column for player ${name} (Server: ${server}, UID: ${uid})` });
            }
          }
        }

        // Check for negative values (System Fault)
        if (server.includes("-") || uid.includes("-")) {
          errors.push({ chName, error: `Negative sign detected for player ${name} (Raw Server: ${server}, Raw UID: ${uid})` });
        }

        // Detect if letters or the IGN were placed in the Server column BEFORE stripping
        const rawServer = server;
        const hasTextInServer = rawServer && /[a-zA-Z]/.test(rawServer);
        if (hasTextInServer) {
          if (ign && rawServer.toLowerCase() === ign.toLowerCase()) {
            errors.push({ chName, error: `Added Players IGN instead of Server for player ${name}` });
          } else {
            errors.push({ chName, error: `Added text instead of numerical Server for player ${name} (Input: '${rawServer}')` });
          }
        }

        // Clean up any remaining non-digits (like minus signs, spaces, or letters)
        server = server.replace(/\D/g, "");
        uid = uid.replace(/\D/g, "");

        // Validation: Missing Server or UID
        if (!server || !uid) {
          const playerName = name || ign || "Unknown";
          // Only throw 'Missing' if we haven't already explained why it's missing (e.g., they put text there)
          if (!hasTextInServer) {
            errors.push({ chName, error: `Missing Server or UID for player ${playerName} (Server: '${server || "BLANK"}', UID: '${uid || "BLANK"}')` });
          }
        }

        let sLen = server.length;
        let uLen = uid.length;

        // Validation: Swapped server/UID in 4-column setup
        if (sLen > 5 && uLen > 0 && uLen < 6) {
          // Auto-swap silently
          const temp = server;
          server = uid;
          uid = temp;
          sLen = server.length;
          uLen = uid.length;
        }

        // Validation: Check for unusually short UIDs indicating Server-only entry
        if (uLen > 0 && uLen <= 5) {
          errors.push({ chName, error: `Missing UID because the CH type ${uLen} numbers only for player ${name}` });
        }

        if (sLen > 5 && !uid) {
          errors.push({ chName, error: `Server length is unusually long for player ${name} (Server: ${server})` });
        }

        let isDuplicate = false;
        if (uid && server) {
          const uniquePlayerIdentifier = `${server}-${uid}`;
          if (seenUids.has(uniquePlayerIdentifier)) {
            isDuplicate = true;
            const prevCh = seenUids.get(uniquePlayerIdentifier)!;
            errors.push({ chName, error: `Duplicate player entry found: ${name} (Server: ${server}, UID: ${uid}) was already registered in CH ${prevCh.chName}` });

            // Push the first occurrence index to the list so BOTH get highlighted!
            if (!duplicateRowIndices.includes(prevCh.rowIdx)) {
              duplicateRowIndices.push(prevCh.rowIdx);
            }
          } else {
            // Track the row index that this player will occupy in the final sheet
            seenUids.set(uniquePlayerIdentifier, { chName, rowIdx: 1 + allRows.length });
          }
        }

        const rowData = [!chHeaderAdded ? `CH ${chName}` : "", name, ign, server, uid];
        if (job.validationEnabled) {
          rowData.push("");
        }

        if (isDuplicate) {
          // Store the 0-based index of this row within the final sheet
          // 1 (header) + allRows.length = current row index
          duplicateRowIndices.push(1 + allRows.length);
        }

        allRows.push(rowData);
        chHeaderAdded = true;
        validRowCount++;
      }

      chStats.push({ chName, count: validRowCount });

      // Determine Validation Thresholds based on mode
      const gameModeStr = (job as any).gameMode || "5v5";
      const isOnsite = gameModeStr === "Onsite 5v5";
      const gameModeMult = parseInt(gameModeStr.charAt(0)) || 5;

      const minPlayers = isOnsite ? 25 : 10 * gameModeMult;
      const requiredThreshold = Math.max(1, minPlayers - 4); // Allow up to 4 players to have failed/missing entries

      if (validRowCount < requiredThreshold) {
        const teamsRes = await getRegisteredTeamsCount(resolvedEntries[i]);
        let teamsMessage = "";
        if (teamsRes.count !== "0" || teamsRes.source === "error") {
          teamsMessage = `.(Teams in responses sheet: ${teamsRes.count})`;
        }
        errors.push({ chName, error: `Dissolved Tournament: only ${validRowCount} valid players found (Mode: ${gameModeStr}, Target: ${minPlayers}, Minimum allowed: ${requiredThreshold})${teamsMessage}` });
      }

    } catch (error: any) {
      const msg = error?.message || String(error);
      const teamsRes = await getRegisteredTeamsCount(resolvedEntries[i]);
      let teamsMessage = "";
      if (teamsRes.count !== "0" || teamsRes.source === "error") {
        teamsMessage = `.(Teams in responses sheet: ${teamsRes.count})`;
      }
      if (msg.includes("403") || msg.includes("not found") || msg.includes("permission")) {
        errors.push({ chName, error: `Sheet is not publicly accessible (403). CH needs to set sharing to 'Anyone with the link'.${teamsMessage}` });
      } else if (msg.includes("404")) {
        errors.push({ chName, error: `Sheet not found (404). The spreadsheet may have been deleted.${teamsMessage}` });
      } else {
        errors.push({ chName, error: `Error reading sheet: ${msg}${teamsMessage}` });
      }
    }
  }

  // Step 4: Optional MooGold verification
  if (job.validationEnabled && allRows.length > 0) {
    await updateProgress(60, "Verifying IDs with MooGold...");
    const statusColIdx = HEADER.length - 1;
    const BATCH_SIZE = 5;

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (row) => {
        const server = row[3]; // Server
        const uid = row[4]; // UID
        // Skip the CH header rows which have empty UID
        if (server && uid && row[0] === "") {
          try {
            const result = await verifyMlbbId(uid, server);
            if (result.success && result.ign) {
              row[2] = result.ign; // Update IGN with verified name
              row[statusColIdx] = "Verified";
            } else if (result.error === "Player not found") {
              row[statusColIdx] = "Not Found";
            } else {
              row[statusColIdx] = "Error";
            }
          } catch {
            row[statusColIdx] = "Error";
          }
        }
      }));

      const pct = 60 + Math.floor(((i + batch.length) / allRows.length) * 25);
      await updateProgress(pct, `Verifying: ${Math.min(i + BATCH_SIZE, allRows.length)}/${allRows.length}`);
      await new Promise(r => setTimeout(r, 600));
    }
  }

  // Step 5: Write to target sheet
  await updateProgress(90, "Writing consolidated PRL data...");

  const targetId = job.targetSpreadsheetId;
  const TAB_NAME = job.sheetName || "Pre Registered List";
  const finalRows = [HEADER, ...allRows];

  const targetSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId: targetId });
  let targetSheet = targetSpreadsheet.data.sheets?.find((s: any) => s.properties?.title === TAB_NAME);
  let targetSheetId: number;

  if (!targetSheet) {
    const sheet1 = targetSpreadsheet.data.sheets?.find((s: any) => s.properties?.title === "Sheet1");
    if (sheet1) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: sheet1.properties?.sheetId, title: TAB_NAME },
              fields: "title",
            },
          }],
        },
      });
      targetSheetId = sheet1.properties?.sheetId || 0;
    } else {
      const createResp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetId,
        requestBody: { requests: [{ addSheet: { properties: { title: TAB_NAME } } }] },
      });
      targetSheetId = createResp.data.replies?.[0].addSheet?.properties?.sheetId || 0;
    }
  } else {
    targetSheetId = targetSheet.properties?.sheetId || 0;
  }

  const endCol = job.validationEnabled ? "F" : "E";
  await sheets.spreadsheets.values.clear({
    spreadsheetId: targetId,
    range: `'${TAB_NAME}'!A:${endCol}`,
  });

  if (finalRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: targetId,
      range: `'${TAB_NAME}'!A1:${endCol}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: finalRows },
    });
  }

  // Step 6: Apply formatting
  await updateProgress(95, "Applying formatting...");
  const colCount = HEADER.length;
  const requests: any[] = [];

  requests.push({
    updateSheetProperties: {
      properties: { sheetId: targetSheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  });

  requests.push({
    repeatCell: {
      range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.11, green: 0.13, blue: 0.22 },
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
    },
  });

  requests.push({
    repeatCell: {
      range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: finalRows.length, startColumnIndex: 0, endColumnIndex: colCount },
      cell: {
        userEnteredFormat: {
          borders: {
            top: { style: "SOLID", color: { red: 0.85, green: 0.85, blue: 0.85 } },
            bottom: { style: "SOLID", color: { red: 0.85, green: 0.85, blue: 0.85 } },
            left: { style: "SOLID", color: { red: 0.85, green: 0.85, blue: 0.85 } },
            right: { style: "SOLID", color: { red: 0.85, green: 0.85, blue: 0.85 } },
          },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
          textFormat: { fontSize: 10 },
        },
      },
      fields: "userEnteredFormat(borders,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat.fontSize)",
    },
  });

  // CH Header formatting loop (highlight rows starting with "CH ")
  for (let r = 1; r <= finalRows.length; r++) {
    const isChHeader = finalRows[r - 1]?.[0]?.toString().startsWith("CH ");
    if (isChHeader) {
      requests.push({
        repeatCell: {
          range: { sheetId: targetSheetId, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: 0, endColumnIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.9, green: 0.9, blue: 0.98 },
              textFormat: { bold: true, foregroundColor: { red: 0.1, green: 0.1, blue: 0.4 } }
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat(bold,foregroundColor))",
        },
      });
    }
  }

  // Highlight duplicate rows in pink/reddish color
  for (const dupIdx of duplicateRowIndices) {
    requests.push({
      repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: dupIdx, endRowIndex: dupIdx + 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 0.85, blue: 0.85 },
            textFormat: { foregroundColor: { red: 0.6, green: 0.1, blue: 0.1 }, bold: true }
          }
        },
        fields: "userEnteredFormat(backgroundColor,textFormat(foregroundColor,bold))",
      },
    });
  }

  if (job.validationEnabled) {
    const statusCol = colCount - 1;
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: targetSheetId, startRowIndex: 1, endRowIndex: finalRows.length, startColumnIndex: statusCol, endColumnIndex: statusCol + 1 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "Verified" }] },
            format: { backgroundColor: { red: 0.85, green: 0.95, blue: 0.87 }, textFormat: { foregroundColor: { red: 0.1, green: 0.45, blue: 0.2 }, bold: true } },
          },
        },
        index: 0,
      },
    });
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: targetSheetId, startRowIndex: 1, endRowIndex: finalRows.length, startColumnIndex: statusCol, endColumnIndex: statusCol + 1 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "Not Found" }] },
            format: { backgroundColor: { red: 0.98, green: 0.86, blue: 0.86 }, textFormat: { foregroundColor: { red: 0.7, green: 0.15, blue: 0.15 }, bold: true } },
          },
        },
        index: 1,
      },
    });
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: targetSheetId, startRowIndex: 1, endRowIndex: finalRows.length, startColumnIndex: statusCol, endColumnIndex: statusCol + 1 }],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "Error" }] },
            format: { backgroundColor: { red: 1, green: 0.95, blue: 0.8 }, textFormat: { foregroundColor: { red: 0.6, green: 0.4, blue: 0 }, bold: true } },
          },
        },
        index: 2,
      },
    });
  }

  requests.push({
    autoResizeDimensions: {
      dimensions: { sheetId: targetSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: colCount },
    },
  });

  requests.push({
    updateDimensionProperties: {
      range: { sheetId: targetSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 180 },
      fields: "pixelSize",
    },
  });
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: targetSheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 3 },
      properties: { pixelSize: 200 },
      fields: "pixelSize",
    },
  });

  requests.push({
    updateBorders: {
      range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      bottom: { style: "SOLID_MEDIUM", color: { red: 0.11, green: 0.13, blue: 0.22 } },
    },
  });

  try {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: targetId, requestBody: { requests } });
  } catch (formatError) {
    console.error("Non-fatal formatting error:", formatError);
  }

  await prisma.joinerRun.update({
    where: { id: runId },
    data: {
      errors: JSON.stringify(errors),
      // @ts-ignore
      chStats: JSON.stringify(chStats),
    },
  });

  return { rowsWritten: allRows.length, success: true, errors };
}

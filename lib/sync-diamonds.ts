import { prisma } from "@/lib/prisma";
import { JoinerJob } from "@prisma/client";
import { google } from "googleapis";
import { getUserAuth } from "./google";
import { resolveUrl, ResolveResult } from "./url-resolver";
import { verifyMlbbId } from "./mlbb";
import { isFormulaOrError, adjustColumnsBasedOnData, detectReportingSheetColumns } from "./validations";
import { withRetry } from "./google-retry";

interface ChError {
  chName: string;
  error: string;
  type?: string;
}

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

  const result = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:AZ`,
    }),
    4,
    1500,
    `Read Reporting Sheet (${sheetName})`
  );

  const rows = (result as any)?.data?.values || [];
  if (rows.length === 0) {
    errors.push({ chName: "Reporting Sheet", error: "Reporting sheet is blank", type: "accessibility" });
    return { entries, errors };
  }

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

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const chNickname = String(row[nicknameCol] ?? "").trim();
    const link = String(row[linkCol] ?? "").trim();

    if (!chNickname) continue;

    // Check if there is a link
    const isNoLink = !link;
    const isInvalidLink =
      isNoLink ||
      link.toUpperCase() === "DISSOLVED" ||
      link.toUpperCase().includes("NO EVENT") ||
      link.toUpperCase() === "EVENT" ||
      (!link.startsWith("http") && !link.startsWith("www"));

    if (isInvalidLink) {
      const errorDetail = isNoLink
        ? "No link provided (Did not follow the rules)"
        : `Invalid link: "${link}" (Did not follow the rules)`;
      errors.push({
        chName: chNickname,
        error: errorDetail,
        type: "rule_violation"
      });
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

function extractPlayerSlotNumber(header: string): number | null {
  const h = header.toUpperCase().trim();
  if (
    /\b(1ST|FIRST|CAPTAIN|LEADER)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*1\b/.test(h) ||
    /\bPLAYER\s*1['’]?S\b/.test(h) ||
    /\b1ST\s*PLAYER\b/.test(h) ||
    /\b1ST\s*MEMBER\b/.test(h)
  ) {
    return 1;
  }
  if (
    /\b(2ND|SECOND)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*2\b/.test(h) ||
    /\bPLAYER\s*2['’]?S\b/.test(h) ||
    /\b2ND\s*PLAYER\b/.test(h) ||
    /\b2ND\s*MEMBER\b/.test(h)
  ) {
    return 2;
  }
  if (
    /\b(3RD|THIRD)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*3\b/.test(h) ||
    /\bPLAYER\s*3['’]?S\b/.test(h) ||
    /\b3RD\s*PLAYER\b/.test(h) ||
    /\b3RD\s*MEMBER\b/.test(h)
  ) {
    return 3;
  }
  if (
    /\b(4TH|FOURTH)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*4\b/.test(h) ||
    /\bPLAYER\s*4['’]?S\b/.test(h) ||
    /\b4TH\s*PLAYER\b/.test(h) ||
    /\b4TH\s*MEMBER\b/.test(h)
  ) {
    return 4;
  }
  if (
    /\b(5TH|FIFTH)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*5\b/.test(h) ||
    /\bPLAYER\s*5['’]?S\b/.test(h) ||
    /\b5TH\s*PLAYER\b/.test(h) ||
    /\b5TH\s*MEMBER\b/.test(h)
  ) {
    return 5;
  }
  if (
    /\b(6TH|SIXTH|RESERVE|SUB|SUBSTITUTE)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*6\b/.test(h) ||
    /\bPLAYER\s*6['’]?S\b/.test(h) ||
    /\b6TH\s*PLAYER\b/.test(h) ||
    /\b6TH\s*MEMBER\b/.test(h)
  ) {
    return 6;
  }
  if (
    /\b(7TH|SEVENTH)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*7\b/.test(h) ||
    /\bPLAYER\s*7['’]?S\b/.test(h) ||
    /\b7TH\s*PLAYER\b/.test(h)
  ) {
    return 7;
  }
  if (
    /\b(8TH|EIGHTH)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*8\b/.test(h)
  ) {
    return 8;
  }
  if (
    /\b(9TH|NINTH)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*9\b/.test(h)
  ) {
    return 9;
  }
  if (
    /\b(10TH|TENTH)\b/.test(h) ||
    /\bPLAYER\s*['’]?\s*10\b/.test(h)
  ) {
    return 10;
  }

  const matchNum = h.match(/\b(?:PLAYER|MEMBER|P|AGE|IGN|UID|SERVER)\s*#?\s*(\d{1,2})\b/);
  if (matchNum) {
    const n = parseInt(matchNum[1]);
    if (n >= 1 && n <= 10) return n;
  }
  return null;
}

/**
 * Extracts team names and player-to-team mapping from the CH's Tournament Response Sheet (Google Form Responses).
 * Searches for columns labeled "Your Team Name", "Team Name", "Your Squad Name", or "Team".
 */
async function getTeamMapFromResponseSheet(
  sheets: any,
  responseSheetUrl?: string
): Promise<{
  teamNames: string[];
  playerTeamMap: Map<string, string>;
}> {
  const teamNames: string[] = [];
  const playerTeamMap = new Map<string, string>();

  if (!responseSheetUrl) return { teamNames, playerTeamMap };

  try {
    const resResult = await resolveUrl(responseSheetUrl);
    if ("error" in resResult) return { teamNames, playerTeamMap };

    const resSpreadsheetId = (resResult as ResolveResult).spreadsheetId;
    const resSheet = await withRetry(
      () => sheets.spreadsheets.values.get({
        spreadsheetId: resSpreadsheetId,
        range: "A1:AZ200",
      }),
      2,
      1000,
      "Read Tournament Response Sheet"
    );

    const rows = (resSheet as any)?.data?.values || [];
    if (rows.length < 2) return { teamNames, playerTeamMap };

    let headerRowIdx = -1;
    let teamNameCol = -1;

    interface SlotCols {
      nameCol?: number;
      ignCol?: number;
      uidCol?: number;
      serverCol?: number;
    }

    const explicitSlots = new Map<number, SlotCols>();
    const sequentialNameCols: number[] = [];
    const sequentialIgnCols: number[] = [];
    const sequentialUidCols: number[] = [];
    const sequentialServerCols: number[] = [];

    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const row = rows[r];
      let foundHeadersInRow = false;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] ?? "").trim().toUpperCase();
        if (!val) continue;

        if (
          val === "YOUR TEAM NAME" ||
          val === "TEAM NAME" ||
          val === "YOUR SQUAD NAME" ||
          val === "SQUAD NAME" ||
          val === "TEAM" ||
          val.includes("TEAM NAME") ||
          val.includes("YOUR TEAM") ||
          val.includes("SQUAD NAME")
        ) {
          teamNameCol = c;
          foundHeadersInRow = true;
          continue;
        }

        const slotNum = extractPlayerSlotNumber(val);
        const isUid = val.includes("UID") || val.includes("USER ID") || val.includes("GAME ID") || val.includes("ACCOUNT ID") || val === "ID";
        const isIgn = val.includes("IGN") || val.includes("GAME NAME") || val.includes("IN GAME NAME") || val.includes("IN-GAME NAME") || val.includes("NICKNAME");
        const isServer = val.includes("SERVER") || val.includes("ZONE") || val === "ZONE ID" || val === "SERVER ID";
        const isName = (val.includes("NAME") || val.includes("PLAYER") || val.includes("CAPTAIN") || val.includes("FULLNAME") || val.includes("FULL NAME")) && !isUid && !isIgn && !isServer && !val.includes("TEAM") && !val.includes("SQUAD");

        if (isUid || isIgn || isServer || isName) {
          foundHeadersInRow = true;
        }

        if (slotNum !== null) {
          if (!explicitSlots.has(slotNum)) {
            explicitSlots.set(slotNum, {});
          }
          const slot = explicitSlots.get(slotNum)!;
          if (isUid && slot.uidCol === undefined) slot.uidCol = c;
          else if (isIgn && slot.ignCol === undefined) slot.ignCol = c;
          else if (isServer && slot.serverCol === undefined) slot.serverCol = c;
          else if (isName && slot.nameCol === undefined) slot.nameCol = c;
        }

        if (isUid) sequentialUidCols.push(c);
        else if (isIgn) sequentialIgnCols.push(c);
        else if (isServer) sequentialServerCols.push(c);
        else if (isName) sequentialNameCols.push(c);
      }

      if (foundHeadersInRow && (teamNameCol !== -1 || sequentialUidCols.length > 0)) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) {
      if (teamNameCol === -1) teamNameCol = 1;
      headerRowIdx = 0;
    }

    const hasExplicitSlots = explicitSlots.size > 0;
    const sortedSlotNumbers = Array.from(explicitSlots.keys()).sort((a, b) => a - b);

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const teamName = teamNameCol !== -1 ? String(row[teamNameCol] ?? "").trim() : "";
      if (teamName) {
        teamNames.push(teamName);
      }

      const registerPlayerMapping = (nameVal: string, ignVal: string, uidVal: string) => {
        const cleanUid = uidVal.replace(/\D/g, "").trim();
        const rawUid = uidVal.trim();
        const rawIgn = ignVal.trim();
        const rawName = nameVal.trim();

        const uidsToMap = [cleanUid, rawUid].filter((u) => u && u.length >= 2);
        for (const u of uidsToMap) {
          if (teamName) playerTeamMap.set(u.toLowerCase(), teamName);
        }

        if (rawIgn && rawIgn.length >= 2) {
          if (teamName) playerTeamMap.set(rawIgn.toLowerCase(), teamName);
        }

        if (rawName && rawName.length >= 2) {
          if (teamName) playerTeamMap.set(rawName.toLowerCase(), teamName);
        }
      };

      if (hasExplicitSlots) {
        sortedSlotNumbers.forEach((slotNum) => {
          const cols = explicitSlots.get(slotNum)!;
          const nameVal = cols.nameCol !== undefined ? String(row[cols.nameCol] ?? "") : "";
          const ignVal = cols.ignCol !== undefined ? String(row[cols.ignCol] ?? "") : "";
          const uidVal = cols.uidCol !== undefined ? String(row[cols.uidCol] ?? "") : "";

          registerPlayerMapping(nameVal, ignVal, uidVal);
        });
      } else {
        const maxPlayersInRow = Math.max(
          sequentialNameCols.length,
          sequentialIgnCols.length,
          sequentialUidCols.length,
          1
        );

        for (let k = 0; k < maxPlayersInRow; k++) {
          const nameVal = sequentialNameCols[k] !== undefined ? String(row[sequentialNameCols[k]] ?? "") : "";
          const ignVal = sequentialIgnCols[k] !== undefined ? String(row[sequentialIgnCols[k]] ?? "") : "";
          const uidVal = sequentialUidCols[k] !== undefined ? String(row[sequentialUidCols[k]] ?? "") : "";

          registerPlayerMapping(nameVal, ignVal, uidVal);
        }
      }
    }
  } catch (e) {
    console.log("[ResponseSheet] Team extraction notice:", e);
  }

  return { teamNames, playerTeamMap };
}

export async function syncDiamonds(job: JoinerJob, runId: string) {
  console.log(`[Diamonds] Starting sync for job ${job.id} (${job.name})`);

  let lastProgressTime = 0;
  const updateProgress = async (percentage: number, message?: string) => {
    const now = Date.now();
    if (percentage < 100 && percentage > 0 && now - lastProgressTime < 450) return;
    lastProgressTime = now;
    try {
      await prisma.joinerRun.update({
        where: { id: runId },
        data: {
          progress: Math.min(Math.max(percentage, 0), 100),
          progressMessage: message,
        },
      });
    } catch (e) {
      // Suppress progress update errors so DB locks never crash the sync engine
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
  const duplicateRowsList: { rowData: string[]; groupIdx: number }[] = [];
  const dupGroupMap = new Map<string, number>();
  let nextDupGroupIdx = 0;
  const seenUids = new Map<string, { chName: string; server: string; rowIdx: number; baseDupRowData: string[]; addedToDupSheet?: boolean }>();

  // Header: CH, NAME, SERVER, UID, CODE, AMOUNT, REMARKS
  const HEADER = ["CH", "NAME", "SERVER", "UID", "CODE", "AMOUNT", "REMARKS"];
  if (job.validationEnabled) {
    HEADER.push("STATUS");
  }

  await updateProgress(2, "Reading reporting sheet...");

  // Step 1: Read CH entries from primary reporting sheet
  const reportingSpreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: (job as any).spreadsheetId,
  });

  let reportingTabName: string;
  if ((job as any).reportingSheetGid) {
    const targetTab = reportingSpreadsheet.data.sheets?.find(
      (s: any) => String(s.properties?.sheetId) === String((job as any).reportingSheetGid)
    );
    reportingTabName = targetTab?.properties?.title || reportingSpreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
  } else {
    reportingTabName = reportingSpreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
  }

  console.log(`[Diamonds] Tab: "${reportingTabName}", Mode: ${(job as any).gameMode || "5v5"}`);

  const { entries: chEntries, errors: reportingErrors } = await readChEntriesFromReportingSheet(
    sheets, (job as any).spreadsheetId, reportingTabName, "diamonds"
  );

  if (reportingErrors && reportingErrors.length > 0) {
    errors.push(...reportingErrors);
  }

  // Step 1b: Read CH entries from secondary/trainees reporting sheet if configured
  if ((job as any).secondarySpreadsheetId) {
    try {
      const secSpreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: (job as any).secondarySpreadsheetId,
      });

      let secTabName: string;
      if ((job as any).secondaryReportingSheetGid) {
        const secTargetTab = secSpreadsheet.data.sheets?.find(
          (s: any) => String(s.properties?.sheetId) === String((job as any).secondaryReportingSheetGid)
        );
        secTabName = secTargetTab?.properties?.title || secSpreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
      } else {
        secTabName = secSpreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
      }

      console.log(`[Diamonds] Secondary/Trainees Tab: "${secTabName}"`);

      const { entries: secEntries, errors: secErrors } = await readChEntriesFromReportingSheet(
        sheets, (job as any).secondarySpreadsheetId, secTabName, "diamonds"
      );

      if (secErrors && secErrors.length > 0) {
        errors.push(...secErrors);
      }

      if (secEntries.length > 0) {
        console.log(`[Diamonds] Added ${secEntries.length} CH entries from secondary/trainees sheet`);
        chEntries.push(...secEntries);
      }
    } catch (secErr: any) {
      console.error("[Diamonds] Failed to read secondary/trainees reporting sheet:", secErr);
      errors.push({ chName: "Secondary Reporting Sheet", error: `Failed to read Trainees sheet: ${secErr.message || String(secErr)}` });
    }
  }

  if (chEntries.length === 0) {
    await prisma.joinerRun.update({
      where: { id: runId },
      data: { errors: JSON.stringify(errors) },
    });
    return { rowsWritten: 0, success: true, errors };
  }

  const totalCh = chEntries.length;
  await updateProgress(5, `Found ${totalCh} CHs with Diamond links. Resolving URLs...`);

  // Step 2: Resolve all URLs in parallel concurrency batches (Concurrency: 15)
  const resolvedEntries: { 
    chName: string; 
    spreadsheetId: string; 
    responseSheetUrl?: string; 
    registeredTeams?: string; 
  }[] = [];

  const URL_CONCURRENCY = 15;
  let resolvedCount = 0;

  for (let i = 0; i < chEntries.length; i += URL_CONCURRENCY) {
    const batch = chEntries.slice(i, i + URL_CONCURRENCY);
    await Promise.all(
      batch.map(async (ch) => {
        const result = await resolveUrl(ch.url);
        resolvedCount++;
        const pct = 5 + Math.floor((resolvedCount / totalCh) * 15);
        await updateProgress(pct, `Resolving URLs: ${resolvedCount}/${totalCh}`);

        if ("error" in result) {
          errors.push({ chName: ch.chName, error: `URL Resolution Failed: ${result.error}` });
        } else {
          resolvedEntries.push({
            chName: ch.chName,
            spreadsheetId: (result as ResolveResult).spreadsheetId,
            responseSheetUrl: ch.responseSheetUrl,
            registeredTeams: ch.registeredTeams,
          });
        }
      })
    );
  }

  const getRegisteredTeamsCount = async (chEntry: any) => {
    let responseCount: number | null = null;
    let responseError: string | null = null;

    if (chEntry?.responseSheetUrl) {
      try {
        const resResult = await resolveUrl(chEntry.responseSheetUrl);
        if (!("error" in resResult)) {
          const resSpreadsheetId = (resResult as ResolveResult).spreadsheetId;
          const resSheet = await withRetry(
            () => sheets.spreadsheets.values.get({
              spreadsheetId: resSpreadsheetId,
              range: "A1:Z100",
            }),
            1,
            500,
            "Teams Count",
            3000
          );
          const resRows = (resSheet as any)?.data?.values || [];
          if (resRows.length > 0) {
            responseCount = Math.max(0, resRows.length - 1);
          } else {
            responseCount = 0;
          }
        } else {
          responseError = "Invalid Link";
        }
      } catch (e: any) {
        console.log(`Failed to read response sheet for ${chEntry?.chName}:`, e);
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
    if (chEntry?.registeredTeams) {
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

  // Response Sheet Cache Map for fast on-demand team name lookup
  const responseSheetCache = new Map<string, { teamNames: string[]; playerTeamMap: Map<string, string> }>();
  const fetchChTeamMap = async (resUrl?: string) => {
    if (!resUrl) return { teamNames: [], playerTeamMap: new Map() };
    if (responseSheetCache.has(resUrl)) return responseSheetCache.get(resUrl)!;
    const res = await getTeamMapFromResponseSheet(sheets, resUrl);
    responseSheetCache.set(resUrl, res);
    return res;
  };

  // Step 3: Read each CH's sheet
  await updateProgress(20, "Reading CH diamond sheets...");

  for (let i = 0; i < resolvedEntries.length; i++) {
    const { chName, spreadsheetId, responseSheetUrl } = resolvedEntries[i];
    const pct = 20 + Math.floor((i / resolvedEntries.length) * 40);
    await updateProgress(pct, `Reading CHs: ${i + 1}/${resolvedEntries.length} (${chName})`);

    // Check if run was stopped by user
    const currentRun = await prisma.joinerRun.findUnique({
      where: { id: runId },
      select: { status: true }
    });
    if (currentRun && currentRun.status === "failed") {
      console.log(`[Diamonds] Job run ${runId} was stopped by user. Aborting sheet reading...`);
      return { rowsWritten: 0, success: false, errors };
    }

    try {
      const sheetData = await withRetry(
        () => sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "A1:Z",
        }),
        3,
        1500,
        `Read CH Sheet (${chName})`
      );

      const rows = sheetData.data.values;
      if (!rows || rows.length === 0) {
        const teamsRes = await getRegisteredTeamsCount(resolvedEntries[i]);
        let teamsMessage = "";
        if (teamsRes.count !== "0" || teamsRes.source === "error") {
          teamsMessage = `.(Teams in responses sheet: ${teamsRes.count})`;
        }
        errors.push({ chName, error: `Sheet is blank/empty.${teamsMessage}` });
        continue;
      }

      // Find header row by looking for NAME column
      let headerRowIdx = -1;
      let nameCol = -1, serverCol = -1, uidCol = -1, codeCol = -1, amountCol = -1, remarksCol = -1;

      // Increase search depth to 30 to account for CHs with deeply shifted templates
      for (let r = 0; r < Math.min(rows.length, 30); r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] ?? "").trim().toUpperCase();
          if (val === "") continue;
          
          if ((val.includes("NAME") || val.includes("PLAYER")) && !val.includes("IGN") && !val.includes("GAME")) {
             nameCol = c;
          } else if (val === "SERVER" || val.includes("SERVER")) {
             serverCol = c;
          } else if (val === "UID" || val.includes("UID") || val.includes("USER ID") || val === "ID") {
             uidCol = c;
          } else if (val === "CODE" || val.includes("CODE")) {
             codeCol = c;
          } else if (val === "AMOUNT" || val.includes("DIAMONDS") || val === "DIAS") {
             amountCol = c;
          } else if (val === "REMARKS" || val === "REMARK" || val.includes("REMARK")) {
             remarksCol = c;
          }
        }
        if (nameCol !== -1 && serverCol !== -1 && uidCol !== -1) {
          headerRowIdx = r;
          break;
        }
        nameCol = -1; serverCol = -1; uidCol = -1; codeCol = -1; amountCol = -1; remarksCol = -1;
      }

      if (headerRowIdx === -1 || nameCol === -1) {
        errors.push({ chName, error: "Could not find header row with NAME/SERVER/UID columns", type: "accessibility" });
        continue;
      }

      // Run dynamic column correction based on data analysis
      const adjusted = adjustColumnsBasedOnData(rows, headerRowIdx, {
        nameCol,
        ignCol: -1, // No IGN column in diamonds sheet normally
        serverCol,
        uidCol
      });

      if (adjusted.corrected) {
        nameCol = adjusted.nameCol;
        serverCol = adjusted.serverCol;
        uidCol = adjusted.uidCol;
        errors.push({
          chName,
          error: "Auto-corrected column mapping: columns were misaligned in headers",
          type: "validation_fixed"
        });
      }

      let chHeaderAdded = false;
      let playerCount = 0;

      // Extract data rows
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        let name = String(row[nameCol] ?? "").trim();
        let server = String(row[serverCol] ?? "").trim();
        let uid = String(row[uidCol] ?? "").trim();
        const code = codeCol !== -1 ? String(row[codeCol] ?? "").trim() : "";
        const amount = amountCol !== -1 ? String(row[amountCol] ?? "").trim() : "";
        const remarks = remarksCol !== -1 ? String(row[remarksCol] ?? "").trim() : "";

        if (!name && !uid) continue;

        // Skip formula placeholder rows and spreadsheet errors
        if (isFormulaOrError(name) || isFormulaOrError(server) || isFormulaOrError(uid)) {
          continue;
        }

        const upperName = name.toUpperCase();
        if (upperName === "TOTAL" || upperName === "TOTALS") continue;

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

        if (mUid) {
          uid = mUid.u;
          server = mUid.s;
          errors.push({ chName, error: `Mixed Server/UID extracted for player ${name} (Server: ${server}, UID: ${uid})`, type: "validation_fixed" });
        } else if (mServer) {
          uid = mServer.u;
          server = mServer.s;
          errors.push({ chName, error: `Mixed Server/UID extracted for player ${name} (Server: ${server}, UID: ${uid})`, type: "validation_fixed" });
        }

        // Check for negative values
        if (server.includes("-") || uid.includes("-")) {
          errors.push({ chName, error: `Negative sign detected for player ${name} (Raw Server: ${server}, Raw UID: ${uid})` });
        }

        // Clean up any remaining non-digits (like minus signs, spaces, or letters)
        server = server.replace(/\D/g, "");
        uid = uid.replace(/\D/g, "");

        // Validation: Missing Server or UID
        if (!server || !uid) {
          const playerName = name || "Unknown";
          errors.push({ chName, error: `Missing Server or UID for player ${playerName} (Server: '${server || "BLANK"}', UID: '${uid || "BLANK"}')` });
        }

        let sLen = server.length;
        let uLen = uid.length;

        // Validation: Swapped server/UID
        if (sLen > 5 && uLen > 0 && uLen < 6) {
          const temp = server;
          server = uid;
          uid = temp;
          sLen = server.length;
          uLen = uid.length;
        }

        if (uLen > 0 && uLen <= 5) {
          errors.push({ chName, error: `Missing UID because the CH type ${uLen} numbers only for player ${name}` });
        }

        if (sLen > 5 && !uid) {
          errors.push({ chName, error: `Server length is unusually long for player ${name} (Server: ${server})` });
        }

        if (!remarks.toUpperCase().includes("CH HANDLER")) {
           playerCount++;
        }

        let isDuplicate = false;
        if (uid) {
          if (seenUids.has(uid)) {
            isDuplicate = true;
            const prev = seenUids.get(uid)!;
            const sameServer = prev.server === server;
            const sameCh = prev.chName === chName;

            let errorMsg = "";
            let dupWith = "";
            let dupType = "";

            if (sameServer) {
              if (sameCh) {
                errorMsg = `Duplicate winner found: ${name || "Unknown"} (Server: ${server}, UID: ${uid}) was already registered earlier in CH ${chName}`;
                dupWith = `Same CH (${chName})`;
                dupType = "Internal Duplicate";
              } else {
                errorMsg = `Duplicate winner found: ${name || "Unknown"} (Server: ${server}, UID: ${uid}) was already registered in CH ${prev.chName}`;
                dupWith = `Duplicated with ${prev.chName}`;
                dupType = "Cross-Host Duplicate";
              }
            } else {
              if (sameCh) {
                errorMsg = `Fake duplicate MLBB ID found (different server entered): ${name || "Unknown"} (UID: ${uid}, Server: ${server}) was already registered earlier in CH ${chName} (with Server: ${prev.server})`;
                dupWith = `Same CH (${chName}, Real Server: ${prev.server})`;
                dupType = "Fake Duplicate (Altered Server)";
              } else {
                errorMsg = `Fake duplicate MLBB ID found (copied ID across CHs): ${name || "Unknown"} (UID: ${uid}, Server: ${server}) was already registered in CH ${prev.chName} (with Server: ${prev.server})`;
                dupWith = `Copied from ${prev.chName} (Real Server: ${prev.server})`;
                dupType = "Fake Duplicate (Altered Server)";
              }
            }

            errors.push({ chName, error: errorMsg });

            if (!dupGroupMap.has(uid)) {
              dupGroupMap.set(uid, nextDupGroupIdx++);
            }
            const groupIdx = dupGroupMap.get(uid)!;

            // Push original occurrence to duplicateRowsList if not added yet
            if (!prev.addedToDupSheet) {
              const origDupWith = sameCh ? `Same CH (${chName})` : `Duplicated with ${chName}`;
              const origDupType = sameServer ? (sameCh ? "Internal Duplicate" : "Cross-Host Duplicate") : "Original Entry (Copied by " + chName + ")";
              duplicateRowsList.push({
                rowData: [...prev.baseDupRowData, origDupWith, origDupType],
                groupIdx,
              });
              prev.addedToDupSheet = true;
            }
            // Push current duplicate occurrence to duplicateRowsList
            duplicateRowsList.push({
              rowData: [chName, name, server, uid, code, amount, remarks, dupWith, dupType],
              groupIdx,
            });
            
            if (!duplicateRowIndices.includes(prev.rowIdx)) {
               duplicateRowIndices.push(prev.rowIdx);
            }
          } else {
            seenUids.set(uid, {
              chName,
              server,
              rowIdx: 1 + allRows.length,
              baseDupRowData: [chName, name, server, uid, code, amount, remarks],
              addedToDupSheet: false,
            });
          }
        }

        const rowData = [!chHeaderAdded ? `CH ${chName}` : "", name, server, uid, code, amount, remarks];

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
      }
      
      chStats.push({ chName, count: playerCount });

      if (playerCount === 0) {
        const teamsRes = await getRegisteredTeamsCount(resolvedEntries[i]);
        let teamsMessage = "";
        if (teamsRes.count !== "0" || teamsRes.source === "error") {
          teamsMessage = `.(Teams in responses sheet: ${teamsRes.count})`;
        }
        errors.push({ chName, error: `Empty Tournament: No actual players found in the sheet.${teamsMessage}` });
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
      if (!chStats.some((s) => s.chName === chName)) {
        chStats.push({ chName, count: 0 });
      }
    }
  }

  // Record CHs that had rule violations or reporting sheet errors in chStats with 0 count
  errors.forEach((err) => {
    if (
      err.chName &&
      err.chName !== "Reporting Sheet" &&
      err.chName !== "Secondary Reporting Sheet" &&
      !chStats.some((s) => s.chName === err.chName)
    ) {
      chStats.push({ chName: err.chName, count: 0 });
    }
  });

  // Step 4: Optional MooGold verification
  if (job.validationEnabled && allRows.length > 0) {
    await updateProgress(60, "Fast Verifying IDs with MooGold...");
    const statusColIdx = HEADER.length - 1;
    const BATCH_SIZE = 6;

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (row) => {
          const server = row[2]; // SERVER
          const uid = row[3]; // UID
          if (server && uid) {
            try {
              const result = await verifyMlbbId(String(uid), String(server));
              if (result.success && result.ign) {
                row[statusColIdx] = "Verified";
              } else if (result.error === "Player not found") {
                row[statusColIdx] = "Not Found";
              } else {
                row[statusColIdx] = "Unverified";
              }
            } catch {
              row[statusColIdx] = "Unverified";
            }
          }
        })
      );

      const pct = 60 + Math.floor(((i + batch.length) / allRows.length) * 25);
      await updateProgress(pct, `MooGold Verifying: ${Math.min(i + BATCH_SIZE, allRows.length)}/${allRows.length}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Step 5: Write to target sheet
  await updateProgress(90, "Writing consolidated data...");

  const targetId = job.targetSpreadsheetId;
  const TAB_NAME = job.sheetName || "Diamond Rewards";
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

  const endCol = job.validationEnabled ? "H" : "G";
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

  // Step 5b: Create / Update "Duplicates" tab in target spreadsheet
  const DUP_TAB_NAME = "Duplicates";
  const DUP_HEADER = ["CH", "NAME", "SERVER", "UID", "CODE", "AMOUNT", "REMARKS", "DUPLICATED WITH CH", "DUPLICATE TYPE"];
  const rawDupRowValues = duplicateRowsList.map(item => item.rowData);
  const finalDupRows = [DUP_HEADER, ...rawDupRowValues];

  let dupSheet = targetSpreadsheet.data.sheets?.find((s: any) => s.properties?.title === DUP_TAB_NAME);
  let dupSheetId: number;

  if (!dupSheet) {
    const createDupResp = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: targetId,
      requestBody: { requests: [{ addSheet: { properties: { title: DUP_TAB_NAME } } }] },
    });
    dupSheetId = createDupResp.data.replies?.[0].addSheet?.properties?.sheetId || 0;
  } else {
    dupSheetId = dupSheet.properties?.sheetId || 0;
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: targetId,
    range: `'${DUP_TAB_NAME}'!A:I`,
  });

  if (finalDupRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: targetId,
      range: `'${DUP_TAB_NAME}'!A1:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: finalDupRows },
    });
  }

  // Step 6: Formatting
  await updateProgress(95, "Applying formatting...");
  const colCount = HEADER.length;
  const requests: any[] = [];

  // Duplicates tab formatting with alternating group colors
  if (dupSheetId !== undefined) {
    const dupColCount = DUP_HEADER.length;
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: dupSheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    });

    // Header formatting (Dark Navy)
    requests.push({
      repeatCell: {
        range: { sheetId: dupSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: dupColCount },
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

    // Color palette for alternating duplicate groups:
    // Group 0, 2, 4... -> Soft Light Peach/Warm Yellow
    // Group 1, 3, 5... -> Soft Light Ice Blue
    const COLOR_PEACH = { red: 1.0, green: 0.94, blue: 0.86 };     // #FFF0DC Soft Peach
    const COLOR_ICE_BLUE = { red: 0.92, green: 0.96, blue: 1.0 }; // #EBF5FF Soft Blue

    duplicateRowsList.forEach((item, idx) => {
      const rowIndex = idx + 1; // 1-indexed row in sheet (Row 0 is header)
      const bgColor = item.groupIdx % 2 === 0 ? COLOR_PEACH : COLOR_ICE_BLUE;

      requests.push({
        repeatCell: {
          range: {
            sheetId: dupSheetId,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: dupColCount,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: bgColor,
              borders: {
                top: { style: "SOLID", color: { red: 0.82, green: 0.82, blue: 0.82 } },
                bottom: { style: "SOLID", color: { red: 0.82, green: 0.82, blue: 0.82 } },
                left: { style: "SOLID", color: { red: 0.82, green: 0.82, blue: 0.82 } },
                right: { style: "SOLID", color: { red: 0.82, green: 0.82, blue: 0.82 } },
              },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              wrapStrategy: "WRAP",
              textFormat: { fontSize: 10 },
            },
          },
          fields: "userEnteredFormat(backgroundColor,borders,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat.fontSize)",
        },
      });
    });

    requests.push({
      autoResizeDimensions: {
        dimensions: { sheetId: dupSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: dupColCount },
      },
    });
  }

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
          wrapStrategy: "WRAP",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
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

  for (let r = 2; r < finalRows.length; r += 2) {
    requests.push({
      repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: { userEnteredFormat: { backgroundColor: { red: 0.96, green: 0.96, blue: 0.97 } } },
        fields: "userEnteredFormat.backgroundColor",
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

  // Highlight CH headers
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

  requests.push({
    updateDimensionProperties: {
      range: { sheetId: targetSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 180 },
      fields: "pixelSize",
    },
  });
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: targetSheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
      properties: { pixelSize: 220 }, // Wider NAME column
      fields: "pixelSize",
    },
  });
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: targetSheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 },
      properties: { pixelSize: 300 }, // Wider REMARKS column
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

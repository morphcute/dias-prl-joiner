import { prisma } from "@/lib/prisma";
import { JoinerJob } from "@prisma/client";
import { google } from "googleapis";
import { getUserAuth } from "./google";
import { resolveUrl, ResolveResult } from "./url-resolver";
import { verifyMlbbId } from "./mlbb";
import { isFormulaOrError, adjustColumnsBasedOnData, detectReportingSheetColumns, isAgeHeader, isTeamNameHeader } from "./validations";
import { withRetry } from "./google-retry";

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

  // Fetch the entire active area of the reporting sheet with auto-retry
  const result = await withRetry(
    () => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A1:AZ300`,
    }),
    3,
    1500,
    `Read Reporting Sheet (${sheetName})`
  );

  const rows = (result as any)?.data?.values || [];
  if (rows.length === 0) {
    errors.push({ chName: "Reporting Sheet", error: "Reporting sheet is blank or missing.", type: "accessibility" });
    return { entries, errors };
  }

  // Also fetch formulas so that =HYPERLINK("...", "...") URLs are never lost
  let formulaRows: string[][] = [];
  try {
    const formulaResult = await withRetry(
      () => sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A1:AZ300`,
        valueRenderOption: "FORMULA",
      }),
      1,
      500,
      `Read Reporting Sheet Formulas (${sheetName})`
    );
    formulaRows = (formulaResult as any)?.data?.values || [];
  } catch (e) {
    console.log("[ReportingSheet] Formula read notice:", e);
  }

  // Detect columns dynamically
  const { nicknameCol, linkCol, responseSheetCol, registeredTeamsCol, headerRowIdx } = detectReportingSheetColumns(rows, type);

  if (nicknameCol === -1 || linkCol === -1) {
    errors.push({
      chName: "Reporting Sheet",
      error: "Could not find CH Nickname or Link columns in the reporting sheet.",
      type: "accessibility"
    });
    return { entries, errors };
  }

  console.log(`[ReportingSheet] Scanning CHs starting from header row ${headerRowIdx} (CH Col: ${nicknameCol}, Link Col: ${linkCol}, ResponseSheet Col: ${responseSheetCol}, RegTeams Col: ${registeredTeamsCol})`);

  // Extract entries starting from the row after headers
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const formulaRow = formulaRows[i] || [];
    const chNickname = String(row[nicknameCol] ?? "").trim();

    // If nickname column is empty, this is an area separator row or spacing row -> skip cleanly!
    if (!chNickname) continue;

    let responseSheetUrl = "";
    if (responseSheetCol !== -1) {
      const candidate = String(row[responseSheetCol] ?? "").trim();
      const formulaCandidate = String(formulaRow[responseSheetCol] ?? "").trim();
      if (formulaCandidate.includes("http")) {
        const match = formulaCandidate.match(/https?:\/\/[^\s"'<>\)]+/);
        if (match) {
          responseSheetUrl = match[0];
        }
      }
      if (!responseSheetUrl && (candidate.startsWith("http") || candidate.startsWith("www") || candidate.includes("docs.google.com") || candidate.includes("bit.ly") || candidate.includes("tinyurl"))) {
        responseSheetUrl = candidate;
      }
    }

    let link = String(row[linkCol] ?? "").trim();
    const formulaLink = String(formulaRow[linkCol] ?? "").trim();
    if (formulaLink.includes("http")) {
      const match = formulaLink.match(/https?:\/\/[^\s"'<>\)]+/);
      if (match) link = match[0];
    }

    // If link is still empty or not a valid URL, search row for any other URL that is NOT responseSheetUrl
    if (!link || (!link.startsWith("http") && !link.startsWith("www"))) {
      for (let c = 0; c < row.length; c++) {
        if (c === nicknameCol || c === responseSheetCol) continue;
        const cellVal = String(row[c] ?? "").trim();
        const cellFormula = String(formulaRow[c] ?? "").trim();
        let candidate = "";
        if (cellFormula.includes("http")) {
          const m = cellFormula.match(/https?:\/\/[^\s"'<>\)]+/);
          if (m) candidate = m[0];
        }
        if (!candidate && (cellVal.startsWith("http") || cellVal.startsWith("www") || cellVal.includes("docs.google.com") || cellVal.includes("bit.ly") || cellVal.includes("tinyurl"))) {
          candidate = cellVal;
        }
        if (candidate && candidate !== responseSheetUrl) {
          link = candidate;
          break;
        }
      }
    }

    // If responseSheetUrl was not found yet, scan row for any remaining URL cell that is NOT link
    if (!responseSheetUrl) {
      for (let c = 0; c < row.length; c++) {
        if (c === nicknameCol || c === linkCol) continue;
        const cellVal = String(row[c] ?? "").trim();
        const cellFormula = String(formulaRow[c] ?? "").trim();
        let candidate = "";
        if (cellFormula.includes("http")) {
          const m = cellFormula.match(/https?:\/\/[^\s"'<>\)]+/);
          if (m) candidate = m[0];
        }
        if (!candidate && (cellVal.startsWith("http") || cellVal.startsWith("www") || cellVal.includes("docs.google.com") || cellVal.includes("bit.ly") || cellVal.includes("tinyurl"))) {
          candidate = cellVal;
        }
        if (candidate && candidate !== link) {
          responseSheetUrl = candidate;
          break;
        }
      }
    }

    // Check if there is a link
    const isNoLink = !link;
    const isInvalidLink =
      isNoLink ||
      link.toUpperCase() === "DISSOLVED" ||
      link.toUpperCase().includes("NO EVENT") ||
      link.toUpperCase() === "EVENT" ||
      (!link.startsWith("http") && !link.startsWith("www"));

    const registeredTeams = registeredTeamsCol !== -1 ? String(row[registeredTeamsCol] ?? "").trim() : "";

    if (isInvalidLink) {
      const errorDetail = isNoLink
        ? "No link provided (Did not follow the rules)"
        : `Invalid link: "${link}" (Did not follow the rules)`;
      errors.push({
        chName: chNickname,
        error: errorDetail,
        type: "rule_violation"
      });
      entries.push({ 
        chName: chNickname, 
        url: "",
        responseSheetUrl,
        registeredTeams
      });
      continue;
    }

    entries.push({ 
      chName: chNickname, 
      url: link,
      responseSheetUrl,
      registeredTeams
    });
  }

  console.log(`[ReportingSheet] Scanning CHs in "${sheetName}": Found ${entries.length} valid CH entries`);
  console.log(`[ReportingSheet] List of CHs: ${entries.map(e => e.chName).join(", ")}`);

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
 * Checks if a cell value looks like an agreement, consent, or checkbox response
 * (e.g. "Yes, I understand.", "I agree", "Yes", "Agree", etc.) rather than a team name.
 */
function isAgreementValue(val: string): boolean {
  if (!val) return false;
  const v = String(val).trim().toLowerCase();
  if (!v) return false;
  return (
    v === "yes" ||
    v === "no" ||
    v === "true" ||
    v === "false" ||
    v === "agree" ||
    v === "i agree" ||
    v === "yes, i understand" ||
    v === "yes, i understand." ||
    v === "yes i understand" ||
    v === "yes, i agree" ||
    v === "yes, i agree." ||
    v === "yes i agree" ||
    v === "understood" ||
    v.startsWith("yes,") ||
    v.startsWith("yes ") ||
    v.includes("understand") ||
    v.includes("i agree")
  );
}

/**
 * Extracts team names, player-to-team mapping, and multi-player age mapping from the CH's Tournament Response Sheet (Google Form Responses).
 * Detects player slots (1st Player's Age, 2nd Player's Age, etc.) and accurately links each player to their respective age and team name.
 */
async function getTeamMapFromResponseSheet(
  sheets: any,
  responseSheetUrl?: string
): Promise<{
  teamNames: string[];
  playerTeamMap: Map<string, string>;
  playerAgeMap: Map<string, string>;
  teamSlotAgeMap: Map<string, string>;
}> {
  const teamNames: string[] = [];
  const playerTeamMap = new Map<string, string>();
  const playerAgeMap = new Map<string, string>();
  const teamSlotAgeMap = new Map<string, string>();

  if (!responseSheetUrl) return { teamNames, playerTeamMap, playerAgeMap, teamSlotAgeMap };

  try {
    const resResult = await resolveUrl(responseSheetUrl);
    if ("error" in resResult) return { teamNames, playerTeamMap, playerAgeMap, teamSlotAgeMap };

    const resSpreadsheetId = (resResult as ResolveResult).spreadsheetId;

    // Detect target response tab (e.g. Form_Responses, Form Responses 1, Responses)
    let targetTabTitle = "";
    try {
      const meta = await withRetry(
        () => sheets.spreadsheets.get({
          spreadsheetId: resSpreadsheetId,
        }),
        2,
        1000,
        "Get Response Sheet Metadata"
      );

      const sheetList = (meta as any)?.data?.sheets || [];
      if (sheetList.length > 0) {
        const responseTab = sheetList.find((s: any) => {
          const t = String(s.properties?.title || "").toUpperCase();
          return t.includes("RESPONSE") || t.includes("FORM");
        });
        targetTabTitle = responseTab?.properties?.title || sheetList[0]?.properties?.title || "";
      }
    } catch (e) {
      console.log("[ResponseSheet] Metadata fetch notice:", e);
    }

    let resSheet: any = null;
    if (targetTabTitle) {
      try {
        const escapedTitle = targetTabTitle.replace(/'/g, "''");
        resSheet = await withRetry(
          () => sheets.spreadsheets.values.get({
            spreadsheetId: resSpreadsheetId,
            range: `'${escapedTitle}'!A1:ZZ1000`,
          }),
          1,
          500,
          `Read Tournament Response Sheet (${targetTabTitle})`
        );
      } catch (e) {
        console.log(`[ResponseSheet] Tab '${targetTabTitle}' read notice, trying default range:`, e);
      }
    }

    if (!resSheet || !(resSheet as any)?.data?.values?.length) {
      resSheet = await withRetry(
        () => sheets.spreadsheets.values.get({
          spreadsheetId: resSpreadsheetId,
          range: "A1:ZZ1000",
        }),
        2,
        1000,
        "Read Tournament Response Sheet Default"
      );
    }

    const rows = (resSheet as any)?.data?.values || [];
    if (rows.length < 2) return { teamNames, playerTeamMap, playerAgeMap, teamSlotAgeMap };

    // Find header row in Response Sheet (usually row 0)
    let headerRowIdx = -1;
    let teamNameCol = -1;

    // 1. Dedicated scan for Team Name column header across top 10 rows
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      for (let c = 0; c < (rows[r]?.length || 0); c++) {
        const val = String(rows[r][c] ?? "").trim();
        if (isTeamNameHeader(val)) {
          teamNameCol = c;
          break;
        }
      }
      if (teamNameCol !== -1) break;
    }

    interface SlotCols {
      nameCol?: number;
      ignCol?: number;
      uidCol?: number;
      serverCol?: number;
      ageCol?: number;
    }

    const explicitSlots = new Map<number, SlotCols>();
    const sequentialNameCols: number[] = [];
    const sequentialIgnCols: number[] = [];
    const sequentialUidCols: number[] = [];
    const sequentialServerCols: number[] = [];
    const sequentialAgeCols: number[] = [];

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r];
      let foundHeadersInRow = false;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] ?? "").trim().toUpperCase();
        if (!val) continue;

        if (isTeamNameHeader(val)) {
          teamNameCol = c;
          foundHeadersInRow = true;
          continue;
        }

        const slotNum = extractPlayerSlotNumber(val);
        const isAge = isAgeHeader(val);
        const isUid = val.includes("UID") || val.includes("USER ID") || val.includes("GAME ID") || val.includes("ACCOUNT ID") || val === "ID";
        const isIgn = val.includes("IGN") || val.includes("GAME NAME") || val.includes("IN GAME NAME") || val.includes("IN-GAME NAME") || val.includes("NICKNAME");
        const isServer = val.includes("SERVER") || val.includes("ZONE") || val === "ZONE ID" || val === "SERVER ID";
        const isName = (val.includes("NAME") || val.includes("PLAYER") || val.includes("CAPTAIN") || val.includes("FULLNAME") || val.includes("FULL NAME")) && !isAge && !isUid && !isIgn && !isServer && !isTeamNameHeader(val);

        if (isAge || isUid || isIgn || isServer || isName) {
          foundHeadersInRow = true;
        }

        if (slotNum !== null) {
          if (!explicitSlots.has(slotNum)) {
            explicitSlots.set(slotNum, {});
          }
          const slot = explicitSlots.get(slotNum)!;
          if (isAge && slot.ageCol === undefined) slot.ageCol = c;
          else if (isUid && slot.uidCol === undefined) slot.uidCol = c;
          else if (isIgn && slot.ignCol === undefined) slot.ignCol = c;
          else if (isServer && slot.serverCol === undefined) slot.serverCol = c;
          else if (isName && slot.nameCol === undefined) slot.nameCol = c;
        }

        if (isAge) sequentialAgeCols.push(c);
        else if (isUid) sequentialUidCols.push(c);
        else if (isIgn) sequentialIgnCols.push(c);
        else if (isServer) sequentialServerCols.push(c);
        else if (isName) sequentialNameCols.push(c);
      }

      if (foundHeadersInRow && (teamNameCol !== -1 || sequentialAgeCols.length > 0 || sequentialUidCols.length > 0)) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = 0;
    }

    // Verify candidate teamNameCol by checking that rows don't contain agreement values ("Yes, I understand")
    if (teamNameCol !== -1) {
      let agreementCount = 0;
      let sampleCount = 0;
      for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 6); r++) {
        const cellVal = String(rows[r]?.[teamNameCol] ?? "").trim();
        if (cellVal) {
          sampleCount++;
          if (isAgreementValue(cellVal)) agreementCount++;
        }
      }
      if (sampleCount > 0 && agreementCount / sampleCount >= 0.5) {
        teamNameCol = -1; // Invalidate agreement column
      }
    }

    // Fallback: search explicitly across all top rows for a header matching isTeamNameHeader
    if (teamNameCol === -1 && rows.length > 0) {
      for (let r = 0; r < Math.min(rows.length, 5); r++) {
        for (let c = 0; c < (rows[r]?.length || 0); c++) {
          const headerVal = String(rows[r][c] ?? "").trim();
          if (isTeamNameHeader(headerVal)) {
            // Check that values are not agreement values
            let sampleAgr = 0;
            let sampleTotal = 0;
            for (let testR = r + 1; testR < Math.min(rows.length, r + 6); testR++) {
              const testVal = String(rows[testR]?.[c] ?? "").trim();
              if (testVal) {
                sampleTotal++;
                if (isAgreementValue(testVal)) sampleAgr++;
              }
            }
            if (sampleTotal === 0 || sampleAgr / sampleTotal < 0.5) {
              teamNameCol = c;
              break;
            }
          }
        }
        if (teamNameCol !== -1) break;
      }
    }

    const hasExplicitSlots = explicitSlots.size > 0;
    const sortedSlotNumbers = Array.from(explicitSlots.keys()).sort((a, b) => a - b);

    // Extract team names and build player -> team mapping & player -> age mapping
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const rawTeam = teamNameCol !== -1 ? String(row[teamNameCol] ?? "").trim() : "";
      const teamName = isAgreementValue(rawTeam) ? "" : rawTeam;
      if (teamName) {
        teamNames.push(teamName);
      }

      const registerPlayerMapping = (
        nameVal: string,
        ignVal: string,
        uidVal: string,
        serverVal: string,
        ageVal: string,
        slotIdx: number
      ) => {
        const cleanAge = ageVal.trim();
        const rawUid = uidVal.trim();
        const rawServer = serverVal.trim();
        const rawIgn = ignVal.trim();
        const rawName = nameVal.trim();

        // 1. Extract pure digit sequences from UID and Server strings
        const allNumsInUid = rawUid.match(/\d+/g) || [];
        const allNumsInServer = rawServer.match(/\d+/g) || [];
        const allNumsInIgn = rawIgn.match(/\d+/g) || [];
        const allNums = [...allNumsInUid, ...allNumsInServer, ...allNumsInIgn];

        const uidCandidates = new Set<string>();
        if (rawUid) uidCandidates.add(rawUid.toLowerCase());
        const pureDigitsUid = rawUid.replace(/\D/g, "");
        if (pureDigitsUid && pureDigitsUid.length >= 5) uidCandidates.add(pureDigitsUid.toLowerCase());

        for (const num of allNums) {
          if (num.length >= 6 && num.length <= 12) {
            uidCandidates.add(num.toLowerCase());
          }
        }

        for (const u of uidCandidates) {
          if (teamName) playerTeamMap.set(u, teamName);
          if (cleanAge) playerAgeMap.set(u, cleanAge);
        }

        // 2. Map IGNs (exact and normalized without spaces/special characters)
        if (rawIgn && rawIgn.length >= 2) {
          const ignLower = rawIgn.toLowerCase();
          const ignClean = ignLower.replace(/[^a-z0-9]/g, "");
          if (teamName) {
            playerTeamMap.set(ignLower, teamName);
            if (ignClean) playerTeamMap.set(ignClean, teamName);
          }
          if (cleanAge) {
            playerAgeMap.set(ignLower, cleanAge);
            if (ignClean) playerAgeMap.set(ignClean, cleanAge);
          }
        }

        // 3. Map Names (exact, normalized without middle initial/special characters)
        if (rawName && rawName.length >= 2) {
          const nameLower = rawName.toLowerCase();
          const nameClean = nameLower.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
          const nameNoSpace = nameLower.replace(/[^a-z0-9]/g, "");
          if (teamName) {
            playerTeamMap.set(nameLower, teamName);
            if (nameClean) playerTeamMap.set(nameClean, teamName);
            if (nameNoSpace) playerTeamMap.set(nameNoSpace, teamName);
          }
          if (cleanAge) {
            playerAgeMap.set(nameLower, cleanAge);
            if (nameClean) playerAgeMap.set(nameClean, cleanAge);
            if (nameNoSpace) playerAgeMap.set(nameNoSpace, cleanAge);
          }
        }

        // 4. Map positional slot within team
        if (teamName && cleanAge) {
          teamSlotAgeMap.set(`${teamName.toLowerCase()}#${slotIdx}`, cleanAge);
        }
      };

      // 1. Map explicit slots
      if (hasExplicitSlots) {
        sortedSlotNumbers.forEach((slotNum, idx) => {
          const cols = explicitSlots.get(slotNum)!;
          const nameVal = cols.nameCol !== undefined ? String(row[cols.nameCol] ?? "") : "";
          const ignVal = cols.ignCol !== undefined ? String(row[cols.ignCol] ?? "") : "";
          const uidVal = cols.uidCol !== undefined ? String(row[cols.uidCol] ?? "") : "";
          const serverVal = cols.serverCol !== undefined ? String(row[cols.serverCol] ?? "") : "";
          const ageVal = cols.ageCol !== undefined ? String(row[cols.ageCol] ?? "") : "";

          registerPlayerMapping(nameVal, ignVal, uidVal, serverVal, ageVal, idx);
        });
      }

      // 2. ALSO map sequential columns (ensuring members/reserves in slots 2, 3, 4, 5, 6 are never skipped)
      const maxPlayersInRow = Math.max(
        sequentialNameCols.length,
        sequentialIgnCols.length,
        sequentialUidCols.length,
        sequentialAgeCols.length,
        0
      );

      for (let k = 0; k < maxPlayersInRow; k++) {
        const nameVal = sequentialNameCols[k] !== undefined ? String(row[sequentialNameCols[k]] ?? "") : "";
        const ignVal = sequentialIgnCols[k] !== undefined ? String(row[sequentialIgnCols[k]] ?? "") : "";
        const uidVal = sequentialUidCols[k] !== undefined ? String(row[sequentialUidCols[k]] ?? "") : "";
        const serverVal = sequentialServerCols[k] !== undefined ? String(row[sequentialServerCols[k]] ?? "") : "";
        const ageVal = sequentialAgeCols[k] !== undefined ? String(row[sequentialAgeCols[k]] ?? "") : "";

        registerPlayerMapping(nameVal, ignVal, uidVal, serverVal, ageVal, k);
      }

      // 3. Row-level comprehensive mapping: every player attribute in this row belongs to this team!
      if (teamName) {
        for (let c = 0; c < row.length; c++) {
          if (c === teamNameCol) continue;
          const cellStr = String(row[c] ?? "").trim();
          if (!cellStr) continue;
          if (cellStr.startsWith("http") || cellStr.includes("@") || isAgreementValue(cellStr)) continue;

          // Map any UIDs found in this cell (6 to 12 digits)
          const allUids = cellStr.match(/\d{6,12}/g) || [];
          for (const u of allUids) {
            playerTeamMap.set(u.toLowerCase(), teamName);
          }
          const pureDigits = cellStr.replace(/\D/g, "");
          if (pureDigits.length >= 6 && pureDigits.length <= 12) {
            playerTeamMap.set(pureDigits.toLowerCase(), teamName);
          }

          // Map IGNs and Player Names (length 2 to 40, not purely digits)
          if (cellStr.length >= 2 && cellStr.length <= 40 && !/^\d+$/.test(cellStr)) {
            const lower = cellStr.toLowerCase();
            const clean = lower.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
            const noSpace = lower.replace(/[^a-z0-9]/g, "");

            playerTeamMap.set(lower, teamName);
            if (clean) playerTeamMap.set(clean, teamName);
            if (noSpace) playerTeamMap.set(noSpace, teamName);
          }
        }
      }
    }
  } catch (e) {
    console.log("[ResponseSheet] Team extraction notice:", e);
  }

  return { teamNames, playerTeamMap, playerAgeMap, teamSlotAgeMap };
}


export async function syncPrl(job: JoinerJob, runId: string) {
  console.log(`[PRL] Starting sync for job ${job.id} (${job.name})`);

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

  // Header: CH, Players Name, Age, Players IGN, Server, UID (NO "No." column)
  const HEADER = ["CH", "Players Name", "Age", "Players IGN", "Server", "UID"];
  if (job.validationEnabled) {
    HEADER.push("Status");
  }

  await updateProgress(2, "Reading reporting sheet...");

  // Step 1: Read CH entries from primary reporting sheet
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

      console.log(`[PRL] Secondary/Trainees Tab: "${secTabName}"`);

      const { entries: secEntries, errors: secErrors } = await readChEntriesFromReportingSheet(
        sheets, (job as any).secondarySpreadsheetId, secTabName, "prl"
      );

      if (secErrors && secErrors.length > 0) {
        errors.push(...secErrors);
      }

      if (secEntries.length > 0) {
        console.log(`[PRL] Added ${secEntries.length} CH entries from secondary/trainees sheet`);
        chEntries.push(...secEntries);
      }
    } catch (secErr: any) {
      console.error("[PRL] Failed to read secondary/trainees reporting sheet:", secErr);
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
  await updateProgress(5, `Found ${totalCh} CHs with PRL links. Resolving URLs...`);

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
    const batchResults = await Promise.all(
      batch.map(async (ch) => {
        const result = await resolveUrl(ch.url);
        resolvedCount++;
        const pct = 5 + Math.floor((resolvedCount / totalCh) * 15);
        await updateProgress(pct, `Resolving URLs: ${resolvedCount}/${totalCh}`);
        return { ch, result };
      })
    );

    for (const item of batchResults) {
      if (!item.ch.url) {
        console.log(`[URL Resolver] ⚠️  CH ${item.ch.chName}: NO LINK (Will write CH name to output with 0 players)`);
        resolvedEntries.push({
          chName: item.ch.chName,
          spreadsheetId: "",
          responseSheetUrl: item.ch.responseSheetUrl,
          registeredTeams: item.ch.registeredTeams,
        });
      } else if ("error" in item.result) {
        console.log(`[URL Resolver] ❌ CH ${item.ch.chName}: FAILED "${item.ch.url}" (${item.result.error})`);
        errors.push({ chName: item.ch.chName, error: `URL Resolution Failed: ${item.result.error}` });
        resolvedEntries.push({
          chName: item.ch.chName,
          spreadsheetId: "",
          responseSheetUrl: item.ch.responseSheetUrl,
          registeredTeams: item.ch.registeredTeams,
        });
      } else {
        console.log(`[URL Resolver] ✅ CH ${item.ch.chName}: RESOLVED -> Spreadsheet ID: ${item.result.spreadsheetId}`);
        resolvedEntries.push({
          chName: item.ch.chName,
          spreadsheetId: (item.result as ResolveResult).spreadsheetId,
          responseSheetUrl: item.ch.responseSheetUrl,
          registeredTeams: item.ch.registeredTeams,
        });
      }
    }
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
            2,
            1000,
            `Teams Count (${chEntry?.chName || "CH"})`,
            15000
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

  // Global aggregated maps across all CH response sheets
  const globalPlayerTeamMap = new Map<string, string>();
  const globalPlayerAgeMap = new Map<string, string>();

  // Response Sheet Cache Map for fast on-demand team name and age lookup
  const responseSheetCache = new Map<
    string,
    {
      teamNames: string[];
      playerTeamMap: Map<string, string>;
      playerAgeMap: Map<string, string>;
      teamSlotAgeMap: Map<string, string>;
    }
  >();

  const fetchChTeamMap = async (resUrl?: string) => {
    if (!resUrl)
      return {
        teamNames: [],
        playerTeamMap: new Map(),
        playerAgeMap: new Map(),
        teamSlotAgeMap: new Map(),
      };
    if (responseSheetCache.has(resUrl)) return responseSheetCache.get(resUrl)!;
    const res = await getTeamMapFromResponseSheet(sheets, resUrl);
    responseSheetCache.set(resUrl, res);

    for (const [k, v] of res.playerTeamMap.entries()) {
      if (v && !globalPlayerTeamMap.has(k)) {
        globalPlayerTeamMap.set(k, v);
      }
    }
    for (const [k, v] of res.playerAgeMap.entries()) {
      if (v && !globalPlayerAgeMap.has(k)) {
        globalPlayerAgeMap.set(k, v);
      }
    }

    return res;
  };

  // Pre-fetch all available response sheets in parallel to populate global player map
  try {
    const urlsToFetch = resolvedEntries.map(e => e.responseSheetUrl).filter(Boolean);
    const uniqueUrls = Array.from(new Set(urlsToFetch));
    await Promise.all(
      uniqueUrls.map(url => fetchChTeamMap(url).catch(err => console.log("[PRL] Response sheet prefetch notice:", err)))
    );
  } catch (e) {
    console.log("[PRL] Response sheet prefetch batch notice:", e);
  }

  // Determine game mode multiplier
  const gameModeStr = (job as any).gameMode || "5v5";
  const gameModeMult = parseInt(gameModeStr.charAt(0)) || 5;

  // Step 3: Read each CH's PRL sheet
  await updateProgress(20, "Reading CH PRL sheets...");

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
      console.log(`[PRL] Job run ${runId} was stopped by user. Aborting sheet reading...`);
      return { rowsWritten: 0, success: false, errors };
    }

    let chHeaderAdded = false;
    let validRowCount = 0;

    if (!spreadsheetId) {
      // CH had no link or invalid URL: paste CH name with empty player cells
      console.log(`[PRL Sheet] ⚠️  CH [${i + 1}/${resolvedEntries.length}] ${chName}: NO PRL LINK (Added header row with 0 players)`);
      const rowData = [`CH ${chName}`, "", "", "", "", ""];
      if (job.validationEnabled) {
        rowData.push("");
      }
      allRows.push(rowData);
      chStats.push({ chName, count: 0 });
      continue;
    }

    try {
      // 1. Direct fast read of default range A1:Z (no metadata overhead)
      let data = await withRetry(
        () => sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "A1:Z",
        }),
        2,
        1000,
        `Read CH Sheet (${chName})`,
        15000
      );

      let rows = data.data.values || [];

      // 2. ONLY IF the default tab returned < 3 rows (e.g. hidden tabs like Ranjhay or multi-tab like MadamBridgette), inspect tabs as a fallback
      if (rows.length < 3) {
        try {
          const meta = await withRetry(
            () => sheets.spreadsheets.get({ spreadsheetId }),
            1,
            500,
            `Get Tabs Fallback (${chName})`,
            8000
          );
          const sheetList = (meta as any)?.data?.sheets || [];
          const visibleTabs = sheetList.filter((s: any) => !s.properties?.hidden);
          const tabsToConsider = visibleTabs.length > 0 ? visibleTabs : sheetList;

          if (tabsToConsider.length > 1) {
            const validTabs = tabsToConsider.filter((s: any) => {
              const title = String(s.properties?.title || "").toUpperCase().trim();
              return !title.includes("TEMPLATE") && !title.includes("MM/DD/YY") && !title.includes("GUIDE") && !title.includes("INSTRUCTION");
            });
            const targetTab = (validTabs.length > 0 ? validTabs[0] : tabsToConsider[0])?.properties?.title || "";
            if (targetTab) {
              const fallbackData = await withRetry(
                () => sheets.spreadsheets.values.get({
                  spreadsheetId,
                  range: `'${targetTab.replace(/'/g, "''")}'!A1:Z`,
                }),
                2,
                1000,
                `Read Tab '${targetTab}' (${chName})`,
                15000
              );
              if (fallbackData.data.values && fallbackData.data.values.length > rows.length) {
                rows = fallbackData.data.values;
              }
            }
          }
        } catch (e) {
          // Keep original rows
        }
      }
      if (!rows || rows.length === 0) {
        const teamsRes = await getRegisteredTeamsCount(resolvedEntries[i]);
        let teamsMessage = "";
        if (teamsRes.count !== "0" || teamsRes.source === "error") {
          teamsMessage = `.(Teams in responses sheet: ${teamsRes.count})`;
        }
        errors.push({ chName, error: `Sheet is blank or missing data${teamsMessage}` });
        const rowData = [`CH ${chName}`, "", "", "", "", ""];
        if (job.validationEnabled) {
          rowData.push("");
        }
        allRows.push(rowData);
        chStats.push({ chName, count: 0 });
        continue;
      }

      // Find header row by looking for NAME/SERVER/UID columns
      let headerRowIdx = -1;
      let nameCol = -1, ageCol = -1, ignCol = -1, serverCol = -1, uidCol = -1, teamCol = -1;

      for (let r = 0; r < Math.min(rows.length, 30); r++) {
        const row = rows[r];
        for (let c = 0; c < row.length; c++) {
          const val = String(row[c] ?? "").trim().toUpperCase();
          if (val === "") continue;

          if (isAgeHeader(val)) {
            ageCol = c;
          } else if (isTeamNameHeader(val)) {
            teamCol = c;
          } else if (val === "IGN" || val.includes("IGN") || val.includes("GAME NAME") || val.includes("IN GAME NAME") || val.includes("IN-GAME NAME")) {
            ignCol = c;
          } else if (val === "SERVER" || val.includes("SERVER") || val.includes("ZONE") || val === "ZONE ID" || val === "SERVER ID") {
            serverCol = c;
          } else if (val === "UID" || val.includes("UID") || val.includes("USER ID") || val === "ID" || val.includes("GAME ID") || val.includes("ACCOUNT ID")) {
            uidCol = c;
          } else if (
            (val.includes("NAME") || val.includes("PLAYER") || val.includes("CAPTAIN") || val.includes("FULLNAME") || val.includes("FULL NAME")) &&
            !val.includes("IGN") &&
            !val.includes("GAME") &&
            !isAgeHeader(val) &&
            !isTeamNameHeader(val)
          ) {
            nameCol = c;
          }
        }
        if (nameCol !== -1 && serverCol !== -1 && uidCol !== -1) {
          headerRowIdx = r;
          break;
        }
        nameCol = -1; ageCol = -1; ignCol = -1; serverCol = -1; uidCol = -1; teamCol = -1;
      }

      if (headerRowIdx === -1 || nameCol === -1) {
        errors.push({ chName, error: "Could not find header row with NAME/SERVER/UID columns", type: "accessibility" });
        const rowData = [`CH ${chName}`, "", "", "", "", ""];
        if (job.validationEnabled) {
          rowData.push("");
        }
        allRows.push(rowData);
        chStats.push({ chName, count: 0 });
        continue;
      }

      // Run dynamic column correction based on data analysis
      const adjusted = adjustColumnsBasedOnData(rows, headerRowIdx, {
        nameCol,
        ignCol,
        serverCol,
        uidCol,
        ageCol,
      });
      
      if (adjusted.corrected) {
        nameCol = adjusted.nameCol;
        ignCol = adjusted.ignCol;
        serverCol = adjusted.serverCol;
        uidCol = adjusted.uidCol;
        if (adjusted.ageCol !== undefined) ageCol = adjusted.ageCol;
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
        let age = ageCol !== -1 ? String(row[ageCol] ?? "").trim() : "";
        let ign = ignCol !== -1 ? String(row[ignCol] ?? "").trim() : "";
        let server = String(row[serverCol] ?? "").trim();
        let uid = String(row[uidCol] ?? "").trim();

        if (!name && !uid) continue;

        // Skip formula placeholder rows and spreadsheet errors
        if (
          isFormulaOrError(name) ||
          isFormulaOrError(server) ||
          isFormulaOrError(uid) ||
          (ignCol !== -1 && isFormulaOrError(ign)) ||
          (ageCol !== -1 && isFormulaOrError(age))
        ) {
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

        const rawTeam = teamCol !== -1 ? String(row[teamCol] ?? "").trim() : "";
        let teamName = isAgreementValue(rawTeam) ? "" : rawTeam;

        // If teamName is empty and a response sheet URL exists, fetch team map on-demand with caching
        if (!teamName && responseSheetUrl) {
          const { teamNames: respTeamNames, playerTeamMap } = await fetchChTeamMap(responseSheetUrl);
          
          const uidKey = uid ? uid.toLowerCase() : "";
          const uidClean = uid ? uid.replace(/\D/g, "") : "";
          const ignKey = ign ? ign.toLowerCase() : "";
          const nameKey = name ? name.toLowerCase() : "";
          const ignClean = ignKey.replace(/[^a-z0-9]/g, "");
          const nameClean = nameKey.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
          const nameNoSpace = nameKey.replace(/[^a-z0-9]/g, "");

          let matchedTeam = "";
          if (uidKey && playerTeamMap.has(uidKey)) {
            matchedTeam = playerTeamMap.get(uidKey)!;
          } else if (uidClean && playerTeamMap.has(uidClean)) {
            matchedTeam = playerTeamMap.get(uidClean)!;
          } else if (ignKey && playerTeamMap.has(ignKey)) {
            matchedTeam = playerTeamMap.get(ignKey)!;
          } else if (ignClean && playerTeamMap.has(ignClean)) {
            matchedTeam = playerTeamMap.get(ignClean)!;
          } else if (nameKey && playerTeamMap.has(nameKey)) {
            matchedTeam = playerTeamMap.get(nameKey)!;
          } else if (nameClean && playerTeamMap.has(nameClean)) {
            matchedTeam = playerTeamMap.get(nameClean)!;
          } else if (nameNoSpace && playerTeamMap.has(nameNoSpace)) {
            matchedTeam = playerTeamMap.get(nameNoSpace)!;
          } else if (respTeamNames.length > 0) {
            const teamIdx = Math.floor(validRowCount / gameModeMult);
            if (teamIdx < respTeamNames.length) {
              matchedTeam = respTeamNames[teamIdx];
            }
          }
          if (matchedTeam && !isAgreementValue(matchedTeam)) {
            teamName = matchedTeam;
          }
        }

        // Global map fallback across all CH response sheets for teamName
        if (!teamName) {
          const uidKey = uid ? uid.toLowerCase() : "";
          const uidClean = uid ? uid.replace(/\D/g, "") : "";
          const ignKey = ign ? ign.toLowerCase() : "";
          const nameKey = name ? name.toLowerCase() : "";
          const ignClean = ignKey.replace(/[^a-z0-9]/g, "");
          const nameClean = nameKey.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
          const nameNoSpace = nameKey.replace(/[^a-z0-9]/g, "");

          let matchedGlobal = "";
          if (uidKey && globalPlayerTeamMap.has(uidKey)) matchedGlobal = globalPlayerTeamMap.get(uidKey)!;
          else if (uidClean && globalPlayerTeamMap.has(uidClean)) matchedGlobal = globalPlayerTeamMap.get(uidClean)!;
          else if (ignKey && globalPlayerTeamMap.has(ignKey)) matchedGlobal = globalPlayerTeamMap.get(ignKey)!;
          else if (ignClean && globalPlayerTeamMap.has(ignClean)) matchedGlobal = globalPlayerTeamMap.get(ignClean)!;
          else if (nameKey && globalPlayerTeamMap.has(nameKey)) matchedGlobal = globalPlayerTeamMap.get(nameKey)!;
          else if (nameClean && globalPlayerTeamMap.has(nameClean)) matchedGlobal = globalPlayerTeamMap.get(nameClean)!;
          else if (nameNoSpace && globalPlayerTeamMap.has(nameNoSpace)) matchedGlobal = globalPlayerTeamMap.get(nameNoSpace)!;

          if (matchedGlobal && !isAgreementValue(matchedGlobal)) {
            teamName = matchedGlobal;
          }
        }

        let isDuplicate = false;
        if (uid) {
          if (seenUids.has(uid)) {
            isDuplicate = true;
            const prevCh = seenUids.get(uid)!;
            const sameServer = prevCh.server === server;
            const sameCh = prevCh.chName === chName;

            // Synchronize teamName between occurrences so both have the team name (ensuring neither is an agreement value)
            if (teamName && !isAgreementValue(teamName) && (!prevCh.baseDupRowData[6] || isAgreementValue(prevCh.baseDupRowData[6]))) {
              prevCh.baseDupRowData[6] = teamName;
            } else if ((!teamName || isAgreementValue(teamName)) && prevCh.baseDupRowData[6] && !isAgreementValue(prevCh.baseDupRowData[6])) {
              teamName = prevCh.baseDupRowData[6];
            }

            let errorMsg = "";
            let dupWith = "";
            let dupType = "";

            if (sameServer) {
              if (sameCh) {
                errorMsg = `Duplicate player entry found: ${name || "Unknown"} (Server: ${server}, UID: ${uid}) was already registered earlier in CH ${chName}`;
                dupWith = `Same CH (${chName})`;
                dupType = "Internal Duplicate";
              } else {
                errorMsg = `Duplicate player entry found: ${name || "Unknown"} (Server: ${server}, UID: ${uid}) was already registered in CH ${prevCh.chName}`;
                dupWith = `Duplicated with ${prevCh.chName}`;
                dupType = "Cross-Host Duplicate";
              }
            } else {
              if (sameCh) {
                errorMsg = `Duplicate MLBB ID found (different server entered): ${name || "Unknown"} (UID: ${uid}, Server: ${server}) was already registered earlier in CH ${chName} (with Server: ${prevCh.server})`;
                dupWith = `Same CH (${chName}, Original Server: ${prevCh.server})`;
                dupType = "Cross-Server Duplicate (Altered Server)";
              } else {
                errorMsg = `Duplicate MLBB ID found (different server entered): ${name || "Unknown"} (UID: ${uid}, Server: ${server}) was registered in CH ${chName}, but originally registered with Server ${prevCh.server} in CH ${prevCh.chName}`;
                dupWith = `Duplicated with ${prevCh.chName} (Original Server: ${prevCh.server})`;
                dupType = "Cross-Server Duplicate (Altered Server)";
              }
            }

            errors.push({ chName, error: errorMsg });

            if (!dupGroupMap.has(uid)) {
              dupGroupMap.set(uid, nextDupGroupIdx++);
            }
            const groupIdx = dupGroupMap.get(uid)!;

            // Push original occurrence to duplicateRowsList if not added yet
            if (!prevCh.addedToDupSheet) {
              const origDupWith = sameCh ? `Same CH (${chName})` : `Duplicated with ${chName}`;
              const origDupType = sameServer ? (sameCh ? "Internal Duplicate" : "Cross-Host Duplicate") : `Original Entry (Duplicate in ${chName})`;
              duplicateRowsList.push({
                rowData: [...prevCh.baseDupRowData, origDupWith, origDupType],
                groupIdx,
              });
              prevCh.addedToDupSheet = true;
            }

            // Push current duplicate occurrence to duplicateRowsList
            duplicateRowsList.push({
              rowData: [chName, name, age, ign, server, uid, teamName, dupWith, dupType],
              groupIdx,
            });

            // Push the first occurrence index to the list so BOTH get highlighted!
            if (!duplicateRowIndices.includes(prevCh.rowIdx)) {
              duplicateRowIndices.push(prevCh.rowIdx);
            }
          } else {
            // Track the row index that this player will occupy in the final sheet
            seenUids.set(uid, {
              chName,
              server,
              rowIdx: 1 + allRows.length,
              baseDupRowData: [chName, name, age, ign, server, uid, teamName],
              addedToDupSheet: false,
            });
          }
        }

        const rowData = [!chHeaderAdded ? `CH ${chName}` : "", name, age, ign, server, uid];
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

      if (!chHeaderAdded) {
        const rowData = [`CH ${chName}`, "", "", "", "", ""];
        if (job.validationEnabled) {
          rowData.push("");
        }
        allRows.push(rowData);
        chHeaderAdded = true;
      }

      chStats.push({ chName, count: validRowCount });
      console.log(`[PRL Sheet] ✅ CH [${i + 1}/${resolvedEntries.length}] ${chName}: Processed ${validRowCount} valid players (Response Sheet: ${responseSheetUrl ? "FOUND" : "NONE"})`);

      // Determine Validation Thresholds based on mode
      const isOnsite = gameModeStr === "Onsite 5v5";

      const minPlayers = isOnsite ? 25 : 10 * gameModeMult;
      // Onsite 5v5 requires a strict minimum of 25 players (5 teams). Standard modes allow up to 4 missing (e.g., 46 for 5v5 / 10 teams).
      const requiredThreshold = isOnsite ? 25 : Math.max(1, minPlayers - 4);

      if (validRowCount < requiredThreshold) {
        const teamsRes = await getRegisteredTeamsCount(resolvedEntries[i]);
        let teamsMessage = "";
        if (teamsRes.count !== "0" || teamsRes.source === "error") {
          teamsMessage = `.(Teams in responses sheet: ${teamsRes.count})`;
        }
        const targetTeams = isOnsite ? 5 : 10;
        errors.push({ chName, error: `Dissolved Tournament: only ${validRowCount} valid players found (Mode: ${gameModeStr}, Target: ${minPlayers} players [${targetTeams} teams], Minimum allowed: ${requiredThreshold})${teamsMessage}` });
      }

    } catch (error: any) {
      const msg = error?.message || String(error);
      console.log(`[PRL Sheet] ❌ CH [${i + 1}/${resolvedEntries.length}] ${chName}: Error reading sheet (${msg})`);
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
      if (!chHeaderAdded) {
        const rowData = [`CH ${chName}`, "", "", "", "", ""];
        if (job.validationEnabled) {
          rowData.push("");
        }
        allRows.push(rowData);
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
          const server = row[4]; // Server (Index 4)
          const uid = row[5]; // UID (Index 5)
          // Skip the CH header rows which have empty UID
          if (server && uid && row[0] === "") {
            try {
              const result = await verifyMlbbId(String(uid), String(server));
              if (result.success && result.ign) {
                row[3] = result.ign; // Update IGN with verified name (Index 3)
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

  const endCol = job.validationEnabled ? "G" : "F";
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
  const DUP_HEADER = ["CH", "Players Name", "Age", "Players IGN", "Server", "UID", "TEAM NAME", "DUPLICATED WITH CH", "DUPLICATE TYPE"];
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

  // Step 6: Apply formatting
  await updateProgress(95, "Applying formatting...");
  const colCount = HEADER.length;
  const requests: any[] = [];

  // Duplicates tab formatting with alternating group colors and explicit column widths
  if (dupSheetId !== undefined) {
    const dupColCount = DUP_HEADER.length;
    
    // Freeze header row
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: dupSheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    });

    // Set Header row height to 36px
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: dupSheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 36 },
        fields: "pixelSize",
      },
    });

    // Set Data rows height to 28px
    if (finalDupRows.length > 1) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: dupSheetId, dimension: "ROWS", startIndex: 1, endIndex: finalDupRows.length },
          properties: { pixelSize: 28 },
          fields: "pixelSize",
        },
      });
    }

    // Header cell formatting (Deep Cyber Navy with bold white text)
    requests.push({
      repeatCell: {
        range: { sheetId: dupSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: dupColCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.09, green: 0.11, blue: 0.19 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
      },
    });

    // Base formatting for all data rows in Duplicates Tab
    if (finalDupRows.length > 1) {
      requests.push({
        repeatCell: {
          range: { sheetId: dupSheetId, startRowIndex: 1, endRowIndex: finalDupRows.length, startColumnIndex: 0, endColumnIndex: dupColCount },
          cell: {
            userEnteredFormat: {
              borders: {
                top: { style: "SOLID", color: { red: 0.82, green: 0.84, blue: 0.88 } },
                bottom: { style: "SOLID", color: { red: 0.82, green: 0.84, blue: 0.88 } },
                left: { style: "SOLID", color: { red: 0.82, green: 0.84, blue: 0.88 } },
                right: { style: "SOLID", color: { red: 0.82, green: 0.84, blue: 0.88 } },
              },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              wrapStrategy: "WRAP",
              textFormat: { fontSize: 10, foregroundColor: { red: 0.1, green: 0.12, blue: 0.2 } },
            },
          },
          fields: "userEnteredFormat(borders,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)",
        },
      });
    }

    // Color palette for alternating duplicate groups:
    // Group 0, 2, 4... -> Warm Soft Peach/Cream #FFF3E0
    // Group 1, 3, 5... -> Soft Ice Blue #EBF5FF
    const COLOR_PEACH = { red: 1.0, green: 0.95, blue: 0.88 };
    const COLOR_ICE_BLUE = { red: 0.92, green: 0.96, blue: 1.0 };

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
            },
          },
          fields: "userEnteredFormat.backgroundColor",
        },
      });
    });

    // Explicit Column Widths for Duplicates Tab:
    // 0: CH (150px), 1: Players Name (200px), 2: Age (70px), 3: Players IGN (170px), 4: Server (90px), 5: UID (130px), 6: TEAM NAME (180px), 7: DUPLICATED WITH CH (220px), 8: DUPLICATE TYPE (220px)
    const dupColWidths = [150, 200, 70, 170, 90, 130, 180, 220, 220];
    dupColWidths.forEach((width, colIdx) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId: dupSheetId, dimension: "COLUMNS", startIndex: colIdx, endIndex: colIdx + 1 },
          properties: { pixelSize: width },
          fields: "pixelSize",
        },
      });
    });
  }

  // Pre Registered List Tab Formatting
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: targetSheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // Set Header row height to 36px
  requests.push({
    updateDimensionProperties: {
      range: { sheetId: targetSheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 36 },
      fields: "pixelSize",
    },
  });

  // Set Data rows height to 26px
  if (finalRows.length > 1) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: targetSheetId, dimension: "ROWS", startIndex: 1, endIndex: finalRows.length },
        properties: { pixelSize: 26 },
        fields: "pixelSize",
      },
    });
  }

  // Header row formatting (Deep Cyber Navy with bold white text)
  requests.push({
    repeatCell: {
      range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.09, green: 0.11, blue: 0.19 },
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
    },
  });

  // Data rows base formatting (clean borders, centered text)
  requests.push({
    repeatCell: {
      range: { sheetId: targetSheetId, startRowIndex: 1, endRowIndex: finalRows.length, startColumnIndex: 0, endColumnIndex: colCount },
      cell: {
        userEnteredFormat: {
          borders: {
            top: { style: "SOLID", color: { red: 0.85, green: 0.87, blue: 0.90 } },
            bottom: { style: "SOLID", color: { red: 0.85, green: 0.87, blue: 0.90 } },
            left: { style: "SOLID", color: { red: 0.85, green: 0.87, blue: 0.90 } },
            right: { style: "SOLID", color: { red: 0.85, green: 0.87, blue: 0.90 } },
          },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
          textFormat: { fontSize: 10, foregroundColor: { red: 0.1, green: 0.12, blue: 0.2 } },
        },
      },
      fields: "userEnteredFormat(borders,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)",
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
              backgroundColor: { red: 0.92, green: 0.94, blue: 1.0 },
              textFormat: { bold: true, foregroundColor: { red: 0.12, green: 0.15, blue: 0.45 } }
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
            backgroundColor: { red: 1, green: 0.88, blue: 0.88 },
            textFormat: { foregroundColor: { red: 0.65, green: 0.1, blue: 0.1 }, bold: true }
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

  // Explicit Column Widths for Pre Registered List Tab:
  // 0: CH (150px), 1: Players Name (220px), 2: Age (70px), 3: Players IGN (180px), 4: Server (90px), 5: UID (140px), 6: Status (120px)
  const prlColWidths = [150, 220, 70, 180, 90, 140];
  if (job.validationEnabled) prlColWidths.push(120);

  prlColWidths.forEach((width, colIdx) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: targetSheetId, dimension: "COLUMNS", startIndex: colIdx, endIndex: colIdx + 1 },
        properties: { pixelSize: width },
        fields: "pixelSize",
      },
    });
  });

  requests.push({
    updateBorders: {
      range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
      bottom: { style: "SOLID_MEDIUM", color: { red: 0.09, green: 0.11, blue: 0.19 } },
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

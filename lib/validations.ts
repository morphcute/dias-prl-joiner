import { z } from "zod";

export const JoinerJobSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  type: z.enum(["diamonds", "prl"]),
  chEntries: z.string().min(1, "At least one CH entry is required"),
  targetSpreadsheetName: z.string().min(1, "Target sheet name is required"),
  sheetName: z.string().default("Consolidated"),
  validationEnabled: z.boolean().default(false),
});

export type JoinerJobInput = z.infer<typeof JoinerJobSchema>;

/**
 * Parse CH entries from textarea input.
 * Each line: "CH Name | URL"
 * Returns structured array.
 */
export function parseChEntries(raw: string): { chName: string; url: string }[] {
  return raw
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length >= 2) {
        return { chName: parts[0], url: parts.slice(1).join("|").trim() };
      }
      // If no pipe, treat the whole line as URL with auto-name
      return { chName: `CH ${line.substring(0, 20)}...`, url: parts[0] };
    });
}

/**
 * Checks if a string value represents a spreadsheet formula or error token.
 */
export function isFormulaOrError(str: string): boolean {
  const upper = str.toUpperCase().trim();
  if (upper.startsWith("=")) return true;
  if (upper.includes("IMPORTRANGE")) return true;
  if (upper.includes("FILTER(")) return true;
  if (upper.includes("VSTACK(")) return true;
  if (upper.includes("ARRAYFORMULA(")) return true;
  if (upper.includes("QUERY(")) return true;
  if (upper.includes("INDEX(")) return true;
  if (upper.includes("MATCH(")) return true;
  if (
    ["#N/A", "#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#NUM!", "#NULL!", "#ERROR!"].includes(
      upper
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Samples data rows below the header row to verify and correct column indexes.
 * Resolves misaligned headers or swapped columns by analyzing the actual data types.
 */
export function adjustColumnsBasedOnData(
  rows: string[][],
  headerRowIdx: number,
  initialMapping: { nameCol: number; ignCol: number; serverCol: number; uidCol: number }
): { nameCol: number; ignCol: number; serverCol: number; uidCol: number; corrected: boolean } {
  const mapping = { ...initialMapping };
  
  // Filter out any columns that weren't mapped at all
  const colsToAnalyze = [mapping.nameCol, mapping.ignCol, mapping.serverCol, mapping.uidCol].filter(
    c => c !== -1
  );
  if (colsToAnalyze.length < 3) {
    return { ...mapping, corrected: false };
  }

  // Sample data from headerRowIdx + 1 to headerRowIdx + 20 (up to 10 rows)
  const sampleRows: string[][] = [];
  for (let r = headerRowIdx + 1; r < Math.min(rows.length, headerRowIdx + 20); r++) {
    const row = rows[r];
    // Check if the name field in the initial mapping looks like a formula/empty
    const nameVal = String(row[mapping.nameCol] ?? "").trim();
    if (!nameVal || isFormulaOrError(nameVal)) continue;
    sampleRows.push(row);
    if (sampleRows.length >= 10) break;
  }

  if (sampleRows.length === 0) {
    return { ...mapping, corrected: false };
  }

  // Analyze each column in colsToAnalyze
  const colStats = colsToAnalyze.map(col => {
    let nonEmptyCount = 0;
    let numericCount = 0;
    let totalDigitLength = 0;
    let letterCount = 0;

    sampleRows.forEach(row => {
      const val = String(row[col] ?? "").trim();
      if (!val) return;
      nonEmptyCount++;

      const digits = val.replace(/\D/g, "");
      if (digits.length > 0 && digits.length >= val.length * 0.7) {
        numericCount++;
        totalDigitLength += digits.length;
      }
      if (/[a-zA-Z]/.test(val)) {
        letterCount++;
      }
    });

    const isNumeric = nonEmptyCount > 0 && numericCount / nonEmptyCount > 0.6;
    const avgDigitLen = numericCount > 0 ? totalDigitLength / numericCount : 0;
    const isText = nonEmptyCount > 0 && letterCount / nonEmptyCount > 0.4;

    return {
      col,
      isNumeric,
      avgDigitLen,
      isText,
      nonEmptyCount,
    };
  });

  // Let's see if we have a mismatch
  let hasMismatch = false;

  const currentServerStat = colStats.find(s => s.col === mapping.serverCol);
  const currentUidStat = colStats.find(s => s.col === mapping.uidCol);
  const currentIgnStat = colStats.find(s => s.col === mapping.ignCol);

  if (currentServerStat && currentServerStat.isText) hasMismatch = true;
  if (currentUidStat && currentUidStat.isText) hasMismatch = true;
  if (currentIgnStat && currentIgnStat.isNumeric && currentIgnStat.avgDigitLen > 6) hasMismatch = true;
  if (currentServerStat && currentUidStat && currentServerStat.isNumeric && currentUidStat.isNumeric) {
    if (currentServerStat.avgDigitLen > currentUidStat.avgDigitLen) hasMismatch = true;
  }

  if (!hasMismatch) {
    return { ...mapping, corrected: false };
  }

  // Perform Re-assignment
  const numericCols = colStats.filter(s => s.isNumeric).sort((a, b) => a.avgDigitLen - b.avgDigitLen);
  const textCols = colStats.filter(s => !s.isNumeric).sort((a, b) => a.col - b.col);

  let newServerCol = mapping.serverCol;
  let newUidCol = mapping.uidCol;
  if (numericCols.length >= 2) {
    newServerCol = numericCols[0].col;
    newUidCol = numericCols[1].col;
  } else if (numericCols.length === 1) {
    if (numericCols[0].avgDigitLen > 6) {
      newUidCol = numericCols[0].col;
    } else {
      newServerCol = numericCols[0].col;
    }
  }

  let newNameCol = mapping.nameCol;
  let newIgnCol = mapping.ignCol;
  if (textCols.length >= 2) {
    newNameCol = textCols[0].col;
    newIgnCol = textCols[1].col;
  } else if (textCols.length === 1) {
    newNameCol = textCols[0].col;
  }

  const mappingChanged =
    newNameCol !== mapping.nameCol ||
    newIgnCol !== mapping.ignCol ||
    newServerCol !== mapping.serverCol ||
    newUidCol !== mapping.uidCol;

  return {
    nameCol: newNameCol,
    ignCol: newIgnCol,
    serverCol: newServerCol,
    uidCol: newUidCol,
    corrected: mappingChanged,
  };
}

/**
 * Detects the CH Nickname and Link columns in the reporting sheet dynamically by scanning the headers.
 */
export function detectReportingSheetColumns(
  rows: string[][],
  type: "prl" | "diamonds"
): { 
  nicknameCol: number; 
  linkCol: number; 
  responseSheetCol: number;
  registeredTeamsCol: number;
  headerRowIdx: number;
} {
  let nicknameCol = -1;
  let linkCol = -1;
  let responseSheetCol = -1;
  let registeredTeamsCol = -1;
  let headerRowIdx = -1;

  // Scan the first 10 rows for headers by name
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] ?? "").trim().toUpperCase();
      if (!val) continue;

      // Detect "CH Nickname" column by header name
      if (
        val === "CH NICKNAME" ||
        val === "NICKNAME" ||
        (val.includes("NICKNAME") && val.includes("CH")) ||
        val.includes("CH NAME") ||
        val.includes("CH FULL NAME")
      ) {
        nicknameCol = c;
      }

      // Detect "Tournament Response Sheet" column by header name
      if (
        val === "TOURNAMENT RESPONSE SHEET" ||
        val === "TOURNAMENT RESPONSES SHEET" ||
        val === "RESPONSE SHEET" ||
        val === "TOURNAMENT RESPONSE" ||
        val.includes("RESPONSE SHEET") ||
        val.includes("TOURNAMENT RESPONSE") ||
        val.includes("FORM RESPONSE")
      ) {
        responseSheetCol = c;
      }

      // Detect Registered Teams count column by header name
      if (
        c !== responseSheetCol &&
        (val === "REGISTERED TEAMS" ||
          val === "NO. OF TEAMS" ||
          val === "NUMBER OF TEAMS" ||
          val === "TOTAL TEAMS" ||
          (val.includes("REGISTERED") && val.includes("TEAMS")))
      ) {
        registeredTeamsCol = c;
      }

      // Detect "Pre Registered List Link" or "Diamond Winners Sheet" column by header name
      if (type === "prl") {
        if (
          val === "PRE REGISTERED LIST LINK" ||
          val.includes("PRE REGISTERED LIST") ||
          val.includes("PRE-REGISTERED") ||
          val.includes("PRL") ||
          val.includes("REGISTERED LIST")
        ) {
          linkCol = c;
        }
      } else {
        if (
          val === "DIAMOND WINNERS SHEET" ||
          val.includes("DIAMOND WINNERS") ||
          val.includes("DIAMONDS WINNER") ||
          val.includes("DIAS WINNER") ||
          val.includes("WINNERS SHEET") ||
          val.includes("DIAMONDS")
        ) {
          linkCol = c;
        }
      }
    }

    if (nicknameCol !== -1 && linkCol !== -1) {
      headerRowIdx = r;
      break;
    }
  }

  return { nicknameCol, linkCol, responseSheetCol, registeredTeamsCol, headerRowIdx };
}



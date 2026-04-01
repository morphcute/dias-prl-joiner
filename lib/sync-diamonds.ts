import { prisma } from "@/lib/prisma";
import { JoinerJob } from "@prisma/client";
import { google } from "googleapis";
import { getUserAuth } from "./google";
import { resolveUrl, ResolveResult } from "./url-resolver";
import { verifyMlbbId } from "./mlbb";

interface ChError {
  chName: string;
  error: string;
}

export async function syncDiamonds(job: JoinerJob, runId: string) {
  console.log(`[Diamonds] Starting sync for job ${job.id} (${job.name})`);

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

  // Header: CH, NAME, SERVER, UID, CODE, AMOUNT, REMARKS
  const HEADER = ["CH", "NAME", "SERVER", "UID", "CODE", "AMOUNT", "REMARKS"];
  if (job.validationEnabled) {
    HEADER.push("STATUS");
  }

  await updateProgress(2, "Reading reporting sheet...");

  // Step 1: Read CH entries from reporting sheet
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

  // Determine target columns based on Game Mode (Special = 1v1, 2v2, 3v3)
  const gameModeStr = (job as any).gameMode || "";
  const isSpecial = ["1v1", "2v2", "3v3"].includes(gameModeStr);
  const isOnsite = gameModeStr === "Onsite 5v5";
  const diamondCol = isOnsite ? "S" : isSpecial ? "O" : "M";

  // Read CH entries using batchGet: Column D = CH Nickname, Column M/O = Diamond Winners Sheet link
  const batchResult = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: (job as any).spreadsheetId,
    ranges: [
      `'${reportingTabName}'!D4:D`,   // CH Nicknames
      `'${reportingTabName}'!${diamondCol}4:${diamondCol}`,   // Diamond Winners Sheet links
    ],
  });

  const nicknameRows = batchResult.data.valueRanges?.[0]?.values || [];
  const linkRows = batchResult.data.valueRanges?.[1]?.values || [];

  console.log(`[Diamonds] Tab: "${reportingTabName}", Mode: ${isSpecial ? "Special" : "5v5"}, Diamond links (col ${diamondCol}): ${linkRows.length} rows`);

  const chEntries: { chName: string; url: string }[] = [];
  const maxLen = Math.max(nicknameRows.length, linkRows.length);

  for (let i = 0; i < maxLen; i++) {
    const chNickname = String(nicknameRows[i]?.[0] ?? "").trim();
    const diamondLink = String(linkRows[i]?.[0] ?? "").trim();

    if (!chNickname) continue;
    if (
      !diamondLink ||
      diamondLink.toUpperCase() === "DISSOLVED" ||
      diamondLink.toUpperCase().includes("NO EVENT") ||
      diamondLink.toUpperCase() === "EVENT" ||
      (!diamondLink.startsWith("http") && !diamondLink.startsWith("www"))
    ) {
      continue;
    }

    chEntries.push({ chName: chNickname, url: diamondLink });
  }

  console.log(`[Diamonds] Found ${chEntries.length} valid CH entries with Diamond links`);

  if (chEntries.length === 0) {
    errors.push({ chName: "Reporting Sheet", error: "No CH entries with Diamond sheet links found in column M" });
    await prisma.joinerRun.update({
      where: { id: runId },
      data: { errors: JSON.stringify(errors) },
    });
    return { rowsWritten: 0, success: true, errors };
  }

  const totalCh = chEntries.length;
  await updateProgress(5, `Found ${totalCh} CHs with Diamond links. Resolving URLs...`);

  // Step 2: Resolve all URLs
  const resolvedEntries: { chName: string; spreadsheetId: string }[] = [];

  for (let i = 0; i < chEntries.length; i++) {
    const ch = chEntries[i];
    const pct = 5 + Math.floor((i / totalCh) * 15);
    await updateProgress(pct, `Resolving URL for ${ch.chName}...`);

    const result = await resolveUrl(ch.url);
    if ("error" in result) {
      errors.push({ chName: ch.chName, error: `URL Resolution Failed: ${result.error}` });
      continue;
    }

    resolvedEntries.push({ chName: ch.chName, spreadsheetId: (result as ResolveResult).spreadsheetId });
  }

  // Step 3: Read each CH's sheet
  await updateProgress(20, "Reading CH diamond sheets...");

  for (let i = 0; i < resolvedEntries.length; i++) {
    const { chName, spreadsheetId } = resolvedEntries[i];
    const pct = 20 + Math.floor((i / resolvedEntries.length) * 40);
    await updateProgress(pct, `Reading ${chName}'s sheet...`);

    if (i > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }

    try {
      let sheetData: any = null;
      let retries = 0;
      while (retries < 3) {
        try {
          // Range "A1:Z" defaults to the first sheet, avoiding a redundant API call that doubles quota hits
          sheetData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "A1:Z",
          });
          break; // success
        } catch (e: any) {
          if (e.message && e.message.includes("Quota exceeded") && retries < 2) {
            retries++;
            const waitTime = retries * 8000; // wait 8s, then 16s
            console.log(`[Diamond] Quota exceeded on ${chName}. Retrying in ${waitTime}ms... (Attempt ${retries}/2)`);
            await new Promise((res) => setTimeout(res, waitTime));
          } else {
            throw e; // Break while loop and trigger outer try/catch
          }
        }
      }

      const rows = sheetData.data.values;
      if (!rows || rows.length === 0) {
        errors.push({ chName, error: "Sheet is blank/empty" });
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
        errors.push({ chName, error: "Could not find header row with NAME/SERVER/UID columns" });
        continue;
      }

      let chHeaderAdded = false;
      let playerCount = 0;

      // Extract data rows
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const name = String(row[nameCol] ?? "").trim();
        const server = String(row[serverCol] ?? "").trim();
        const uid = String(row[uidCol] ?? "").trim();
        const code = codeCol !== -1 ? String(row[codeCol] ?? "").trim() : "";
        const amount = amountCol !== -1 ? String(row[amountCol] ?? "").trim() : "";
        const remarks = remarksCol !== -1 ? String(row[remarksCol] ?? "").trim() : "";

        if (!name && !uid) continue;
        if (name.toUpperCase() === "TOTAL" || name.toUpperCase() === "TOTALS") continue;

        if (!remarks.toUpperCase().includes("CH HANDLER")) {
           playerCount++;
        }

        let isDuplicate = false;
        if (uid && server) {
          const uniquePlayerIdentifier = `${server}-${uid}`;
          if (seenUids.has(uniquePlayerIdentifier)) {
            isDuplicate = true;
            const prev = seenUids.get(uniquePlayerIdentifier)!;
            errors.push({ chName, error: `Duplicate winner found: ${name} (Server: ${server}, UID: ${uid}) was already registered in CH ${prev.chName}` });
            
            if (!duplicateRowIndices.includes(prev.rowIdx)) {
               duplicateRowIndices.push(prev.rowIdx);
            }
          } else {
            seenUids.set(uniquePlayerIdentifier, { chName, rowIdx: 1 + allRows.length });
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
        errors.push({ chName, error: `Empty Tournament: No actual players found in the sheet. (Did the CH forget to input players?)` });
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes("403") || msg.includes("not found") || msg.includes("permission")) {
        errors.push({ chName, error: "Sheet is not publicly accessible (403). CH needs to set sharing to 'Anyone with the link'." });
      } else if (msg.includes("404")) {
        errors.push({ chName, error: "Sheet not found (404). The spreadsheet may have been deleted." });
      } else {
        errors.push({ chName, error: `Error reading sheet: ${msg}` });
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
        const server = row[2]; // SERVER
        const uid = row[3]; // UID
        if (server && uid) {
          try {
            const result = await verifyMlbbId(uid, server);
            if (result.success && result.ign) {
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

  // Step 6: Formatting
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

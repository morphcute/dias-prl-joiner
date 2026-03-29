import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getUserAuth } from "@/lib/google";

/**
 * Extract spreadsheet ID and GID from a full Google Sheets URL.
 */
function parseSheetUrl(url: string): { spreadsheetId: string; gid?: string } | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  return { spreadsheetId: match[1], gid: gidMatch?.[1] };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.joinerJob.findMany({
    where: { userId: session.user.id },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Parse the reporting sheet URL
  const parsed = parseSheetUrl(body.reportingSheetUrl || "");
  if (!parsed) {
    return NextResponse.json({ error: "Invalid reporting sheet URL" }, { status: 400 });
  }

  // Create target spreadsheet in user's Google Drive
  let targetSpreadsheetId = body.targetSpreadsheetId;
  const targetName = body.targetSpreadsheetName || body.name;

  if (!targetSpreadsheetId && targetName) {
    try {
      const authClient = await getUserAuth(session.user.id);
      const drive = google.drive({ version: "v3", auth: authClient });

      const file = await drive.files.create({
        requestBody: {
          name: targetName,
          mimeType: "application/vnd.google-apps.spreadsheet",
        },
        fields: "id",
      });

      targetSpreadsheetId = file.data.id;
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to create target spreadsheet: ${error.message}` },
        { status: 500 }
      );
    }
  }

  const job = await prisma.joinerJob.create({
    data: {
      name: body.name,
      type: body.type || "diamonds",
      spreadsheetId: parsed.spreadsheetId,
      reportingSheetGid: parsed.gid || null,
      targetSpreadsheetId,
      targetSpreadsheetName: targetName,
      sheetName: body.sheetName || (body.type === "prl" ? "Pre Registered List" : "Diamond Rewards"),
      validationEnabled: body.validationEnabled || false,
      gameMode: body.gameMode || "5v5",
      userId: session.user.id,
    },
  });

  return NextResponse.json(job, { status: 201 });
}

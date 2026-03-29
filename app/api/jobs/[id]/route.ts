import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.joinerJob.findFirst({
    where: { id, userId: session.user.id },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 5,
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const job = await prisma.joinerJob.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.spreadsheetId !== undefined && { spreadsheetId: body.spreadsheetId }),
      ...(body.reportingSheetGid !== undefined && { reportingSheetGid: body.reportingSheetGid }),
      ...(body.targetSpreadsheetName !== undefined && { targetSpreadsheetName: body.targetSpreadsheetName }),
      ...(body.sheetName !== undefined && { sheetName: body.sheetName }),
      ...(body.validationEnabled !== undefined && { validationEnabled: body.validationEnabled }),
      ...(body.gameMode !== undefined && { gameMode: body.gameMode }),
    },
  });

  return NextResponse.json(job);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.joinerJob.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}

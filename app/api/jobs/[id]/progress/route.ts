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

  const run = await prisma.joinerRun.findFirst({
    where: {
      jobId: id,
      job: { userId: session.user.id },
    },
    orderBy: { startedAt: "desc" },
  });

  if (!run) {
    return NextResponse.json({
      status: "idle",
      progress: 0,
      progressMessage: null,
    });
  }

  return NextResponse.json({
    status: run.status,
    progress: run.progress,
    progressMessage: run.progressMessage,
    errors: run.errors,
    rowsWritten: run.rowsWritten,
  });
}

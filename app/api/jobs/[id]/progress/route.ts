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

  // Stale Run Recovery: If run is in "running" status but hasn't updated in > 2.5 minutes (150,000 ms),
  // it means the background HTTP execution timed out or socket dropped. Auto-mark it as failed.
  if (run.status === "running") {
    const STALE_TIMEOUT_MS = 150000; // 2.5 minutes
    const lastUpdate = new Date((run as any).updatedAt || run.startedAt).getTime();
    const elapsed = Date.now() - lastUpdate;

    if (elapsed > STALE_TIMEOUT_MS) {
      console.warn(`[Auto-Recovery] Marking run ${run.id} as failed (stalled for ${Math.round(elapsed / 1000)}s)`);
      const updatedRun = await prisma.joinerRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          progress: 100,
          progressMessage: "Sync connection timed out. Click 'Run Engine' to auto-resume.",
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        status: updatedRun.status,
        progress: updatedRun.progress,
        progressMessage: updatedRun.progressMessage,
        errors: updatedRun.errors,
        rowsWritten: updatedRun.rowsWritten,
      });
    }
  }

  return NextResponse.json({
    status: run.status,
    progress: run.progress,
    progressMessage: run.progressMessage,
    errors: run.errors,
    rowsWritten: run.rowsWritten,
  });
}

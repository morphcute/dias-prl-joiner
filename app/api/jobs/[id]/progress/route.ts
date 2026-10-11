import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const responseHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  if (!run) {
    return NextResponse.json(
      {
        status: "idle",
        progress: 0,
        progressMessage: null,
      },
      { headers: responseHeaders }
    );
  }

  // Stale Run Recovery: If run is in "running" status but has exceeded max execution window (25 minutes),
  // auto-mark it as failed so abandoned zombie runs do not lock the UI forever.
  if (run.status === "running") {
    const STALE_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes
    const lastUpdate = new Date((run as any).updatedAt || run.startedAt).getTime();
    const elapsed = Date.now() - lastUpdate;

    if (elapsed > STALE_TIMEOUT_MS) {
      console.warn(`[Auto-Recovery] Marking run ${run.id} as failed (exceeded 25 min timeout: ${Math.round(elapsed / 1000)}s)`);
      const updatedRun = await prisma.joinerRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          progress: 100,
          progressMessage: "Sync timed out after 25 minutes. Click 'Sync Now' to restart.",
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          status: updatedRun.status,
          progress: updatedRun.progress,
          progressMessage: updatedRun.progressMessage,
          errors: updatedRun.errors,
          rowsWritten: updatedRun.rowsWritten,
        },
        { headers: responseHeaders }
      );
    }
  }

  return NextResponse.json(
    {
      status: run.status,
      progress: run.progress,
      progressMessage: run.progressMessage,
      errors: run.errors,
      rowsWritten: run.rowsWritten,
    },
    { headers: responseHeaders }
  );
}

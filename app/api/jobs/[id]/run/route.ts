import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncDiamonds } from "@/lib/sync-diamonds";
import { syncPrl } from "@/lib/sync-prl";

export const maxDuration = 300; // 5 minutes (Needed for MooGold verifier which takes time)

export async function POST(
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
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let runId: string | undefined;

  try {
    // Create a run record safely inside try-catch
    const run = await prisma.joinerRun.create({
      data: {
        jobId: job.id,
        status: "running",
        progress: 0,
        progressMessage: "Starting...",
      },
    });
    runId = run.id;

    let result;
    if (job.type === "diamonds") {
      result = await syncDiamonds(job, run.id);
    } else {
      result = await syncPrl(job, run.id);
    }

    // Mark as success
    await prisma.joinerRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        progress: 100,
        progressMessage: `Done! ${result.rowsWritten} rows written.`,
        completedAt: new Date(),
        rowsWritten: result.rowsWritten,
        errors: JSON.stringify(result.errors),
      },
    });

    await prisma.joinerJob.update({
      where: { id: job.id },
      data: { lastRunAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      rowsWritten: result.rowsWritten,
      errors: result.errors,
      runId: run.id,
    });
  } catch (error: any) {
    if (runId) {
      try {
        await prisma.joinerRun.update({
          where: { id: runId },
          data: {
            status: "failed",
            progress: 100,
            progressMessage: `Failed: ${error.message}`,
            completedAt: new Date(),
          },
        });
      } catch (updateError) {
        console.error("Failed to update run status after error:", updateError);
      }
    }

    return NextResponse.json(
      { error: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}

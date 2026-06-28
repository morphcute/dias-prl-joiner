import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Find the active running run for this job
  const activeRun = await prisma.joinerRun.findFirst({
    where: {
      jobId: id,
      status: "running",
      job: { userId: session.user.id }
    },
    orderBy: { startedAt: "desc" }
  });

  if (!activeRun) {
    return NextResponse.json({ error: "No running execution found for this job" }, { status: 404 });
  }

  // Update status to failed (stopped)
  await prisma.joinerRun.update({
    where: { id: activeRun.id },
    data: {
      status: "failed",
      progress: 100,
      progressMessage: "Stopped by user",
      completedAt: new Date(),
    }
  });

  return NextResponse.json({ success: true });
}

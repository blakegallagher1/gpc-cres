import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

interface ActivityItem {
  type: "run" | "task" | "upload" | "message";
  timestamp: string;
  description: string;
  metadata?: Record<string, unknown>;
}

// GET /api/deals/[id]/activity
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const items: ActivityItem[] = [];

    // Runs
    const runs = await prisma.run.findMany({
      where: { dealId: id, orgId: auth.orgId },
      orderBy: { startedAt: "desc" },
      take: 20,
    });
    for (const run of runs) {
      items.push({
        type: "run",
        timestamp: (run.finishedAt ?? run.startedAt).toISOString(),
        description: `${run.runType} run ${run.status}`,
        metadata: { runId: run.id, status: run.status, runType: run.runType },
      });
    }

    // Tasks
    const tasks = await prisma.task.findMany({
      where: { dealId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const task of tasks) {
      items.push({
        type: "task",
        timestamp: task.createdAt.toISOString(),
        description: `Task "${task.title}" created (${task.status})`,
        metadata: { taskId: task.id, status: task.status },
      });
    }

    // Uploads
    const uploads = await prisma.upload.findMany({
      where: { dealId: id, orgId: auth.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const upload of uploads) {
      items.push({
        type: "upload",
        timestamp: upload.createdAt.toISOString(),
        description: `Uploaded "${upload.filename}" (${upload.kind})`,
        metadata: { uploadId: upload.id, kind: upload.kind },
      });
    }

    // Chat messages (latest conversation for this deal)
    const conversation = await prisma.conversation.findFirst({
      where: { dealId: id, orgId: auth.orgId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (conversation) {
      const messages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, role: true, agentName: true, content: true, createdAt: true },
      });
      for (const msg of messages) {
        const preview = msg.content.length > 100 ? msg.content.slice(0, 100) + "..." : msg.content;
        items.push({
          type: "message",
          timestamp: msg.createdAt.toISOString(),
          description: `${msg.agentName || msg.role}: ${preview}`,
          metadata: { messageId: msg.id, role: msg.role },
        });
      }
    }

    // Sort all by timestamp desc and take 50
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ activity: items.slice(0, 50) });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}

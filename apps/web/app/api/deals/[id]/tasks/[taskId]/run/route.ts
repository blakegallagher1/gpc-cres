import { NextRequest } from "next/server";
import { prisma } from "@entitlement-os/db";
import { createConfiguredCoordinator } from "@entitlement-os/openai";
import { run } from "@openai/agents";
import { resolveAuth } from "@/lib/auth/resolveAuth";

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// POST /api/deals/[id]/tasks/[taskId]/run — execute a task via agent
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const auth = await resolveAuth();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dealId, taskId } = await params;
  const { orgId, userId } = auth;

  // Load deal + parcels + jurisdiction
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    include: { parcels: true, jurisdiction: true },
  });
  if (!deal) {
    return Response.json({ error: "Deal not found" }, { status: 404 });
  }

  // Load the task
  const task = await prisma.task.findFirst({
    where: { id: taskId, dealId },
  });
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Mark task as in progress
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS" },
  });

  // Build agent prompt with full deal context
  const parcelContext = deal.parcels
    .map((p, i) => {
      const parts = [`Parcel ${i + 1}: ${p.address}`];
      if (p.apn) parts.push(`APN: ${p.apn}`);
      if (p.acreage) parts.push(`Acreage: ${p.acreage}`);
      if (p.currentZoning) parts.push(`Zoning: ${p.currentZoning}`);
      if (p.floodZone) parts.push(`Flood Zone: ${p.floodZone}`);
      if (p.soilsNotes) parts.push(`Soils: ${p.soilsNotes}`);
      if (p.wetlandsNotes) parts.push(`Wetlands: ${p.wetlandsNotes}`);
      if (p.envNotes) parts.push(`Environmental: ${p.envNotes}`);
      if (p.trafficNotes) parts.push(`Traffic: ${p.trafficNotes}`);
      if (p.utilitiesNotes) parts.push(`Utilities: ${p.utilitiesNotes}`);
      if (p.lat && p.lng) parts.push(`Coordinates: ${p.lat}, ${p.lng}`);
      return parts.join("\n  ");
    })
    .join("\n\n");

  const systemContext = [
    `[System context — use these values when calling tools]`,
    `orgId: ${orgId}`,
    `userId: ${userId}`,
    ``,
    `Current deal context:`,
    `Deal: ${deal.name} (${deal.status})`,
    `Deal ID: ${deal.id}`,
    `Jurisdiction: ${deal.jurisdiction?.name ?? "Unknown"}, ${deal.jurisdiction?.state ?? "LA"}`,
    `SKU: ${deal.sku}`,
    ``,
    parcelContext,
  ].join("\n");

  const userPrompt = `Complete this task thoroughly and report your findings:\n\nTask: ${task.title}\n${task.description ? `\nDetails: ${task.description}` : ""}\n\nUse all available tools (property database, web search, zoning lookup, etc.) to research and complete this task. Be specific with your findings — include data, sources, and actionable conclusions. Format your response clearly with sections.`;

  // Stream SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      let lastAgentName = "Coordinator";

      try {
        if (!process.env.OPENAI_API_KEY) {
          controller.enqueue(
            encoder.encode(sseEvent({ type: "error", message: "OPENAI_API_KEY not configured" }))
          );
          controller.close();
          return;
        }

        const coordinator = createConfiguredCoordinator();

        const result = await run(coordinator, [
          { role: "user" as const, content: systemContext + "\n\n" + userPrompt },
        ], {
          stream: true,
          maxTurns: 15,
        });

        controller.enqueue(
          encoder.encode(sseEvent({ type: "agent_switch", agentName: "Coordinator" }))
        );

        for await (const event of result) {
          if (event.type === "agent_updated_stream_event") {
            lastAgentName = event.agent.name;
            controller.enqueue(
              encoder.encode(sseEvent({ type: "agent_switch", agentName: event.agent.name }))
            );
          } else if (event.type === "raw_model_stream_event") {
            const data = event.data as Record<string, unknown>;
            if (data.type === "output_text_delta" && typeof data.delta === "string") {
              fullText += data.delta;
              controller.enqueue(
                encoder.encode(sseEvent({ type: "text_delta", content: data.delta }))
              );
            }
          }
        }

        if (!fullText && result.finalOutput) {
          const output =
            typeof result.finalOutput === "string"
              ? result.finalOutput
              : JSON.stringify(result.finalOutput);
          fullText = output;
          controller.enqueue(
            encoder.encode(sseEvent({ type: "text_delta", content: output }))
          );
        }

        // Mark task as DONE and store findings in description
        const updatedTask = await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "DONE",
            description: fullText
              ? `${task.description ?? ""}\n\n---\nAgent Findings (${lastAgentName}):\n${fullText}`.trim()
              : undefined,
          },
        });

        controller.enqueue(
          encoder.encode(sseEvent({
            type: "done",
            taskId,
            taskStatus: "DONE",
            agentName: lastAgentName,
          }))
        );
        controller.close();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Internal error";
        console.error("Task agent error:", error);

        // Mark task back to TODO on failure
        await prisma.task.update({
          where: { id: taskId },
          data: { status: "TODO" },
        }).catch(() => {});

        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message: errMsg }))
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

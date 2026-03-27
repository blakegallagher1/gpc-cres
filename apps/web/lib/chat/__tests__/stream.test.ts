import { describe, expect, it } from "vitest";

import { parseSSEStream } from "../stream";

function buildSseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}

describe("parseSSEStream", () => {
  it("reconstructs events split across network chunks", async () => {
    const response = buildSseResponse([
      'data: {"type":"text_delta","content":"Hel',
      'lo"}\n\n',
      'data: {"type":"done","conversationId":"conv-1"}\n\n',
    ]);

    const events: Array<Record<string, unknown>> = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event as Record<string, unknown>);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "text_delta",
      content: "Hello",
    });
    expect(events[1]).toMatchObject({
      type: "done",
      conversationId: "conv-1",
    });
  });

  it("skips malformed payloads while preserving valid events", async () => {
    const response = buildSseResponse([
      "data: not-json\n\n",
      'data: {"type":"agent_switch","agentName":"Researcher"}\n\n',
    ]);

    const events: Array<Record<string, unknown>> = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event as Record<string, unknown>);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent_switch",
      agentName: "Researcher",
    });
  });
});

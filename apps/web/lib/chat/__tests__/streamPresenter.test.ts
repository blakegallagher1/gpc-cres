import { describe, expect, it } from "vitest";

import {
  applyStreamingEvents,
  createStreamPresenterState,
} from "../streamPresenter";
import type { ChatStreamEvent, ChatMessage } from "../types";

describe("streamPresenter", () => {
  it("normalizes text and agent progress into deterministic assistant drafts", () => {
    const events: ChatStreamEvent[] = [
      { type: "text_delta", content: "hello" },
      { type: "agent_progress", runId: "run1", status: "running", partialOutput: "hello world", lastAgentName: "Coordinator" },
      { type: "agent_switch", agentName: "Researcher" },
    ];

  const result = applyStreamingEvents(
      createStreamPresenterState(),
      [],
      events,
      () => "2026-02-15T12:00:00.000Z",
      (prefix) => `${prefix}-1`,
    );

    expect(result.nextMessages).toHaveLength(3);
    const assistantMessage = result.nextMessages.find((entry) => entry.eventKind === "assistant");
    const progressMessage = result.nextMessages.find((entry) => entry.eventKind === "agent_progress");
    expect(assistantMessage).toBeDefined();
    expect(progressMessage).toBeDefined();
    expect(assistantMessage).toMatchObject({
      role: "assistant",
      content: "hello",
      eventKind: "assistant",
      agentName: undefined,
    });
    expect(progressMessage).toMatchObject({
      role: "system",
      content: "hello world",
      eventKind: "agent_progress",
      agentName: "Coordinator",
    });
    expect(result.nextState.progressMessageId).toBeNull();
    expect(result.nextState.lastAgentName).toBe("Researcher");
  });

  it("maps summary trust fields and tool events to dedicated render messages", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "tool_start",
        name: "lookup",
        args: { query: "parcel" },
        toolCallId: "tool-1",
      },
      {
        type: "agent_summary",
        runId: "run2",
        trust: {
          lastAgentName: "Coordinator",
          confidence: 0.91,
          toolsInvoked: ["lookup"],
          missingEvidence: ["proof"],
          verificationSteps: ["step-1"],
          packVersionsUsed: ["jurisdiction_pack:1.2.3"],
          errorSummary: "Recovered from tool timeout",
          toolFailures: ["search timeout"],
        },
      },
      {
        type: "tool_end",
        name: "lookup",
        result: { records: 3 },
        toolCallId: "tool-1",
      },
      {
        type: "handoff",
        from: "Coordinator",
        to: "Researcher",
      },
    ];

    const { nextMessages } = applyStreamingEvents(
      createStreamPresenterState(),
      [],
      events,
      () => "2026-02-15T12:00:00.000Z",
      () => "id-2",
    );

    expect(nextMessages).toHaveLength(4);
    expect(nextMessages[0]).toMatchObject({
      role: "assistant",
      eventKind: "tool_start",
      content: "Tool lookup is running",
    });
    expect(nextMessages[1]).toMatchObject({
      role: "system",
      eventKind: "agent_summary",
      agentName: "Coordinator",
    });
    expect(nextMessages[1].trust).toMatchObject({
      packVersionsUsed: ["jurisdiction_pack:1.2.3"],
      errorSummary: "Recovered from tool timeout",
      toolFailures: ["search timeout"],
    });
    expect(nextMessages[2]).toMatchObject({
      role: "assistant",
      eventKind: "tool_end",
      content: JSON.stringify({ records: 3 }),
    });
    expect(nextMessages[3]).toMatchObject({
      role: "system",
      eventKind: "handoff",
      agentName: "Researcher",
      content: "Handoff from Coordinator to Researcher",
    });
  });

  it("keeps an event stream visible without dropping order for done events", () => {
    const events: ChatStreamEvent[] = [
      { type: "text_delta", content: "starting..." },
      { type: "done", runId: "run3", status: "succeeded", conversationId: "conv-1" },
      { type: "agent_summary", runId: "run3", trust: { confidence: 0.5, toolsInvoked: [] } },
    ];

    const initialMessages: ChatMessage[] = [];
    const result = applyStreamingEvents(
      createStreamPresenterState(),
      initialMessages,
      events,
      () => "2026-02-15T12:00:00.000Z",
      () => "id-3",
    );

    expect(result.nextMessages).toHaveLength(2);
    expect(result.nextMessages[0]).toMatchObject({ eventKind: "assistant" });
    expect(result.nextMessages[1]).toMatchObject({ eventKind: "agent_summary" });
    expect(result.nextState.conversationId).toBe("conv-1");
  });

  it("maps tool approval requested events into approval system messages", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "tool_approval_requested",
        name: "update_deal_status",
        args: { dealId: "d-1", status: "APPROVED" },
        toolCallId: "call-1",
        runId: "run-approval-1",
      },
    ];

    const { nextMessages } = applyStreamingEvents(
      createStreamPresenterState(),
      [],
      events,
      () => "2026-02-15T12:00:00.000Z",
      () => "id-approval",
    );

    expect(nextMessages).toHaveLength(1);
    expect(nextMessages[0]).toMatchObject({
      role: "system",
      eventKind: "tool_approval",
      content: "Approval required for update_deal_status",
      metadata: {
        runId: "run-approval-1",
        toolCallId: "call-1",
        toolName: "update_deal_status",
      },
      toolCalls: [
        {
          name: "update_deal_status",
          args: { dealId: "d-1", status: "APPROVED" },
        },
      ],
    });
  });
});

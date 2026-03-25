import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStreamEvent } from "./executeAgent";

const { buildMapActionEventsFromToolResultMock } = vi.hoisted(() => ({
  buildMapActionEventsFromToolResultMock: vi.fn(),
}));

vi.mock("./mapActionEvents", () => ({
  buildMapActionEventsFromToolResult: buildMapActionEventsFromToolResultMock,
}));

import {
  emitAgentSummary,
  emitDone,
  emitHandoff,
  emitMapActionsFromToolResult,
  emitTextDelta,
  emitToolApprovalRequested,
  emitToolEnd,
  emitToolStart,
} from "./agentStreamEmitter";

describe("agentStreamEmitter", () => {
  let events: AgentStreamEvent[];
  let emit: (event: AgentStreamEvent) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    events = [];
    emit = (event) => {
      events.push(event);
    };
  });

  it("emits a handoff followed by the destination agent switch", () => {
    emitHandoff(emit, { from: "Coordinator", to: "Researcher" });

    expect(events).toEqual([
      {
        type: "handoff",
        from: "Coordinator",
        to: "Researcher",
        fromAgent: "Coordinator",
        toAgent: "Researcher",
      },
      {
        type: "agent_switch",
        agentName: "Researcher",
      },
    ]);
  });

  it("emits unchanged tool and terminal payload shapes", () => {
    emitToolApprovalRequested(emit, {
      name: "screen_full",
      args: { parcel_id: "parcel-1" },
      toolCallId: "tool-1",
      runId: "run-1",
    });
    emitToolStart(emit, {
      name: "screen_full",
      args: { parcel_id: "parcel-1" },
      toolCallId: "tool-1",
    });
    emitToolEnd(emit, {
      name: "screen_full",
      result: { ok: true },
      status: "completed",
      toolCallId: "tool-1",
    });
    emitTextDelta(emit, "hello");
    emitAgentSummary(emit, {
      runId: "run-1",
      trust: {
        toolsInvoked: ["screen_full"],
        packVersionsUsed: [],
        evidenceCitations: [],
        missingEvidence: [],
        verificationSteps: [],
      },
    });
    emitDone(emit, {
      runId: "run-1",
      status: "succeeded",
      conversationId: "conv-1",
    });

    expect(events).toEqual([
      {
        type: "tool_approval_requested",
        name: "screen_full",
        args: { parcel_id: "parcel-1" },
        toolCallId: "tool-1",
        runId: "run-1",
      },
      {
        type: "tool_start",
        name: "screen_full",
        args: { parcel_id: "parcel-1" },
        toolCallId: "tool-1",
      },
      {
        type: "tool_end",
        name: "screen_full",
        result: { ok: true },
        status: "completed",
        toolCallId: "tool-1",
      },
      {
        type: "text_delta",
        content: "hello",
      },
      {
        type: "agent_summary",
        runId: "run-1",
        trust: {
          toolsInvoked: ["screen_full"],
          packVersionsUsed: [],
          evidenceCitations: [],
          missingEvidence: [],
          verificationSteps: [],
        },
      },
      {
        type: "done",
        runId: "run-1",
        status: "succeeded",
        conversationId: "conv-1",
      },
    ]);
  });

  it("re-emits map action events derived from tool output", () => {
    buildMapActionEventsFromToolResultMock.mockReturnValue([
      {
        type: "map_action",
        payload: { action: "highlight", parcelIds: ["parcel-1"] },
        toolCallId: "tool-1",
      },
    ]);

    emitMapActionsFromToolResult(emit, {
      toolName: "screen_full",
      result: { __mapFeatures: true },
      toolCallId: "tool-1",
    });

    expect(buildMapActionEventsFromToolResultMock).toHaveBeenCalledWith(
      "screen_full",
      { __mapFeatures: true },
      "tool-1",
    );
    expect(events).toEqual([
      {
        type: "map_action",
        payload: { action: "highlight", parcelIds: ["parcel-1"] },
        toolCallId: "tool-1",
      },
    ]);
  });
});

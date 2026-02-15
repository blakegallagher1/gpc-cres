import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  applyStreamingEvents,
  createStreamPresenterState,
} from "../streamPresenter";
import type { ChatStreamEvent } from "../types";
import { MessageList } from "../../../components/chat/MessageList";

describe("chat stream rendering integration", () => {
  it("renders synthetic stream payload as expected in chat bubble output", () => {
    const events: ChatStreamEvent[] = [
      {
        type: "text_delta",
        content: "Starting parcel review for 1234 Broadway.",
      },
      {
        type: "agent_progress",
        runId: "run-int-1",
        status: "running",
        partialOutput: "Retrieving parcel records.",
        lastAgentName: "Coordinator",
      },
      {
        type: "agent_switch",
        agentName: "Researcher",
      },
      {
        type: "tool_result",
        name: "geo_lookup",
        result: {
          status: "complete",
          records: 3,
        },
      },
      {
        type: "agent_summary",
        runId: "run-int-1",
        trust: {
          lastAgentName: "Researcher",
          confidence: 0.91,
          toolsInvoked: ["geo_lookup", "zoning_check"],
          missingEvidence: ["owner_name"],
          verificationSteps: ["fetch_parcel"],
          packVersionsUsed: ["jurisdiction_pack:1.2.1"],
          errorSummary: "Recovered from transient lookup timeout.",
          toolFailures: ["permit_fetch timeout"],
        },
      },
    ];

    const { nextMessages } = applyStreamingEvents(
      createStreamPresenterState(),
      [],
      events,
      () => "2026-02-15T12:00:00.000Z",
      (prefix) => `${prefix}-event`,
    );

    render(<MessageList messages={nextMessages} isStreaming={false} />);

    expect(screen.getByText("Starting parcel review for 1234 Broadway.")).toBeTruthy();
    expect(screen.getByText("Agent Progress")).toBeTruthy();
    expect(screen.getByText("Agent Switched")).toBeTruthy();
    expect(screen.getByText("Tool Result")).toBeTruthy();
    expect(screen.getByText("Agent Summary")).toBeTruthy();
    expect(screen.getByText(/Confidence:/)).toBeTruthy();
    expect(
      screen.getByText("Recovered from transient lookup timeout."),
    ).toBeTruthy();
  });
});


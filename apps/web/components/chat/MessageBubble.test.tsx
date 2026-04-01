import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/chat/types";
import { MessageBubble } from "./MessageBubble";

vi.mock("@/lib/chat/MapChatContext", () => ({
  useMapChatDispatch: () => vi.fn(),
  buildMapContextInput: vi.fn(),
}));

describe("MessageBubble", () => {
  it("renders assistant JSON payload as formatted report", () => {
    const message: ChatMessage = {
      id: "assistant-report",
      role: "assistant",
      createdAt: "2026-03-23T08:00:00.000Z",
      content: JSON.stringify(
        {
          schema_version: "1.0",
          task_understanding: {
            summary: "Review the parcel and produce underwriting guidance.",
            focus_questions: ["What is current NOI?"],
            context: "Prepared for a pilot command test.",
          },
          execution_plan: {
            summary: "Run underwriting checks then compile output.",
            steps: [
              {
                agent: "coordinator",
                responsibility: "Gather parcel and transaction details.",
                rationale: "Data quality is required before modeling.",
              },
            ],
          },
          synthesis: {
            recommendation: "Proceed with moderate confidence.",
            rationale: "Available data is sufficient.",
            confidence: 0.87,
          },
          metrics: {
            noi: 1200000,
            irr: 0.188,
            dscr: 1.45,
          },
          agent_outputs: [
            {
              agent: "finance",
              summary: "Prelim DSCR supports loan structuring.",
              confidence: 0.84,
            },
          ],
          key_assumptions: ["Vacancy has not been modeled."],
          next_steps: [
            {
              action: "Finalize underwriting",
              owner: "Finance",
              priority: "high",
            },
          ],
        },
        null,
        2,
      ),
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Structured assistant report")).toBeInTheDocument();
    expect(screen.getByText("Task Understanding")).toBeInTheDocument();
    expect(screen.getByText("Execution Plan")).toBeInTheDocument();
    expect(screen.getAllByText(/1,200,000/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "View Raw" })).toBeInTheDocument();
    expect(screen.queryByText(/\"schema_version\"/)).not.toBeInTheDocument();
  });

  it("supports toggling raw JSON for debugging", () => {
    const message: ChatMessage = {
      id: "assistant-report-raw-toggle",
      role: "assistant",
      createdAt: "2026-03-23T08:00:00.000Z",
      content: JSON.stringify({
        schema_version: "1.0",
        task_understanding: { summary: "Focus on execution detail." },
        execution_plan: { summary: "Plan step", steps: [] },
      }),
    };

    render(<MessageBubble message={message} />);

    const rawToggle = screen.getByRole("button", { name: "View Raw" });
    expect(screen.queryByText(/\"schema_version\"/)).not.toBeInTheDocument();

    fireEvent.click(rawToggle);

    expect(screen.getByRole("button", { name: "Hide Raw" })).toBeInTheDocument();
    expect(screen.getByText(/\"schema_version\"/)).toBeInTheDocument();
  });

  it("falls back to text for non-json assistant output", () => {
    const message: ChatMessage = {
      id: "assistant-plain",
      role: "assistant",
      createdAt: "2026-03-23T08:00:00.000Z",
      content: "Run complete with no structured payload.",
    };

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Run complete with no structured payload.")).toBeInTheDocument();
    expect(screen.queryByText("Structured assistant report")).not.toBeInTheDocument();
  });

  it("renders user text inside high-contrast primary bubble", () => {
    const message: ChatMessage = {
      id: "user-plain",
      role: "user",
      createdAt: "2026-03-23T08:00:00.000Z",
      content: "Please draft the zoning memo and include assumptions.",
    };

    render(<MessageBubble message={message} />);

    const text = screen.getByText("Please draft the zoning memo and include assumptions.");
    expect(text).toBeInTheDocument();
    expect(text).toHaveClass("text-primary-foreground");
    expect(screen.queryByText("Structured assistant report")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkflowTimeline } from "@/components/deals/WorkflowTimeline";

describe("WorkflowTimeline", () => {
  it("renders current, completed, and upcoming workflow stages", () => {
    render(
      <WorkflowTimeline
        currentStageKey="UNDERWRITING"
        workflowTemplate={{
          name: "Acquisition Workflow",
          stages: [
            {
              id: "stage-1",
              key: "ORIGINATION",
              name: "Origination",
              ordinal: 1,
              description: "Source and qualify opportunities.",
              requiredGate: "source_vetted",
            },
            {
              id: "stage-2",
              key: "UNDERWRITING",
              name: "Underwriting",
              ordinal: 2,
              description: "Validate returns and risk.",
              requiredGate: "ic_ready",
            },
            {
              id: "stage-3",
              key: "DISPOSITION",
              name: "Disposition",
              ordinal: 3,
              description: "Prepare buyer process.",
              requiredGate: null,
            },
          ],
        }}
        stageHistory={[
          {
            id: "history-1",
            fromStageKey: null,
            toStageKey: "ORIGINATION",
            changedAt: "2026-03-10T10:00:00.000Z",
            note: "Deal created.",
          },
          {
            id: "history-2",
            fromStageKey: "ORIGINATION",
            toStageKey: "UNDERWRITING",
            changedAt: "2026-03-11T10:00:00.000Z",
            note: "Passed screening review.",
          },
        ]}
      />,
    );

    expect(screen.getByText("Acquisition Workflow")).toBeInTheDocument();
    expect(screen.getByText("Origination")).toBeInTheDocument();
    expect(screen.getByText("Underwriting")).toBeInTheDocument();
    expect(screen.getByText("Disposition")).toBeInTheDocument();
    expect(screen.getByText("Current Stage")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Passed screening review.")).toBeInTheDocument();
    expect(screen.getByText("Gate: ic_ready")).toBeInTheDocument();
  });

  it("shows an empty state when no workflow template is attached", () => {
    render(
      <WorkflowTimeline
        currentStageKey={null}
        workflowTemplate={null}
        stageHistory={[]}
      />,
    );

    expect(
      screen.getByText("No workflow template is attached to this deal yet."),
    ).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceHeader } from "./WorkspaceHeader";

describe("WorkspaceHeader", () => {
  it("renders the shared workspace hero with actions and summary stats", () => {
    const { container } = render(
      <WorkspaceHeader
        eyebrow="Pipeline desk"
        title="Deals"
        description="Manage entitlement deals across the live pipeline."
        actions={<button type="button">New Deal</button>}
        stats={[
          {
            label: "Loaded deals",
            value: "24",
            detail: "Current result set after filtering.",
          },
          {
            label: "Selected",
            value: "3",
            detail: "Rows ready for bulk updates.",
            tone: "critical",
          },
        ]}
      />,
    );

    expect(screen.getByText("Pipeline desk")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deals" })).toBeInTheDocument();
    expect(screen.getByText("Manage entitlement deals across the live pipeline.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Deal" })).toBeInTheDocument();
    expect(screen.getByText("Loaded deals")).toBeInTheDocument();
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });
});

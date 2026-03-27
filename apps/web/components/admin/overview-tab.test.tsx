import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OverviewTab from "./overview-tab";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div>Bar</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  Tooltip: () => <div>Tooltip</div>,
}));

describe("OverviewTab", () => {
  it("shows cached-data fallback notice while continuing to render overview data", () => {
    // Use a fixed relative date: 2 days ago from now
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const createdAt = twoDaysAgo.toISOString();

    const { container } = render(
      <OverviewTab
        data={{
          knowledgeCount: 12,
          verifiedCount: 8,
          entityCount: 5,
          runs24h: 3,
          recentActivity: [
            { type: "memory", summary: "Fact promoted", createdAt },
          ],
          knowledgeByType: [{ contentType: "memory_note", count: 4 }],
        }}
        isLoading={false}
        error={{ message: "Unable to refresh this section right now." }}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Showing the last successful snapshot while this section retries."),
    ).toBeInTheDocument();
    expect(screen.getByText("Knowledge Entries")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });
});

import type { HTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSWRMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
}));

vi.mock("swr", () => ({
  default: useSWRMock,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => {
  const MotionTag = ({
    children,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  );

  return {
    motion: new Proxy(
      {},
      {
        get: () => MotionTag,
      },
    ),
    useReducedMotion: () => false,
  };
});

vi.mock("@/components/intelligence/EntitlementKpiWidget", () => ({
  EntitlementKpiWidget: () => <div>Entitlement KPI widget</div>,
}));

vi.mock("@/components/error-boundary/ErrorBoundary", () => ({
  SectionErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

import { CommandCenterWorkspace } from "./CommandCenterWorkspace";

describe("CommandCenterWorkspace", () => {
  beforeEach(() => {
    useSWRMock.mockReset();
    useSWRMock.mockImplementation((url: string) => {
      if (url === "/api/intelligence/daily-briefing") {
        return {
          data: {
            generatedAt: "2026-03-20T12:00:00.000Z",
            summary:
              "Three permits advanced, two deals need intervention, and one automation stalled.",
            sections: {
              newActivity: {
                label: "Last 24 hours",
                items: ["Permit hearing scheduled", "  - Neighbor outreach ready"],
              },
              needsAttention: {
                label: "Needs attention",
                items: [
                  {
                    title: "Variance package incomplete",
                    dealId: "deal-1",
                    dealName: "Airline Yard",
                    reason: "Missing the stormwater memo before submission.",
                  },
                ],
              },
              automationActivity: {
                label: "Automation",
                items: [
                  {
                    title: "Opportunity scan",
                    status: "running",
                    dealName: "Airline Yard",
                    createdAt: "2026-03-20T11:30:00.000Z",
                  },
                ],
              },
              pipelineSnapshot: {
                label: "Pipeline",
                stages: [
                  { status: "INTAKE", count: 2 },
                  { status: "SUBMITTED", count: 3 },
                ],
              },
            },
          },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      if (url === "/api/portfolio") {
        return {
          data: {
            deals: [
              { status: "INTAKE", updatedAt: "2026-03-20T10:00:00.000Z" },
              { status: "SUBMITTED", updatedAt: "2026-03-19T09:00:00.000Z" },
            ],
            metrics: {
              totalDeals: 5,
              byStatus: { INTAKE: 2, SUBMITTED: 3 },
            },
          },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      if (url === "/api/intelligence/deadlines") {
        return {
          data: {
            total: 2,
            deadlines: [
              {
                taskId: "task-1",
                taskTitle: "Submit traffic memo",
                dueAt: "2026-03-20T18:00:00.000Z",
                hoursUntilDue: 4,
                urgency: "red",
                status: "OPEN",
                pipelineStep: 3,
                dealId: "deal-1",
                dealName: "Airline Yard",
                dealStatus: "SUBMITTED",
              },
            ],
          },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      if (url === "/api/opportunities?limit=6") {
        return {
          data: {
            total: 4,
            opportunities: [
              {
                id: "opp-1",
                matchScore: "86",
                priorityScore: 91,
                parcelData: {
                  parish: "EBR",
                  parcelUid: "123",
                  ownerName: "Owner",
                  address: "2774 HIGHLAND RD",
                  acreage: 1.5,
                  lat: 0,
                  lng: 0,
                },
                parcelId: "parcel-1",
                feedbackSignal: "new",
                thesis: {
                  summary: "Assemblage is clear and access looks favorable.",
                  whyNow: "Zoning cycle is open.",
                  angle: "Truck parking",
                  nextBestAction: "Verify zoning by district.",
                  confidence: 0.82,
                  keyRisks: [],
                  signals: [],
                },
                savedSearch: {
                  id: "search-1",
                  name: "Truck Parking",
                },
                createdAt: "2026-03-20T11:15:00.000Z",
              },
            ],
          },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });
  });

  it("renders the upgraded workspace hierarchy and key operator sections", () => {
    render(<CommandCenterWorkspace />);

    expect(screen.getByText("Morning operator brief")).toBeInTheDocument();
    expect(screen.getByText("Command Center")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "See what moved, what is blocked, and where to intervene.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operating brief" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Priority queue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Opportunity radar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deadline load" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Automation stream" })).toBeInTheDocument();
    expect(screen.getByText("Entitlement KPI widget")).toBeInTheDocument();
    expect(screen.getByText("2774 HIGHLAND RD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review active deals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review opportunity queue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export live brief" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh live brief" })).toBeInTheDocument();
  });

  it("shows cached opportunity fallback when refresh fails", () => {
    useSWRMock.mockImplementation((url: string) => {
      if (url === "/api/intelligence/daily-briefing") {
        return {
          data: {
            generatedAt: "2026-03-20T12:00:00.000Z",
            summary: "Cached briefing",
            sections: {
              newActivity: { label: "Last 24 hours", items: [] },
              needsAttention: { label: "Needs attention", items: [] },
              automationActivity: { label: "Automation", items: [] },
              pipelineSnapshot: { label: "Pipeline", stages: [] },
            },
          },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      if (url === "/api/portfolio") {
        return {
          data: { deals: [], metrics: { totalDeals: 0, byStatus: {} } },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      if (url === "/api/intelligence/deadlines") {
        return {
          data: { total: 0, deadlines: [] },
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      if (url === "/api/opportunities?limit=6") {
        return {
          data: {
            total: 1,
            opportunities: [
              {
                id: "opp-1",
                matchScore: "86",
                priorityScore: 91,
                parcelData: {
                  parish: "EBR",
                  parcelUid: "123",
                  ownerName: "Owner",
                  address: "2774 HIGHLAND RD",
                  acreage: 1.5,
                  lat: 0,
                  lng: 0,
                },
                parcelId: "parcel-1",
                feedbackSignal: "new",
                thesis: {
                  summary: "Assemblage is clear and access looks favorable.",
                  whyNow: "Zoning cycle is open.",
                  angle: "Truck parking",
                  nextBestAction: "Verify zoning by district.",
                  confidence: 0.82,
                  keyRisks: [],
                  signals: [],
                },
                savedSearch: {
                  id: "search-1",
                  name: "Truck Parking",
                },
                createdAt: "2026-03-20T11:15:00.000Z",
              },
            ],
          },
          error: new Error("fetch failed"),
          isLoading: false,
          mutate: vi.fn(),
        };
      }

      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });

    render(<CommandCenterWorkspace />);

    expect(
      screen.getByText("Opportunity data could not be refreshed. Using cached data."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

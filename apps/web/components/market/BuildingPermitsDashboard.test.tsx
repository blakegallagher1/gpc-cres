import type { ComponentProps, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSWRMock, mutateMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
  mutateMock: vi.fn(),
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

vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  const NullChartChild = (_props: ComponentProps<"div">) => null;

  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: NullChartChild,
    CartesianGrid: NullChartChild,
    Tooltip: NullChartChild,
    XAxis: NullChartChild,
    YAxis: NullChartChild,
  };
});

import { BuildingPermitsDashboard } from "./BuildingPermitsDashboard";

describe("BuildingPermitsDashboard", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    useSWRMock.mockReturnValue({
      data: {
        dataset: {
          id: "7fq7-8j7r",
          sourceUrl:
            "https://data.brla.gov/Housing-and-Development/EBR-Building-Permits/7fq7-8j7r/about_data",
          apiBaseUrl: "https://data.brla.gov/resource",
          refreshedAt: "2026-03-13T15:00:00.000Z",
        },
        filters: {
          days: 30,
          designation: "all",
          limit: 25,
          permitType: null,
          zipCode: null,
        },
        totals: {
          permitCount: 14,
          totalProjectValue: 990000,
          averageProjectValue: 70714,
          totalPermitFees: 4300,
          latestIssuedDate: "2026-03-12T00:00:00.000",
        },
        issuedTrend: [
          {
            issuedDay: "2026-03-10T00:00:00.000",
            permitCount: 6,
            totalProjectValue: 450000,
          },
        ],
        designationBreakdown: [
          {
            label: "Commercial",
            permitCount: 9,
            totalProjectValue: 700000,
          },
        ],
        topPermitTypes: [
          {
            label: "Occupancy Permit (C)",
            permitCount: 8,
            totalProjectValue: 500000,
          },
        ],
        topZipCodes: [
          {
            label: "70811",
            permitCount: 5,
            totalProjectValue: 320000,
          },
        ],
        recentPermits: [
          {
            permitNumber: "17473",
            permitType: "Occupancy Permit (C)",
            designation: "Commercial",
            projectDescription: "Auto repair",
            projectValue: 100000,
            permitFee: 115,
            issuedDate: "2026-03-12T00:00:00.000",
            address: "6883 AIRLINE HWY BATON ROUGE LA 70811",
            zip: "70811",
            ownerName: "Owner",
            applicantName: "Applicant",
            contractorName: "Contractor",
          },
        ],
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: mutateMock,
    });
  });

  it("renders the live permits metrics and table in embedded mode", () => {
    render(<BuildingPermitsDashboard embedded />);

    expect(
      screen.getByRole("heading", {
        name: "East Baton Rouge Building Permits",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Permits in window")).toBeInTheDocument();
    expect(screen.getByText("Dataset 7fq7-8j7r")).toBeInTheDocument();
    expect(
      screen.getAllByText("6883 AIRLINE HWY BATON ROUGE LA 70811"),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("link", { name: "Back to Market Intel" }),
    ).not.toBeInTheDocument();
  });
});

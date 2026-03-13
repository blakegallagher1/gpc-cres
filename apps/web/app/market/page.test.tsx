import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSWRMock, mutateMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("swr", () => ({
  default: useSWRMock,
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        id: "user-1",
      },
    },
  }),
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

import MarketPage from "./page";

describe("MarketPage", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    useSWRMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/market?view=summary")) {
        return {
          data: {
            parish: "East Baton Rouge",
            compSaleCount: 3,
            listingCount: 2,
            permitCount: 5,
            avgSalePricePsf: 145.25,
            avgCapRate: 7.1,
            avgDaysOnMarket: 48,
            recentComps: [],
            recentListings: [],
          },
          isLoading: false,
        };
      }

      if (url.startsWith("/api/market?view=trends")) {
        return {
          data: { trends: [] },
          isLoading: false,
        };
      }

      if (url.startsWith("/api/market?view=recent")) {
        return {
          data: { data: [] },
          isLoading: false,
        };
      }

      if (url.startsWith("/api/market/building-permits")) {
        return {
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
            designationBreakdown: [{ label: "Commercial", permitCount: 9, totalProjectValue: 700000 }],
            topPermitTypes: [{ label: "Occupancy Permit (C)", permitCount: 8, totalProjectValue: 500000 }],
            topZipCodes: [{ label: "70811", permitCount: 5, totalProjectValue: 320000 }],
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
        };
      }

      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: mutateMock,
      };
    });
  });

  it("surfaces a live permits entry point on the market page", () => {
    render(<MarketPage />);

    expect(screen.getByRole("tab", { name: "Live Permits" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Parish-level market data, comp sales, listings, live permit intelligence, and trends",
      ),
    ).toBeInTheDocument();
  });
});

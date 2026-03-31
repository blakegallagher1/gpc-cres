// Pin timezone so date-formatted snapshots are deterministic across CI and local
process.env.TZ = "UTC";

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/components/deals/DocumentExtractionReview", () => ({
  ExtractionStatusSummary: () => <div>Extraction summary</div>,
}));

vi.mock("@/components/deals/WorkflowTimeline", () => ({
  WorkflowTimeline: () => <div>Workflow timeline</div>,
}));

vi.mock("@/components/deals/TriageResultPanel", () => ({
  TriageResultPanel: () => <div>Triage result panel</div>,
}));

vi.mock("@/components/deals/DealStakeholdersPanel", () => ({
  DealStakeholdersPanel: () => <div>Stakeholders panel</div>,
}));

vi.mock("@/components/deals/RiskRegisterPanel", () => ({
  RiskRegisterPanel: () => <div>Risk register panel</div>,
}));

vi.mock("@/components/deals/ActivityTimeline", () => ({
  ActivityTimeline: () => <div>Activity timeline</div>,
}));

vi.mock("@/components/deals/DeadlineBar", () => ({
  DeadlineBar: () => <div>Deadline bar</div>,
}));

vi.mock("@/components/maps/ScreeningScorecard", () => ({
  ScreeningScorecard: () => <div>Site screening</div>,
}));

import { DealOverviewWorkspace } from "./DealOverviewWorkspace";

describe("DealOverviewWorkspace", () => {
  it("renders the redesigned underwriting composition with dense tables and a live rail", () => {
    const { container } = render(
      <DealOverviewWorkspace
        deal={{
          id: "deal-1",
          name: "Airline Yard",
          sku: "TRUCK_PARKING",
          status: "UNDER_REVIEW",
          assetClass: "Industrial Outdoor Storage",
          strategy: "Acquire and entitle",
          workflowTemplateKey: "standard",
          currentStageKey: "UNDERWRITING",
          targetCloseDate: "2026-04-30T00:00:00.000Z",
          triageTier: "ADVANCE",
          workflowTemplate: {
            name: "Standard Entitlement",
            stages: [
              {
                id: "stage-1",
                key: "UNDERWRITING",
                name: "Underwriting",
                ordinal: 1,
              },
            ],
          },
          stageHistory: [],
          generalizedScorecards: [],
          jurisdiction: {
            id: "jur-1",
            name: "East Baton Rouge",
            kind: "PARISH",
            state: "LA",
          },
          parcels: [{ id: "parcel-1", propertyDbId: "prop-1" }],
          tasks: [
            {
              id: "task-1",
              title: "Submit traffic memo",
              status: "OPEN",
              dueAt: "2000-01-01T12:00:00.000Z",
              description: "Need updated memo before filing.",
              pipelineStep: 3,
            },
          ],
          packContext: {
            hasPack: true,
            isStale: true,
            stalenessDays: 11,
            missingEvidence: ["Stormwater memo", "Phase I environmental report"],
          },
          notes: "Operator flagged access assumptions for review.",
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-27T00:00:00.000Z",
        }}
        terms={{
          offerPrice: 8_250_000,
          earnestMoney: 250_000,
          closingDate: "2026-04-30T00:00:00.000Z",
          titleCompany: "Clear Title",
          dueDiligenceDays: 45,
          financingContingencyDays: 30,
          loiSignedAt: "2026-03-10T00:00:00.000Z",
          psaSignedAt: "2026-03-18T00:00:00.000Z",
          titleReviewDue: "2026-04-05T00:00:00.000Z",
          surveyDue: "2026-04-08T00:00:00.000Z",
          environmentalDue: "2026-04-12T00:00:00.000Z",
          sellerContact: "seller@example.com",
          brokerContact: "broker@example.com",
        }}
        entitlementPath={{
          recommendedStrategy: "Variance plus site plan approval",
          preAppMeetingDate: "2026-03-21T00:00:00.000Z",
          applicationType: "Conditional Use Permit",
          applicationSubmittedDate: "2026-03-25T00:00:00.000Z",
          applicationNumber: "CUP-2026-041",
          publicNoticeDate: "2026-04-02T00:00:00.000Z",
          publicNoticePeriodDays: 15,
          hearingScheduledDate: "2026-04-20T00:00:00.000Z",
          hearingBody: "Planning Commission",
          decisionDate: "2026-04-27T00:00:00.000Z",
          decisionType: "Approval with conditions",
          conditions: ["Landscape buffer at frontage", "Truck route signage"],
          appealDeadline: "2026-05-07T00:00:00.000Z",
          appealFiled: false,
          conditionComplianceStatus: "In progress",
        }}
        propertyTitle={{
          titleInsuranceReceived: true,
          exceptions: [],
          liens: ["Legacy drainage servitude"],
          easements: ["Utility easement along rear boundary"],
        }}
        propertySurvey={{
          surveyCompletedDate: "2026-03-22T00:00:00.000Z",
          acreageConfirmed: 12.45,
          encroachments: ["Neighbor fence overlaps by 1.2 feet"],
          setbacks: { front: "25 ft", side: "10 ft" },
        }}
        triageResult={{
          decision: "ADVANCE",
          summary: "Proceed with entitlement diligence.",
        }}
        triageSources={[{ url: "https://example.com/source", title: "Memo" }]}
        hasGeneralizedScorecards={false}
        displayNotes="Operator flagged access assumptions for review."
        onRunAction={async () => "task-1"}
        onTaskCompleted={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: "Underwriting ledger" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Property diligence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Triage assessment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live watchlist" })).toBeInTheDocument();
    expect(screen.getByText(/\$8,250,000/)).toBeInTheDocument();
    expect(screen.getByText("Stormwater memo")).toBeInTheDocument();
    expect(screen.getByText("Risk register panel")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });
});

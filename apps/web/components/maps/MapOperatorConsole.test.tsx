import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapOperatorConsole } from "./MapOperatorConsole";
import type { MapTrackedParcel } from "./mapOperatorNotebook";
import type { MapParcel } from "./types";
import {
  buildEmptyAssemblageSnapshot,
  buildEmptyWorkspaceSnapshot,
  buildFallbackAssemblageSnapshot,
  buildFallbackWorkspaceSnapshot,
} from "./useMapInvestorWorkbench";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    article: ({ children, ...props }: HTMLAttributes<HTMLElement>) => (
      <article {...props}>{children}</article>
    ),
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    section: ({ children, ...props }: HTMLAttributes<HTMLElement>) => (
      <section {...props}>{children}</section>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("./ScreeningScorecard", () => ({
  ScreeningScorecard: ({ parcelId }: { parcelId: string | null }) => (
    <div data-testid="screening-scorecard">Screening: {parcelId}</div>
  ),
}));

const parcels: MapParcel[] = [
  {
    id: "parcel-1",
    address: "123 Main St",
    lat: 30.45,
    lng: -91.18,
    acreage: 1.25,
    currentZoning: "C2",
    floodZone: "X",
  },
  {
    id: "parcel-2",
    address: "456 River Rd",
    lat: 30.44,
    lng: -91.2,
    acreage: 2.75,
    currentZoning: "I1",
    floodZone: "AE",
  },
];

const trackedParcels: MapTrackedParcel[] = [
  {
    parcelId: "parcel-1",
    address: "123 Main St",
    lat: 30.45,
    lng: -91.18,
    acreage: 1.25,
    currentZoning: "C2",
    floodZone: "X",
    note: "Frontage looks strong. Confirm utility capacity.",
    task: "Call broker",
    status: "active",
    createdAt: "2026-03-25T20:00:00.000Z",
    updatedAt: "2026-03-25T21:00:00.000Z",
  },
];

function renderConsole(
  overrideProps: Partial<ComponentProps<typeof MapOperatorConsole>> = {},
) {
  const workspace = buildFallbackWorkspaceSnapshot({
    trackedParcels,
    selectedParcels: [parcels[0]],
    polygon: null,
    resultCount: 2,
  });
  const assemblage = buildFallbackAssemblageSnapshot(parcels);

  return render(
    <MapOperatorConsole
      parcels={parcels}
      selectedIds={new Set(["parcel-1"])}
      selectedParcels={[parcels[0]]}
      trackedParcels={trackedParcels}
      visibleCount={42}
      searchMatchCount={3}
      nearbyCount={11}
      resultCount={2}
      statusText="42 parcels in the working geography"
      sourceLabel="Source: Property database"
      dataFreshnessLabel="Live"
      latencyLabel="188ms"
      workspace={workspace}
      assemblage={assemblage}
      ownership={{
        status: workspace.status,
        ownerRollup: [
          {
            ownerName: "Riverfront Holdings LLC",
            parcelCount: 2,
            combinedAcreage: 4,
            mailingAddress: null,
            portfolioContext: "Multiple parcels already in the working set.",
          },
        ],
        brokerNotes: ["Need broker confirmation on frontage access."],
        contactLog: [
          {
            id: "parcel-1",
            label: "123 Main St",
            outcome: "Pending outreach review",
            nextAction: "Call broker",
          },
        ],
        nextContactTask: "Call broker",
        skipTraceStatus: "pending",
      }}
      comps={{
        status: workspace.status,
        filterSummary: ["Land use matched to subject"],
        underwritingSummary: ["Subject frame: C2"],
        adjustments: [{ label: "Location bias", value: "Distance-weighted placeholder" }],
        rows: [],
      }}
      marketOverlays={{
        status: workspace.status,
        cards: [
          {
            id: "permits",
            label: "Permits & deliveries",
            availability: "fallback",
            detail: "Awaiting market monitor feed for live permit activity.",
            active: false,
          },
        ],
      }}
      activePanel="chat"
      onActivePanelChange={vi.fn()}
      onFocusParcel={vi.fn()}
      onToggleParcel={vi.fn()}
      onClearSelection={vi.fn()}
      onSaveSelection={vi.fn()}
      onFocusTrackedParcel={vi.fn()}
      onRemoveTrackedParcel={vi.fn()}
      onUpdateTrackedParcelStatus={vi.fn()}
      {...overrideProps}
    />,
  );
}

describe("MapOperatorConsole", () => {
  it("renders the operator console workspace", () => {
    renderConsole();

    expect(screen.getByText("Operator console")).toBeInTheDocument();
    expect(screen.getByText("Update workspace parcel")).toBeInTheDocument();
    expect(screen.getByText("Call broker")).toBeInTheDocument();
    expect(screen.getByText("Assemblage analysis")).toBeInTheDocument();
    expect(screen.getByText("Ownership and outreach")).toBeInTheDocument();
    expect(screen.getByText("Enhanced comp intelligence")).toBeInTheDocument();
    expect(screen.getByText("Developer market overlays")).toBeInTheDocument();
    expect(screen.getByTestId("screening-scorecard")).toHaveTextContent("parcel-1");
  });

  it("saves draft notes for the current selection and updates tracked rows", async () => {
    const user = userEvent.setup();
    const onSaveSelection = vi.fn();
    const onUpdateTrackedParcelStatus = vi.fn();
    const onRemoveTrackedParcel = vi.fn();

    renderConsole({
      selectedIds: new Set(["parcel-2"]),
      selectedParcels: [parcels[1]],
      trackedParcels,
      onSaveSelection,
      onUpdateTrackedParcelStatus,
      onRemoveTrackedParcel,
    });

    await user.type(
      screen.getByPlaceholderText(
        "Task title: verify zoning path, call broker, compare sales...",
      ),
      "Review flood exposure",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Operator note: constraints, broker feedback, screening flags, next decision...",
      ),
      "Flood map suggests an AE edge condition.",
    );
    await user.click(screen.getByRole("button", { name: "Save to workspace" }));

    expect(onSaveSelection).toHaveBeenCalledWith({
      task: "Review flood exposure",
      note: "Flood map suggests an AE edge condition.",
      status: "to_analyze",
    });

    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    await user.click(screen.getByRole("button", { name: "Remove from workspace" }));

    expect(onUpdateTrackedParcelStatus).toHaveBeenCalledWith("parcel-1", "complete");
    expect(onRemoveTrackedParcel).toHaveBeenCalledWith("parcel-1");
  });

  it("renders empty panel states when no workspace context exists", () => {
    const workspace = buildEmptyWorkspaceSnapshot();
    const assemblage = buildEmptyAssemblageSnapshot();

    renderConsole({
      selectedIds: new Set(),
      selectedParcels: [],
      trackedParcels: [],
      workspace,
      assemblage,
      ownership: {
        status: {
          kind: "empty",
          source: "empty",
          title: "Ownership lane is waiting on a parcel set",
          detail:
            "Save or select a parcel before opening owner rollup, broker notes, and outreach tasks.",
        },
        ownerRollup: [],
        brokerNotes: [],
        contactLog: [],
        nextContactTask: null,
        skipTraceStatus: "pending",
      },
      comps: {
        status: {
          kind: "empty",
          source: "empty",
          title: "Comp intelligence needs a subject parcel",
          detail:
            "Select a parcel or workspace set to seed adjusted comps and underwriting assumptions.",
        },
        filterSummary: [],
        underwritingSummary: [],
        adjustments: [],
        rows: [],
      },
      marketOverlays: {
        status: {
          kind: "empty",
          source: "empty",
          title: "Market overlays are idle",
          detail:
            "Select a parcel set to review permits, growth, utilities, frontage, and risk overlays.",
        },
        cards: [],
      },
    });

    expect(
      screen.getAllByText(
        "Select parcels or draw a geography to start a shared workspace record.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Select or save at least two parcels to score adjacency, owner concentration, and holdout risk.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Save or select a parcel before opening owner rollup, broker notes, and outreach tasks.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select a parcel or workspace set to seed adjusted comps and underwriting assumptions."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Select a parcel set to review permits, growth, utilities, frontage, and risk overlays.",
      ),
    ).toBeInTheDocument();
  });
});

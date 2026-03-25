import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapOperatorConsole } from "./MapOperatorConsole";
import type { MapTrackedParcel } from "./mapOperatorNotebook";
import type { MapParcel } from "./types";

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
    const { container } = renderConsole();

    expect(screen.getByText("Map console")).toBeInTheDocument();
    expect(screen.getByText("Update tracked parcel")).toBeInTheDocument();
    expect(screen.getByText("Call broker")).toBeInTheDocument();
    expect(screen.getByTestId("screening-scorecard")).toHaveTextContent("parcel-1");
    expect(container.firstChild).toMatchSnapshot();
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
    await user.click(screen.getByRole("button", { name: "Track highlighted parcel" }));

    expect(onSaveSelection).toHaveBeenCalledWith({
      task: "Review flood exposure",
      note: "Flood map suggests an AE edge condition.",
      status: "to_analyze",
    });

    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onUpdateTrackedParcelStatus).toHaveBeenCalledWith("parcel-1", "complete");
    expect(onRemoveTrackedParcel).toHaveBeenCalledWith("parcel-1");
  });
});

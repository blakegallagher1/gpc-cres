import type { HTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapWorkbenchPanel } from "./MapWorkbenchPanel";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    aside: ({ children, ...props }: HTMLAttributes<HTMLElement>) => (
      <aside {...props}>{children}</aside>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("./SavedGeofences", () => ({
  SavedGeofences: () => <div data-testid="saved-geofences">Saved geofences</div>,
}));

describe("MapWorkbenchPanel", () => {
  it("renders the integrated workbench layout when open", async () => {
    const user = userEvent.setup();
    const onToggleOpen = vi.fn();
    const onBaseLayerChange = vi.fn();
    const onApplyPreset = vi.fn();
    const onToggleDrawing = vi.fn();
    const setShowFlood = vi.fn();

    const { container } = render(
      <MapWorkbenchPanel
        open
        searchSlot={<div>Search content</div>}
        baseLayer="Streets"
        onBaseLayerChange={onBaseLayerChange}
        activePreset="zoning-scan"
        onApplyPreset={onApplyPreset}
        geometryStatusLabel="Loading shapes..."
        showParcelBoundaries
        setShowParcelBoundaries={vi.fn()}
        showZoning={false}
        setShowZoning={vi.fn()}
        showFlood={false}
        setShowFlood={setShowFlood}
        showSoils={false}
        setShowSoils={vi.fn()}
        showWetlands={false}
        setShowWetlands={vi.fn()}
        showEpa={false}
        setShowEpa={vi.fn()}
        showTools
        showComps={false}
        setShowComps={vi.fn()}
        showHeatmap
        setShowHeatmap={vi.fn()}
        activeHeatmapPreset="sale_activity"
        setActiveHeatmapPreset={vi.fn()}
        showIsochrone={false}
        setShowIsochrone={vi.fn()}
        measureMode="off"
        setMeasureMode={vi.fn()}
        drawing={false}
        hasPolygon={false}
        drawState={{
          label: "Draw area",
          badge: "Off",
          hint: "Sketch a polygon to search inside a tighter geography without leaving the map.",
        }}
        selectedCount={2}
        onToggleOpen={onToggleOpen}
        onScreenshot={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onToggleDrawing={onToggleDrawing}
        onUndoDraw={vi.fn()}
        onCancelDraw={vi.fn()}
        onClearPolygon={vi.fn()}
        polygon={null}
        onPolygonDrawn={vi.fn()}
        onOpenCompare={vi.fn()}
      />,
    );

    expect(screen.getByText("Geography workbench")).toBeInTheDocument();
    expect(screen.getByText("Find the parcel or place first.")).toBeInTheDocument();
    expect(screen.getByText("Search content")).toBeInTheDocument();
    expect(screen.getByText("Choose the cleanest base for the task.")).toBeInTheDocument();
    expect(screen.getByText("Activate only the supporting layers you need.")).toBeInTheDocument();
    expect(screen.getByText("Enable only the analytical overlays that support the current screen.")).toBeInTheDocument();
    expect(screen.getByText("Reuse named polygons for repeat scans.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse map workbench" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Export map screenshot" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Toggle map fullscreen" }),
    ).toBeVisible();

    expect(container.firstChild).toMatchSnapshot();

    await user.click(screen.getByText("References"));
    await user.click(screen.getByText("Analysis"));
    await user.click(screen.getByText("Measure / Draw"));
    await user.click(screen.getByRole("button", { name: /Zoning scan/i }));
    await user.click(screen.getByRole("button", { name: /Flood zones/i }));
    await user.click(screen.getByRole("radio", { name: "Satellite" }));
    await user.click(screen.getByRole("button", { name: "Draw boundary" }));

    expect(onApplyPreset).toHaveBeenCalledWith("zoning-scan");
    expect(setShowFlood).toHaveBeenCalledWith(true);
    expect(onBaseLayerChange).toHaveBeenCalledWith("Satellite");
    expect(onToggleDrawing).toHaveBeenCalledTimes(1);
  });

  it("keeps the dock controls visible when collapsed", async () => {
    const user = userEvent.setup();
    const onToggleOpen = vi.fn();

    render(
      <MapWorkbenchPanel
        open={false}
        baseLayer="Streets"
        onBaseLayerChange={vi.fn()}
        activePreset={null}
        onApplyPreset={vi.fn()}
        geometryStatusLabel={null}
        showParcelBoundaries
        setShowParcelBoundaries={vi.fn()}
        showZoning={false}
        setShowZoning={vi.fn()}
        showFlood={false}
        setShowFlood={vi.fn()}
        showSoils={false}
        setShowSoils={vi.fn()}
        showWetlands={false}
        setShowWetlands={vi.fn()}
        showEpa={false}
        setShowEpa={vi.fn()}
        showTools={false}
        showComps={false}
        setShowComps={vi.fn()}
        showHeatmap={false}
        setShowHeatmap={vi.fn()}
        activeHeatmapPreset="sale_activity"
        setActiveHeatmapPreset={vi.fn()}
        showIsochrone={false}
        setShowIsochrone={vi.fn()}
        measureMode="off"
        setMeasureMode={vi.fn()}
        drawing={false}
        hasPolygon={false}
        drawState={{
          label: "Draw area",
          badge: "Off",
          hint: "Sketch a polygon to search inside a tighter geography without leaving the map.",
        }}
        selectedCount={0}
        onToggleOpen={onToggleOpen}
        onScreenshot={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onToggleDrawing={vi.fn()}
        onUndoDraw={vi.fn()}
        onCancelDraw={vi.fn()}
        onClearPolygon={vi.fn()}
        polygon={null}
        onOpenCompare={vi.fn()}
      />,
    );

    await user.click(screen.getByTitle("Open workbench (L)"));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Live geography intelligence")).not.toBeInTheDocument();
  });
});

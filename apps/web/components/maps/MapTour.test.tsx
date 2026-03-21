import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapTour } from "./MapTour";

describe("MapTour", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  it("renders the themed guide and highlights available steps", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <div data-tour="layers-panel">Layers panel</div>
        <div data-tour="draw-tool">Draw tool</div>
        <div data-tour="analytical-toolbar">Analytics</div>
        <div data-tour="geofences">Geofences</div>
        <MapTour />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Map Guide" }));

    expect(
      screen.getByText("Navigate layers, draw tools, and saved areas."),
    ).toBeInTheDocument();
    expect(screen.getByText("Layer Controls")).toBeInTheDocument();
    expect(screen.getByText("Highlighted on map")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("reports when the current target control is unavailable", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <MapTour />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Map Guide" }));

    expect(screen.getByText("Control unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Open the relevant panel or state to surface this control, then continue the guide.",
      ),
    ).toBeInTheDocument();
  });
});

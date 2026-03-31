import { describe, expect, it } from "vitest";
import { clampFloatingPanelPosition } from "./floatingPanelPosition";

describe("clampFloatingPanelPosition", () => {
  it("places the panel beside the point when there is room", () => {
    expect(
      clampFloatingPanelPosition(
        { x: 100, y: 120 },
        { width: 800, height: 600 },
        { width: 200, height: 100 },
      ),
    ).toEqual({
      left: 112,
      top: 132,
      flippedX: false,
      flippedY: false,
    });
  });

  it("flips the panel to stay in bounds near the edge", () => {
    expect(
      clampFloatingPanelPosition(
        { x: 780, y: 580 },
        { width: 800, height: 600 },
        { width: 200, height: 100 },
      ),
    ).toEqual({
      left: 568,
      top: 468,
      flippedX: true,
      flippedY: true,
    });
  });
});

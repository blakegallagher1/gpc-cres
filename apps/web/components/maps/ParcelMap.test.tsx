import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./MapPageV2", () => ({
  MapPageV2: () => <div data-testid="map-page-v2" />,
}));

vi.mock("./MapLibreParcelMap", () => ({
  MapLibreParcelMap: () => <div data-testid="legacy-map" />,
}));

import { ParcelMap } from "./ParcelMap";

describe("ParcelMap", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MAP_V2_ENABLED;
  });

  it("renders the V2 bridge when the flag is enabled", () => {
    process.env.NEXT_PUBLIC_MAP_V2_ENABLED = "true";

    render(<ParcelMap parcels={[]} />);

    expect(screen.getByTestId("map-page-v2")).toBeInTheDocument();
  });

  it("renders the legacy map when the flag is disabled", () => {
    delete process.env.NEXT_PUBLIC_MAP_V2_ENABLED;

    render(<ParcelMap parcels={[]} />);

    expect(screen.getByTestId("legacy-map")).toBeInTheDocument();
  });
});

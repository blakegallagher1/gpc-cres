import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParcelDetailCard } from "./ParcelDetailCard";

const parcel = {
  id: "p-1",
  address: "123 Main St",
  lat: 30.45,
  lng: -91.18,
  owner: "Owner LLC",
  acreage: 1.25,
  currentZoning: "C2",
  floodZone: "X",
  propertyDbId: "uid-1",
};

describe("ParcelDetailCard", () => {
  it("renders detail fields and dispatches map actions", async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ParcelDetailCard
        parcel={parcel}
        point={[120, 140]}
        containerSize={{ width: 800, height: 600 }}
        onClose={onClose}
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Owner LLC")).toBeInTheDocument();
    expect(screen.getByText("1.25 acres")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Comps" }));
    await user.click(await screen.findByRole("button", { name: "View Comps" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "open_comps",
      parcelId: "p-1",
      lat: 30.45,
      lng: -91.18,
      address: "123 Main St",
    });

    await user.click(screen.getByRole("tab", { name: "Deals" }));
    await user.click(await screen.findByRole("button", { name: "Create Deal" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "create_deal",
      parcelId: "p-1",
    });

    await user.click(screen.getByRole("button", { name: "Screen Parcel" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "screen_parcel",
      parcelId: "p-1",
    });

    await user.click(screen.getByRole("button", { name: /close parcel card/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

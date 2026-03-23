import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DealCard } from "./DealCard";

describe("DealCard", () => {
  it("links directly to the deal detail page", () => {
    render(
      <DealCard
        deal={{
          id: "deal-detail-1",
          name: "Deal Detail Link",
          sku: "SMALL_BAY_FLEX",
          status: "INTAKE",
          jurisdiction: { name: "Houston, TX" },
          createdAt: "2026-01-01T00:00:00.000Z",
          triageTier: null,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /Deal Detail Link/i })).toHaveAttribute(
      "href",
      "/deals/deal-detail-1",
    );
  });
});

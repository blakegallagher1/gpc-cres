import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GeneralizedScorecard } from "@/components/deals/GeneralizedScorecard";

describe("GeneralizedScorecard", () => {
  it("groups scores by module and renders weighted module totals", () => {
    render(
      <GeneralizedScorecard
        scores={[
          {
            id: "score-1",
            module: "market_intel",
            dimension: "rent_growth",
            score: 0.9,
            weight: 2,
            evidence: "Industrial rent comps are still tightening.",
            scoredAt: "2026-03-10T10:00:00.000Z",
          },
          {
            id: "score-2",
            module: "market_intel",
            dimension: "vacancy",
            score: 0.6,
            weight: 1,
            evidence: "Vacancy remains manageable in the submarket.",
            scoredAt: "2026-03-09T10:00:00.000Z",
          },
          {
            id: "score-3",
            module: "execution_risk",
            dimension: "permits",
            score: 0.4,
            weight: 1,
            evidence: "Permitting path still needs jurisdiction review.",
            scoredAt: "2026-03-11T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Market Intel")).toBeInTheDocument();
    expect(screen.getByText("Execution Risk")).toBeInTheDocument();
    expect(screen.getByText("Rent Growth")).toBeInTheDocument();
    expect(screen.getByText("Vacancy")).toBeInTheDocument();
    expect(screen.getByText("Permits")).toBeInTheDocument();
    expect(screen.getByText("Industrial rent comps are still tightening.")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
    expect(screen.getByText("Weight 2.00")).toBeInTheDocument();
    expect(screen.getAllByText(/Last scored/i).length).toBeGreaterThan(0);
  });

  it("renders the legacy fallback empty state when no generalized scores exist", () => {
    render(<GeneralizedScorecard scores={[]} />);

    expect(
      screen.getByText("No generalized scores have been captured for this deal yet."),
    ).toBeInTheDocument();
  });
});

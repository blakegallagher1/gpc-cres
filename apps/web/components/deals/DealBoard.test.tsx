import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DealSummary } from "@/components/deals/DealCard";
import { DealBoard } from "./DealBoard";

const deals: DealSummary[] = [
  {
    id: "deal-intake",
    name: "Alpha Intake",
    sku: "SMALL_BAY_FLEX",
    status: "INTAKE",
    jurisdiction: { name: "Houston, TX" },
    createdAt: "2026-02-01T10:00:00.000Z",
    triageTier: "HOLD",
  },
  {
    id: "deal-execution",
    name: "Beta Hearing",
    sku: "OUTDOOR_STORAGE",
    status: "HEARING",
    jurisdiction: { name: "Austin, TX" },
    createdAt: "2026-02-01T11:00:00.000Z",
    triageTier: "ADVANCE",
  },
];

describe("DealBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders deal cards grouped by board stage with links to detail routes", () => {
    render(<DealBoard deals={deals} onMoveStatus={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Origination" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Execution" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Alpha Intake" }),
    ).toHaveAttribute("href", "/deals/deal-intake");
    expect(screen.getAllByRole("link", { name: "Beta Hearing" })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Beta Hearing" }),
    ).toHaveAttribute("href", "/deals/deal-execution");
  });

  it("moves a deal to the next stage when using card arrow controls", () => {
    const onMoveStatus = vi.fn();
    render(<DealBoard deals={deals} onMoveStatus={onMoveStatus} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Move Alpha Intake to Triage Done" }),
    );

    expect(onMoveStatus).toHaveBeenCalledWith("deal-intake", "TRIAGE_DONE");
  });

  it("moves a dragged card to the selected stage target", () => {
    const onMoveStatus = vi.fn();
    render(<DealBoard deals={deals} onMoveStatus={onMoveStatus} />);

    const dragData = {
      getData: (key: string) =>
        key === "text/plain"
          ? "deal-execution"
          : key === "application/x-board-stage"
            ? "CONCEPT"
            : "",
      setData: vi.fn(),
      clearData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: "all",
      dropEffect: "move",
      items: [],
      types: ["text/plain", "application/x-board-stage"],
    } as unknown as DataTransfer;

    const sourceCard = document.querySelector('[data-deal-id="deal-execution"]');
    expect(sourceCard).not.toBeNull();
    fireEvent.dragStart(sourceCard as Element, { dataTransfer: dragData });

    const targetColumn = document.querySelector('[data-board-stage="DISPOSITION"]');
    expect(targetColumn).not.toBeNull();
    fireEvent.dragOver(targetColumn as Element, { dataTransfer: dragData });
    fireEvent.drop(targetColumn as Element, { dataTransfer: dragData });

    expect(onMoveStatus).toHaveBeenCalledWith("deal-execution", "EXIT_MARKETED");
  });
});

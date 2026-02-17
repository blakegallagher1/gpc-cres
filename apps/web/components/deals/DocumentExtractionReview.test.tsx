import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DocumentExtractionReview,
  ExtractionPendingBadge,
  ExtractionStatusSummary,
  EXTRACTION_REVIEW_COUNT_EVENT,
} from "@/components/deals/DocumentExtractionReview";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildExtraction(purchasePrice: number, reviewed = false) {
  return {
    id: "ext-1",
    uploadId: "upload-1",
    dealId: "deal-1",
    docType: "psa",
    extractedData: {
      purchase_price: purchasePrice,
      earnest_money: 25000,
      due_diligence_period_days: 30,
      dd_start_date: "2026-01-01",
      closing_date: "2026-02-01",
      contingencies: ["financing"],
      seller_representations: ["authority"],
      special_provisions: [],
      buyer_entity: "Buyer LLC",
      seller_entity: "Seller LLC",
    },
    rawText:
      "Purchase and Sale Agreement. The confirmed purchase price is 1100000 with earnest money 25000 and closing date 2026-02-01.",
    confidence: 0.91,
    extractedAt: "2026-02-16T12:00:00.000Z",
    reviewed,
    reviewedBy: reviewed ? "user-1" : null,
    reviewedAt: reviewed ? "2026-02-16T12:10:00.000Z" : null,
    upload: {
      id: "upload-1",
      filename: "PSA.pdf",
      kind: "DOCUMENT",
      contentType: "application/pdf",
      sizeBytes: 1024,
      createdAt: "2026-02-16T11:00:00.000Z",
    },
  };
}

function buildExtractionListResponse(
  extractions: Array<ReturnType<typeof buildExtraction>>
) {
  const totalCount = extractions.length;
  const pendingCount = extractions.filter((extraction) => !extraction.reviewed).length;
  const reviewedCount = totalCount - pendingCount;
  const extractionStatus =
    totalCount === 0
      ? "none"
      : pendingCount > 0
        ? "pending_review"
        : "review_complete";

  return {
    extractions,
    unreviewedCount: pendingCount,
    pendingCount,
    reviewedCount,
    totalCount,
    extractionStatus,
  };
}

describe("DocumentExtractionReview D3 flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows source context alongside extracted fields", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/deals/deal-1/extractions" && method === "GET") {
        return jsonResponse(
          buildExtractionListResponse([buildExtraction(1100000, false)])
        );
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<DocumentExtractionReview dealId="deal-1" />);

    expect((await screen.findAllByText("Pending Review")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("1 pending")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Purchase Price")).toBeInTheDocument();
    const provenanceHeaders = await screen.findAllByText("Source Provenance");
    expect(provenanceHeaders.length).toBeGreaterThan(0);
    const matchedBadges = await screen.findAllByText("Matched");
    expect(matchedBadges.length).toBeGreaterThan(0);
    expect(await screen.findByText("High 91%")).toBeInTheDocument();
    const sourceMatches = await screen.findAllByText(/purchase price is 1100000/i);
    expect(sourceMatches.length).toBeGreaterThan(0);
  });

  it("shows provided provenance details when returned by the API", async () => {
    const extraction = {
      ...buildExtraction(1100000, false),
      rawText: null,
      sourceProvenance: {
        purchase_price: {
          snippet: "Purchase price set at $1,100,000.",
          source: "PSA.pdf",
          page: 7,
          flags: ["needs legal review"],
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/deals/deal-1/extractions" && method === "GET") {
        return jsonResponse(buildExtractionListResponse([extraction]));
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<DocumentExtractionReview dealId="deal-1" />);

    expect(await screen.findByText("Provided")).toBeInTheDocument();
    expect(await screen.findByText("PSA.pdf · Page 7")).toBeInTheDocument();
    expect(
      await screen.findByText("Purchase price set at $1,100,000.")
    ).toBeInTheDocument();
    expect(await screen.findByText("needs legal review")).toBeInTheDocument();
  });

  it("shows low-confidence and missing-source flags", async () => {
    const extraction = {
      ...buildExtraction(1100000, false),
      confidence: 0.41,
      rawText: null,
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/deals/deal-1/extractions" && method === "GET") {
        return jsonResponse(buildExtractionListResponse([extraction]));
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<DocumentExtractionReview dealId="deal-1" />);

    expect(await screen.findByText("Low 41%")).toBeInTheDocument();
    expect(await screen.findByText("Low confidence extraction")).toBeInTheDocument();
    expect(
      await screen.findByText(/\d+ fields? missing source provenance/i)
    ).toBeInTheDocument();
    const missingBadges = await screen.findAllByText("Missing");
    expect(missingBadges.length).toBeGreaterThan(0);
  });

  it("persists correction edits without marking extraction reviewed", async () => {
    const patchBodies: Array<Record<string, unknown>> = [];
    let persistedExtraction = buildExtraction(1100000, false);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/deals/deal-1/extractions" && method === "GET") {
        return jsonResponse(buildExtractionListResponse([persistedExtraction]));
      }

      if (url === "/api/deals/deal-1/extractions/ext-1" && method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        patchBodies.push(body);
        const nextData = body.extractedData as Record<string, unknown> | undefined;
        persistedExtraction = {
          ...persistedExtraction,
          extractedData: nextData ?? persistedExtraction.extractedData,
        };
        return jsonResponse({ extraction: persistedExtraction });
      }

      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<DocumentExtractionReview dealId="deal-1" />);

    fireEvent.click(await screen.findByLabelText("Edit purchase_price"));
    fireEvent.change(screen.getByDisplayValue("1100000"), {
      target: { value: "1200000" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save field purchase_price" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Corrections" }));

    await waitFor(() => {
      expect(patchBodies).toHaveLength(1);
    });
    expect(patchBodies[0]).toMatchObject({
      extractedData: expect.objectContaining({ purchase_price: 1200000 }),
    });
    expect(patchBodies[0].reviewed).toBeUndefined();
  });

  it("confirms extraction and persists reviewed=true", async () => {
    const patchBodies: Array<Record<string, unknown>> = [];
    let persistedExtraction = buildExtraction(1100000, false);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/deals/deal-1/extractions" && method === "GET") {
        return jsonResponse(buildExtractionListResponse([persistedExtraction]));
      }

      if (url === "/api/deals/deal-1/extractions/ext-1" && method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        patchBodies.push(body);
        const nextData = body.extractedData as Record<string, unknown> | undefined;
        persistedExtraction = {
          ...persistedExtraction,
          extractedData: nextData ?? persistedExtraction.extractedData,
          reviewed: body.reviewed === true,
          reviewedAt:
            body.reviewed === true ? "2026-02-16T12:20:00.000Z" : persistedExtraction.reviewedAt,
          reviewedBy: body.reviewed === true ? "user-1" : persistedExtraction.reviewedBy,
        };
        return jsonResponse({ extraction: persistedExtraction });
      }

      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<DocumentExtractionReview dealId="deal-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm & Apply" }));

    await waitFor(() => {
      expect(patchBodies).toHaveLength(1);
    });
    expect(patchBodies[0]).toMatchObject({
      reviewed: true,
      extractedData: expect.objectContaining({ purchase_price: 1100000 }),
    });
  });

  it("propagates reviewed/pending status across extraction surfaces after confirm", async () => {
    let persistedExtraction = buildExtraction(1100000, false);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/deals/deal-1/extractions" && method === "GET") {
        return jsonResponse(buildExtractionListResponse([persistedExtraction]));
      }

      if (url === "/api/deals/deal-1/extractions/ext-1" && method === "PATCH") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        persistedExtraction = {
          ...persistedExtraction,
          reviewed: body.reviewed === true,
          reviewedAt:
            body.reviewed === true ? "2026-02-16T12:20:00.000Z" : persistedExtraction.reviewedAt,
          reviewedBy: body.reviewed === true ? "user-1" : persistedExtraction.reviewedBy,
        };
        return jsonResponse({ extraction: persistedExtraction });
      }

      return jsonResponse({ error: "Not found" }, 404);
    });

    render(
      <>
        <ExtractionStatusSummary dealId="deal-1" />
        <DocumentExtractionReview dealId="deal-1" />
      </>
    );

    expect((await screen.findAllByText("Pending Review")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("1 pending")).length).toBeGreaterThan(0);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm & Apply" }));

    await waitFor(() => {
      expect(screen.getAllByText("Review Complete").length).toBeGreaterThan(0);
      expect(screen.getAllByText("1 reviewed").length).toBeGreaterThan(0);
      expect(screen.getAllByText("0 pending").length).toBeGreaterThan(0);
    });
  });
});

describe("ExtractionPendingBadge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates count from review events on the same deal surface", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/deals/deal-1/extractions" && method === "GET") {
        return jsonResponse({ pendingCount: 3, unreviewedCount: 3, totalCount: 4 });
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    render(<ExtractionPendingBadge dealId="deal-1" />);

    expect(await screen.findByText("3")).toBeInTheDocument();

    window.dispatchEvent(
      new CustomEvent(EXTRACTION_REVIEW_COUNT_EVENT, {
        detail: {
          dealId: "deal-1",
          pendingCount: 1,
          unreviewedCount: 1,
          reviewedCount: 3,
          totalCount: 4,
          status: "pending_review",
        },
      })
    );

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });
});

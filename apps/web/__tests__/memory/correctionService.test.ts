import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryVerified: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    memoryDraft: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: prismaMock,
}));

import { applyCorrection } from "@/lib/services/correctionService";
import { getTruthView } from "@/lib/services/truthViewService";
import type { CorrectionPayload } from "@/lib/schemas/memoryWrite";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("correctionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a verified record with factType=correction", async () => {
    const correction: CorrectionPayload = {
      corrected_attribute_key: "comp.noi",
      corrected_value: 175000,
      correction_reason: "Updated appraisal report received",
      corrected_event_id: "original-event-1",
    };

    prismaMock.memoryVerified.create.mockResolvedValue({
      id: "correction-1",
      orgId: ORG_ID,
      entityId: ENTITY_ID,
      factType: "correction",
      sourceType: "correction",
      economicWeight: 1.0,
      volatilityClass: "stable",
      payloadJson: correction,
      requestId: "req-1",
      eventLogId: "event-1",
      createdAt: new Date("2026-02-26"),
    });

    const result = await applyCorrection(
      ENTITY_ID,
      ORG_ID,
      correction,
      "event-1",
      "req-1",
    );

    expect(result.id).toBe("correction-1");
    expect(result.factType).toBe("correction");
    expect(result.sourceType).toBe("correction");
    expect(result.economicWeight).toBe(1.0);
    expect(result.volatilityClass).toBe("stable");

    expect(prismaMock.memoryVerified.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        entityId: ENTITY_ID,
        factType: "correction",
        sourceType: "correction",
        economicWeight: 1.0,
        volatilityClass: "stable",
      }),
    });
  });

  it("preserves original records (append-only)", async () => {
    prismaMock.memoryVerified.create.mockResolvedValue({
      id: "correction-2",
      factType: "correction",
    });

    await applyCorrection(
      ENTITY_ID,
      ORG_ID,
      {
        corrected_attribute_key: "comp.sale_price",
        corrected_value: 2600000,
        correction_reason: "Price adjustment",
        corrected_event_id: null,
      },
      "event-2",
      "req-2",
    );

    // Only create was called — no update or delete
    expect(prismaMock.memoryVerified.create).toHaveBeenCalledTimes(1);
  });
});

describe("truthView with corrections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns corrected value in truth view, superseding original", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      // Original comp (older)
      {
        id: "original-1",
        entityId: ENTITY_ID,
        orgId: ORG_ID,
        factType: "comp",
        sourceType: "agent",
        payloadJson: { noi: 150000, sale_price: 2500000 },
        createdAt: new Date("2026-01-01"),
      },
      // Correction (newer — returned first due to orderBy desc)
      {
        id: "correction-1",
        entityId: ENTITY_ID,
        orgId: ORG_ID,
        factType: "correction",
        sourceType: "correction",
        payloadJson: {
          corrected_attribute_key: "comp.noi",
          corrected_value: 175000,
          correction_reason: "Updated appraisal",
        },
        createdAt: new Date("2026-02-01"),
      },
    ]);

    prismaMock.memoryDraft.findMany.mockResolvedValue([]);

    const truth = await getTruthView(ENTITY_ID, ORG_ID);

    // Corrected value wins
    expect(truth.currentValues["comp.noi"].value).toBe(175000);
    expect(truth.currentValues["comp.noi"].source).toBe("correction");
    expect(truth.currentValues["comp.noi"].correctedBy).toBe("correction-1");

    // Non-corrected value preserved from original
    expect(truth.currentValues["comp.sale_price"].value).toBe(2500000);
    expect(truth.currentValues["comp.sale_price"].source).toBe("agent");

    // Correction entry recorded
    expect(truth.corrections).toHaveLength(1);
    expect(truth.corrections[0].key).toBe("comp.noi");
    expect(truth.corrections[0].oldValue).toBe(150000);
    expect(truth.corrections[0].newValue).toBe(175000);
  });

  it("surfaces open conflicts from draft records", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      {
        id: "verified-1",
        factType: "comp",
        sourceType: "agent",
        payloadJson: { noi: 150000 },
        createdAt: new Date("2026-01-01"),
      },
    ]);

    prismaMock.memoryDraft.findMany.mockResolvedValue([
      {
        id: "draft-1",
        factType: "comp",
        payloadJson: { noi: 162500 },
        createdAt: new Date("2026-02-01"),
      },
    ]);

    const truth = await getTruthView(ENTITY_ID, ORG_ID);

    expect(truth.openConflicts).toHaveLength(1);
    expect(truth.openConflicts[0].key).toBe("comp.noi");
    expect(truth.openConflicts[0].values).toContain(162500);
    expect(truth.openConflicts[0].draftIds).toContain("draft-1");
  });
});

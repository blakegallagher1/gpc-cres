import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    memoryVerified: {
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

import { getTruthView } from "@/lib/services/truthViewService";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

function makeVerified(overrides: Record<string, unknown>) {
  return {
    id: "v-1",
    orgId: ORG_ID,
    entityId: ENTITY_ID,
    factType: "comp",
    sourceType: "user",
    payloadJson: {},
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...overrides,
  };
}

describe("getTruthView", () => {
  beforeEach(() => {
    prismaMock.memoryVerified.findMany.mockReset();
    prismaMock.memoryDraft.findMany.mockReset();
  });

  it("returns empty view when no records exist", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);
    prismaMock.memoryDraft.findMany.mockResolvedValue([]);

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    expect(Object.keys(view.currentValues)).toHaveLength(0);
    expect(view.openConflicts).toHaveLength(0);
    expect(view.corrections).toHaveLength(0);
  });

  it("builds currentValues from verified records (latest wins)", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      makeVerified({
        id: "v-1",
        payloadJson: { noi: 150000, cap_rate: 0.065 },
        createdAt: new Date("2026-02-02T00:00:00Z"),
      }),
      makeVerified({
        id: "v-2",
        payloadJson: { noi: 140000 },
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
    ]);
    prismaMock.memoryDraft.findMany.mockResolvedValue([]);

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    // Ordered desc, so v-1 is first — its values win
    expect(view.currentValues["comp.noi"]?.value).toBe(150000);
    expect(view.currentValues["comp.cap_rate"]?.value).toBe(0.065);
  });

  it("applies corrections that supersede existing values", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      // Correction record (newer)
      makeVerified({
        id: "c-1",
        factType: "correction",
        sourceType: "correction",
        payloadJson: {
          corrected_attribute_key: "comp.noi",
          corrected_value: 175000,
          correction_reason: "Updated appraisal",
        },
        createdAt: new Date("2026-02-03T00:00:00Z"),
      }),
      // Original record
      makeVerified({
        id: "v-1",
        payloadJson: { noi: 150000 },
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
    ]);
    prismaMock.memoryDraft.findMany.mockResolvedValue([]);

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    expect(view.currentValues["comp.noi"]?.value).toBe(175000);
    expect(view.currentValues["comp.noi"]?.source).toBe("correction");
    expect(view.currentValues["comp.noi"]?.correctedBy).toBe("c-1");
    expect(view.corrections).toHaveLength(1);
    expect(view.corrections[0].oldValue).toBe(150000);
    expect(view.corrections[0].newValue).toBe(175000);
    expect(view.corrections[0].reason).toBe("Updated appraisal");
  });

  it("does not double-correct an already-corrected key", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      // First correction (desc order — this is newer)
      makeVerified({
        id: "c-2",
        factType: "correction",
        payloadJson: {
          corrected_attribute_key: "comp.noi",
          corrected_value: 200000,
          correction_reason: "Second correction",
        },
        createdAt: new Date("2026-02-04T00:00:00Z"),
      }),
      // Second correction (older)
      makeVerified({
        id: "c-1",
        factType: "correction",
        payloadJson: {
          corrected_attribute_key: "comp.noi",
          corrected_value: 175000,
          correction_reason: "First correction",
        },
        createdAt: new Date("2026-02-03T00:00:00Z"),
      }),
      // Original
      makeVerified({
        id: "v-1",
        payloadJson: { noi: 150000 },
        createdAt: new Date("2026-02-01T00:00:00Z"),
      }),
    ]);
    prismaMock.memoryDraft.findMany.mockResolvedValue([]);

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    // First correction wins (it's processed first in desc order), second skipped
    expect(view.currentValues["comp.noi"]?.value).toBe(200000);
    expect(view.currentValues["comp.noi"]?.correctedBy).toBe("c-2");
    expect(view.corrections).toHaveLength(2);
  });

  it("builds openConflicts from draft records with conflictFlag", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([]);
    prismaMock.memoryDraft.findMany.mockResolvedValue([
      {
        id: "d-1",
        factType: "comp",
        payloadJson: { noi: 160000 },
      },
      {
        id: "d-2",
        factType: "comp",
        payloadJson: { noi: 180000 },
      },
    ]);

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    expect(view.openConflicts).toHaveLength(1);
    expect(view.openConflicts[0].key).toBe("comp.noi");
    expect(view.openConflicts[0].values).toEqual([160000, 180000]);
    expect(view.openConflicts[0].draftIds).toEqual(["d-1", "d-2"]);
  });

  it("skips correction records with missing corrected_attribute_key", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      makeVerified({
        id: "c-bad",
        factType: "correction",
        payloadJson: { some_other_field: "value" },
        createdAt: new Date("2026-02-03T00:00:00Z"),
      }),
    ]);
    prismaMock.memoryDraft.findMany.mockResolvedValue([]);

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    expect(view.corrections).toHaveLength(0);
  });

  it("handles null/non-object payloadJson gracefully", async () => {
    prismaMock.memoryVerified.findMany.mockResolvedValue([
      makeVerified({ id: "v-1", payloadJson: null }),
      makeVerified({ id: "v-2", payloadJson: "not-an-object" }),
    ]);
    prismaMock.memoryDraft.findMany.mockResolvedValue([]);

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    expect(Object.keys(view.currentValues)).toHaveLength(0);
  });

  it("returns empty view on error", async () => {
    prismaMock.memoryVerified.findMany.mockRejectedValue(new Error("DB down"));
    prismaMock.memoryDraft.findMany.mockRejectedValue(new Error("DB down"));

    const view = await getTruthView(ENTITY_ID, ORG_ID);

    expect(Object.keys(view.currentValues)).toHaveLength(0);
    expect(view.openConflicts).toHaveLength(0);
    expect(view.corrections).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMock, updateManyMock, upsertMock, deserializeRunStateEnvelopeMock } = vi.hoisted(
  () => ({
    updateMock: vi.fn(),
    updateManyMock: vi.fn(),
    upsertMock: vi.fn(),
    deserializeRunStateEnvelopeMock: vi.fn(),
  }),
);

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      update: updateMock,
      updateMany: updateManyMock,
      upsert: upsertMock,
    },
  },
}));

vi.mock("@entitlement-os/openai", () => ({
  deserializeRunStateEnvelope: deserializeRunStateEnvelopeMock,
}));

import {
  persistFinalRunResult,
  readSerializedRunStateFromStoredValue,
  upsertRunRecord,
} from "./agentRunPersistence";

describe("agentRunPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads serialized run state from the current envelope shape first", () => {
    deserializeRunStateEnvelopeMock.mockReturnValue({
      serializedRunState: "serialized-current",
    });

    expect(readSerializedRunStateFromStoredValue({ checkpoint: "approval_pending" })).toBe(
      "serialized-current",
    );
  });

  it("falls back to the legacy serializedRunState field", () => {
    deserializeRunStateEnvelopeMock.mockReturnValue(null);

    expect(
      readSerializedRunStateFromStoredValue({
        serializedRunState: "serialized-legacy",
      }),
    ).toBe("serialized-legacy");
  });

  it("persists the final run result directly when no execution lease is present", async () => {
    updateMock.mockResolvedValue({ id: "run-1" });

    await expect(
      persistFinalRunResult({
        runId: "run-1",
        status: "succeeded",
        openaiResponseId: "response-1",
        outputJson: { finalOutput: "done" },
      }),
    ).resolves.toBe(true);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({
          status: "succeeded",
          openaiResponseId: "response-1",
          outputJson: { finalOutput: "done" },
        }),
      }),
    );
  });

  it("honors the execution lease token when persisting final run results", async () => {
    updateManyMock.mockResolvedValue({ count: 1 });

    await expect(
      persistFinalRunResult({
        runId: "run-1",
        status: "failed",
        openaiResponseId: "response-2",
        outputJson: { finalOutput: "error" },
        executionLeaseToken: "lease-1",
      }),
    ).resolves.toBe(true);

    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", openaiResponseId: "lease-1" },
        data: expect.objectContaining({
          status: "failed",
          openaiResponseId: "response-2",
          outputJson: { finalOutput: "error" },
        }),
      }),
    );
  });

  it("normalizes invalid sku values to null when upserting a run", async () => {
    upsertMock.mockResolvedValue({ id: "run-1" });

    await upsertRunRecord({
      runId: "run-1",
      orgId: "org-1",
      runType: "ENRICHMENT",
      inputHash: "hash-1",
      sku: "NOT_A_REAL_SKU",
      status: "running",
    });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sku: null,
        }),
        update: expect.objectContaining({
          sku: null,
        }),
      }),
    );
  });
});

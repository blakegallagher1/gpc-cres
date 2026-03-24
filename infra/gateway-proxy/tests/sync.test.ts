import { describe, it, expect } from "vitest";

// We can only test the chunkArray logic and validateSyncToken without D1 mocks
// Import the module to verify it compiles
describe("sync module", () => {
  it("exports validateSyncToken", async () => {
    const mod = await import("../src/sync");
    expect(typeof mod.validateSyncToken).toBe("function");
  });

  it("exports handleSyncBatch", async () => {
    const mod = await import("../src/sync");
    expect(typeof mod.handleSyncBatch).toBe("function");
  });

  it("exports getSyncStatus", async () => {
    const mod = await import("../src/sync");
    expect(typeof mod.getSyncStatus).toBe("function");
  });

  it("validateSyncToken rejects missing token", async () => {
    const { validateSyncToken } = await import("../src/sync");
    const req = new Request("http://localhost");
    const env = { SYNC_TOKEN: "secret" } as any;
    expect(validateSyncToken(req, env)).toBe(false);
  });

  it("validateSyncToken accepts correct token", async () => {
    const { validateSyncToken } = await import("../src/sync");
    const req = new Request("http://localhost", {
      headers: { "X-Sync-Token": "secret" },
    });
    const env = { SYNC_TOKEN: "secret" } as any;
    expect(validateSyncToken(req, env)).toBe(true);
  });

  it("validateSyncToken rejects when env has no SYNC_TOKEN", async () => {
    const { validateSyncToken } = await import("../src/sync");
    const req = new Request("http://localhost", {
      headers: { "X-Sync-Token": "secret" },
    });
    const env = {} as any;
    expect(validateSyncToken(req, env)).toBe(false);
  });
});

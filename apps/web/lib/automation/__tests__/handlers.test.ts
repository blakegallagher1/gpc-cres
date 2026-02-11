// Mock external deps to prevent OpenAI SDK / Playwright import errors
vi.mock("@entitlement-os/openai", () => ({
  propertyDbRpc: vi.fn(),
}));
vi.mock("../artifactAutomation", () => ({
  handleArtifactOnStatusChange: vi.fn(),
  handleTriageArtifactNotification: vi.fn(),
}));
vi.mock("@entitlement-os/db", () => ({
  prisma: {
    parcel: { findFirst: vi.fn(), update: vi.fn() },
    task: { create: vi.fn() },
  },
}));

import { ensureHandlersRegistered } from "../handlers";

describe("handlers", () => {
  it("should export ensureHandlersRegistered function", () => {
    expect(typeof ensureHandlersRegistered).toBe("function");
  });

  it("should not throw when called", () => {
    expect(() => ensureHandlersRegistered()).not.toThrow();
  });

  it("should be idempotent (calling twice does not throw)", () => {
    expect(() => {
      ensureHandlersRegistered();
      ensureHandlersRegistered();
    }).not.toThrow();
  });
});

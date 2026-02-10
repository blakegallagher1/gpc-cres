// Mock external deps to prevent OpenAI SDK import errors
jest.mock("@entitlement-os/openai", () => ({
  propertyDbRpc: jest.fn(),
}));
jest.mock("@entitlement-os/db", () => ({
  prisma: {
    parcel: { findFirst: jest.fn(), update: jest.fn() },
    task: { create: jest.fn() },
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

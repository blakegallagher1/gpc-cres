import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAuthSecret } from "./authSecret";

describe("getAuthSecret", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns AUTH_SECRET when configured", () => {
    process.env.AUTH_SECRET = " current-secret ";
    process.env.NEXTAUTH_SECRET = "legacy-secret";

    expect(getAuthSecret()).toBe("current-secret");
  });

  it("falls back to NEXTAUTH_SECRET when AUTH_SECRET is missing", () => {
    process.env.NEXTAUTH_SECRET = " legacy-secret ";

    expect(getAuthSecret()).toBe("legacy-secret");
  });

  it("returns null when neither auth secret is configured", () => {
    expect(getAuthSecret()).toBeNull();
  });
});

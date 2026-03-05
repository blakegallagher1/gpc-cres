import { afterEach, describe, expect, it } from "vitest";

import {
  getCloudflareAccessHeadersFromEnv,
  isMissingOrPlaceholder,
} from "@/lib/server/propertyDbEnv";

describe("propertyDbEnv Access header helpers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns Access headers when both values are configured", () => {
    process.env.CF_ACCESS_CLIENT_ID = "client-id.access";
    process.env.CF_ACCESS_CLIENT_SECRET = "client-secret";

    expect(getCloudflareAccessHeadersFromEnv()).toEqual({
      "CF-Access-Client-Id": "client-id.access",
      "CF-Access-Client-Secret": "client-secret",
    });
  });

  it("returns empty headers when either value is missing or placeholder", () => {
    process.env.CF_ACCESS_CLIENT_ID = "client-id.access";
    delete process.env.CF_ACCESS_CLIENT_SECRET;
    expect(getCloudflareAccessHeadersFromEnv()).toEqual({});

    process.env.CF_ACCESS_CLIENT_SECRET = "placeholder-secret";
    expect(getCloudflareAccessHeadersFromEnv()).toEqual({});
  });

  it("detects placeholder values", () => {
    expect(isMissingOrPlaceholder(undefined)).toBe(true);
    expect(isMissingOrPlaceholder("")).toBe(true);
    expect(isMissingOrPlaceholder(" placeholder ")).toBe(true);
    expect(isMissingOrPlaceholder("null")).toBe(true);
    expect(isMissingOrPlaceholder("undefined")).toBe(true);
    expect(isMissingOrPlaceholder("real-value")).toBe(false);
  });
});

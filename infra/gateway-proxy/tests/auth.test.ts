import { describe, it, expect } from "vitest";
import { validateBearer, upstreamHeaders } from "../src/auth";

const env = {
  UPSTREAM_GATEWAY_URL: "https://api.gallagherpropco.com",
  GATEWAY_PROXY_TOKEN: "test-token",
  LOCAL_API_KEY: "local-key",
  CF_ACCESS_CLIENT_ID: "cf-id",
  CF_ACCESS_CLIENT_SECRET: "cf-secret",
};

describe("validateBearer", () => {
  it("accepts valid token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer test-token" },
    });
    expect(validateBearer(req, env as any)).toBe(true);
  });

  it("rejects missing header", () => {
    const req = new Request("http://localhost");
    expect(validateBearer(req, env as any)).toBe(false);
  });

  it("rejects wrong token", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(validateBearer(req, env as any)).toBe(false);
  });

  it("rejects empty bearer", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer " },
    });
    expect(validateBearer(req, env as any)).toBe(false);
  });
});

describe("upstreamHeaders", () => {
  it("includes Authorization with LOCAL_API_KEY", () => {
    const headers = upstreamHeaders(env as any);
    expect(headers["Authorization"]).toBe("Bearer local-key");
  });

  it("includes CF Access headers", () => {
    const headers = upstreamHeaders(env as any);
    expect(headers["CF-Access-Client-Id"]).toBe("cf-id");
    expect(headers["CF-Access-Client-Secret"]).toBe("cf-secret");
  });

  it("includes request ID when provided", () => {
    const headers = upstreamHeaders(env as any, "req-123");
    expect(headers["x-request-id"]).toBe("req-123");
  });

  it("omits request ID when not provided", () => {
    const headers = upstreamHeaders(env as any);
    expect(headers["x-request-id"]).toBeUndefined();
  });

  it("omits CF Access headers when not configured", () => {
    const envNoCf = {
      ...env,
      CF_ACCESS_CLIENT_ID: "",
      CF_ACCESS_CLIENT_SECRET: "",
    };
    const headers = upstreamHeaders(envNoCf as any);
    expect(headers["CF-Access-Client-Id"]).toBeUndefined();
    expect(headers["CF-Access-Client-Secret"]).toBeUndefined();
  });
});

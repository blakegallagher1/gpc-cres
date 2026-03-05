import { afterEach, describe, expect, it } from "vitest";

import { gatewayHeaders } from "@/lib/gateway-proxy";

describe("gateway-proxy header propagation", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("includes Access headers when configured", () => {
    process.env.CF_ACCESS_CLIENT_ID = "client-id.access";
    process.env.CF_ACCESS_CLIENT_SECRET = "client-secret";

    const headers = gatewayHeaders(
      "gateway-key",
      { orgId: "org-1", userId: "user-1" },
      { contentType: "json" },
    );

    expect(headers).toMatchObject({
      Authorization: "Bearer gateway-key",
      "X-Org-Id": "org-1",
      "X-User-Id": "user-1",
      "CF-Access-Client-Id": "client-id.access",
      "CF-Access-Client-Secret": "client-secret",
      "Content-Type": "application/json",
    });
  });

  it("omits Access headers when not configured", () => {
    delete process.env.CF_ACCESS_CLIENT_ID;
    delete process.env.CF_ACCESS_CLIENT_SECRET;

    const headers = gatewayHeaders("gateway-key", { orgId: "org-1", userId: "user-1" });

    expect(headers["CF-Access-Client-Id"]).toBeUndefined();
    expect(headers["CF-Access-Client-Secret"]).toBeUndefined();
  });
});

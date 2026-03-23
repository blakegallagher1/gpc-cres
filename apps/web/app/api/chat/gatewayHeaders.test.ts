import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGatewayHeaders } from "./gatewayHeaders";

describe("buildGatewayHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes Cloudflare Access headers when present", () => {
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "client-id");
    vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "client-secret");

    expect(buildGatewayHeaders("gateway-key")).toEqual({
      Authorization: "Bearer gateway-key",
      apikey: "gateway-key",
      "Content-Type": "application/json",
      "CF-Access-Client-Id": "client-id",
      "CF-Access-Client-Secret": "client-secret",
    });
  });

  it("omits Cloudflare Access headers when unset", () => {
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "");
    vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "");

    expect(buildGatewayHeaders("gateway-key")).toEqual({
      Authorization: "Bearer gateway-key",
      apikey: "gateway-key",
      "Content-Type": "application/json",
    });
  });
});

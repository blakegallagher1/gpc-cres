import { describe, it } from "vitest";
import { expectResolveAuthUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("/api/market route auth", () => {
  it("returns 401 on GET when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/market",
    });
  });

  it("returns 401 on POST when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/market",
      body: { parish: "EBR", dataType: "permits", source: "manual" },
    });
  });
});

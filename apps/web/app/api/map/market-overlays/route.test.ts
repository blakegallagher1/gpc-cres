import { describe, it } from "vitest";
import { expectResolveAuthUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("GET /api/map/market-overlays", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/map/market-overlays",
    });
  });
});

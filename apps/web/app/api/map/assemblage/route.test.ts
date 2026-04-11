import { describe, it } from "vitest";
import { expectResolveAuthUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("/api/map/assemblage route auth", () => {
  it("returns 401 on GET when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/map/assemblage",
    });
  });

  it("returns 401 on POST when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/map/assemblage",
      body: {},
    });
  });
});

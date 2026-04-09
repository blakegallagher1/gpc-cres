import { describe, it } from "vitest";
import { expectAuthorizeApiRouteUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("GET /api/map/workspaces/[id]/comps", () => {
  it("returns 401 when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/map/workspaces/ws-1/comps",
      context: { params: Promise.resolve({ id: "ws-1" }) },
    });
  });
});

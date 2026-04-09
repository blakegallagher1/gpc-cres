import { describe, it } from "vitest";
import { expectAuthorizeApiRouteUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("POST /api/map/workspaces/[id]/outreach", () => {
  it("returns 401 when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/map/workspaces/ws-1/outreach",
      context: { params: Promise.resolve({ id: "ws-1" }) },
      body: {},
    });
  });
});

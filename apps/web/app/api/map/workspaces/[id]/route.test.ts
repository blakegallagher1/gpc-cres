import { describe, it } from "vitest";
import { expectAuthorizeApiRouteUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("/api/map/workspaces/[id] route auth", () => {
  const context = { params: Promise.resolve({ id: "ws-1" }) };

  it("returns 401 on GET when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/map/workspaces/ws-1",
      context,
    });
  });

  it("returns 401 on PATCH when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "PATCH",
      url: "http://localhost/api/map/workspaces/ws-1",
      context,
      body: {},
    });
  });
});

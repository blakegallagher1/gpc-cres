import { describe, it } from "vitest";
import {
  expectAuthorizeApiRouteUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("/api/memory/collisions route auth", () => {
  it("returns 401 on GET when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/memory/collisions",
    });
  });

  it("returns 401 on POST when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/memory/collisions",
      body: { alertId: "alert-1", resolution: "merge" },
    });
  });
});

import { describe, it } from "vitest";
import {
  expectAuthorizeApiRouteUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("GET /api/memory/stats", () => {
  it("returns 401 when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/memory/stats",
    });
  });
});

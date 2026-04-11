import { describe, it } from "vitest";
import {
  expectResolveAuthUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("GET /api/wealth/summary", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/wealth/summary",
    });
  });
});

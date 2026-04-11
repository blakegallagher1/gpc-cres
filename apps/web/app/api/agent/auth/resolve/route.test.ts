import { describe, it } from "vitest";
import {
  expectResolveAuthUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("POST/GET /api/agent/auth/resolve", () => {
  it("returns 401 on GET when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/agent/auth/resolve",
    });
  });

  it("returns 401 on POST when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/agent/auth/resolve",
      body: {},
    });
  });
});

import { describe, it } from "vitest";
import {
  expectResolveAuthUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("/api/approvals route auth", () => {
  it("returns 401 on GET when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/approvals",
    });
  });

  it("returns 401 on POST when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/approvals",
      body: { dealId: "deal-1", stageFrom: "INTAKE", stageTo: "PREAPP" },
    });
  });

  it("returns 401 on PATCH when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "PATCH",
      url: "http://localhost/api/approvals",
      body: { requestId: "req-1", action: "approve" },
    });
  });
});

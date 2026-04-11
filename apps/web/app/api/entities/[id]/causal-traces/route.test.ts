import { describe, it } from "vitest";
import { expectResolveAuthUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("GET /api/entities/[id]/causal-traces", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/entities/entity-1/causal-traces",
      context: { params: Promise.resolve({ id: "entity-1" }) },
    });
  });
});

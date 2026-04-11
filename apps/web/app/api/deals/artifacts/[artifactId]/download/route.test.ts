import { describe, it } from "vitest";
import { expectResolveAuthUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("GET /api/deals/artifacts/[artifactId]/download", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/deals/artifacts/artifact-1/download",
      context: { params: Promise.resolve({ artifactId: "artifact-1" }) },
    });
  });
});

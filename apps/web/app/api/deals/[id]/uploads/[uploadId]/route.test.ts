import { describe, it } from "vitest";
import { expectResolveAuthUnauthorized, setupRouteAuthMocks } from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("/api/deals/[id]/uploads/[uploadId] route auth", () => {
  const context = { params: Promise.resolve({ id: "deal-1", uploadId: "upload-1" }) };

  it("returns 401 on GET when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/deals/deal-1/uploads/upload-1",
      context,
    });
  });

  it("returns 401 on DELETE when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "DELETE",
      url: "http://localhost/api/deals/deal-1/uploads/upload-1",
      context,
    });
  });
});

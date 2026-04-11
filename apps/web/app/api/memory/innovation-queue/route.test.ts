import { describe, it } from "vitest";
import {
  expectAuthorizeApiRouteUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("/api/memory/innovation-queue route auth", () => {
  it("returns 401 on GET when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/memory/innovation-queue",
    });
  });

  it("returns 401 on POST when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/memory/innovation-queue",
      body: { innovationId: "innovation-1", decision: "accept" },
    });
  });
});

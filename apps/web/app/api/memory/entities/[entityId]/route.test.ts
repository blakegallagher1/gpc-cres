import { describe, it } from "vitest";
import {
  expectAuthorizeApiRouteUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("GET /api/memory/entities/[entityId]", () => {
  it("returns 401 when unauthorized", async () => {
    await expectAuthorizeApiRouteUnauthorized({
      loadRoute: () => import("./route"),
      method: "GET",
      url: "http://localhost/api/memory/entities/entity-1",
      context: { params: Promise.resolve({ entityId: "entity-1" }) },
    });
  });
});

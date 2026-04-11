import { describe, it } from "vitest";
import {
  expectResolveAuthUnauthorized,
  setupRouteAuthMocks,
} from "@/test-utils/coLocatedRouteTestHelpers";

setupRouteAuthMocks();

describe("POST /api/agent", () => {
  it("returns 401 when unauthenticated", async () => {
    await expectResolveAuthUnauthorized({
      loadRoute: () => import("./route"),
      method: "POST",
      url: "http://localhost/api/agent",
      body: { message: "hello" },
    });
  });
});

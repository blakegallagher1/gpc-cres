import { describe, expect, it } from "vitest";

import { loginErrorMessages } from "./LoginForm";

describe("loginErrorMessages", () => {
  it("includes distinct OAuth provisioning and DB outage messages", () => {
    expect(loginErrorMessages.auth_no_org).toContain("No default organization");
    expect(loginErrorMessages.auth_db_unreachable).toContain("database unavailable");
    expect(loginErrorMessages.auth_unavailable).toContain("Auth service unavailable");
  });
});

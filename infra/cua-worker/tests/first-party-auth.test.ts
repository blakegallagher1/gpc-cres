import { describe, expect, it } from "vitest";
import {
  buildFirstPartyAuthProfile,
  isFirstPartyUrl,
  resolveFirstPartyLoginUrl,
} from "../src/first-party-auth.js";

describe("first-party auth profile", () => {
  it("uses the production-site defaults when env vars are absent", () => {
    const profile = buildFirstPartyAuthProfile({});

    expect(profile.allowedHosts).toEqual([
      "gallagherpropco.com",
      "www.gallagherpropco.com",
    ]);
    expect(profile.loginPath).toBe("/login");
    expect(profile.email).toBeNull();
    expect(profile.password).toBeNull();
    expect(profile.bootstrapTimeoutMs).toBe(30_000);
  });

  it("normalizes runtime env vars", () => {
    const profile = buildFirstPartyAuthProfile({
      GPC_PROD_SITE_ALLOWED_HOSTS:
        " gallagherpropco.com , www.gallagherpropco.com ",
      GPC_PROD_SITE_BOOTSTRAP_TIMEOUT_MS: "45000",
      GPC_PROD_SITE_EMAIL: "  blake@gallagherpropco.com ",
      GPC_PROD_SITE_LOGIN_PATH: "login",
      GPC_PROD_SITE_PASSWORD: "top-secret",
    });

    expect(profile.allowedHosts).toEqual([
      "gallagherpropco.com",
      "www.gallagherpropco.com",
    ]);
    expect(profile.bootstrapTimeoutMs).toBe(45_000);
    expect(profile.email).toBe("blake@gallagherpropco.com");
    expect(profile.loginPath).toBe("/login");
    expect(profile.password).toBe("top-secret");
  });
});

describe("first-party url matching", () => {
  const profile = buildFirstPartyAuthProfile({});

  it("matches only allowlisted production hosts", () => {
    expect(
      isFirstPartyUrl("https://gallagherpropco.com/map", profile),
    ).toBe(true);
    expect(
      isFirstPartyUrl("https://www.gallagherpropco.com/login", profile),
    ).toBe(true);
    expect(
      isFirstPartyUrl("https://cua.gallagherpropco.com/health", profile),
    ).toBe(false);
    expect(isFirstPartyUrl("https://example.com", profile)).toBe(false);
  });

  it("resolves the login url on the target origin", () => {
    expect(
      resolveFirstPartyLoginUrl(
        "https://gallagherpropco.com/chat",
        profile,
      ),
    ).toBe("https://gallagherpropco.com/login");
    expect(
      resolveFirstPartyLoginUrl(
        "https://www.gallagherpropco.com/map?tab=1",
        profile,
      ),
    ).toBe("https://www.gallagherpropco.com/login");
  });
});

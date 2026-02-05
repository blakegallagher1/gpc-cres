import {
  DEFAULT_ALLOWED_EMAILS,
  getAllowedLoginEmails,
  isEmailAllowed,
} from "@/lib/auth/allowedEmails";

describe("allowedEmails", () => {
  const originalAllowed = process.env.ALLOWED_LOGIN_EMAILS;
  const originalPublic = process.env.NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS;

  afterEach(() => {
    if (originalAllowed === undefined) {
      delete process.env.ALLOWED_LOGIN_EMAILS;
    } else {
      process.env.ALLOWED_LOGIN_EMAILS = originalAllowed;
    }

    if (originalPublic === undefined) {
      delete process.env.NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS;
    } else {
      process.env.NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS = originalPublic;
    }
  });

  it("defaults to the baked allowlist", () => {
    delete process.env.ALLOWED_LOGIN_EMAILS;
    delete process.env.NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS;

    expect(isEmailAllowed(DEFAULT_ALLOWED_EMAILS[0])).toBe(true);
    expect(isEmailAllowed("someone@example.com")).toBe(false);
  });

  it("reads allowlist from ALLOWED_LOGIN_EMAILS", () => {
    process.env.ALLOWED_LOGIN_EMAILS = "user@example.com,Blake@GallagherPropCo.com";
    delete process.env.NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS;

    const allowed = getAllowedLoginEmails();
    expect(allowed.has("user@example.com")).toBe(true);
    expect(allowed.has("blake@gallagherpropco.com")).toBe(true);
    expect(isEmailAllowed("other@example.com")).toBe(false);
  });

  it("falls back to NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS", () => {
    delete process.env.ALLOWED_LOGIN_EMAILS;
    process.env.NEXT_PUBLIC_ALLOWED_LOGIN_EMAILS = "team@gallagherpropco.com";

    expect(isEmailAllowed("team@gallagherpropco.com")).toBe(true);
    expect(isEmailAllowed("blake@gallagherpropco.com")).toBe(false);
  });
});

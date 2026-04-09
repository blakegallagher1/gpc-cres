import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  userFindFirstMock,
  userCreateMock,
  orgFindFirstMock,
  orgMembershipCreateMock,
  loggerWarnMock,
  loggerInfoMock,
  loggerErrorMock,
  nextAuthMock,
} = vi.hoisted(() => ({
  userFindFirstMock: vi.fn(),
  userCreateMock: vi.fn(),
  orgFindFirstMock: vi.fn(),
  orgMembershipCreateMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  nextAuthMock: vi.fn(() => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock("next-auth", () => ({
  default: nextAuthMock,
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config: unknown) => config),
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn((config: unknown) => config),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    user: {
      findFirst: userFindFirstMock,
      create: userCreateMock,
    },
    org: {
      findFirst: orgFindFirstMock,
    },
    orgMembership: {
      create: orgMembershipCreateMock,
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/allowedEmails", () => ({
  isEmailAllowed: vi.fn(() => true),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: loggerWarnMock,
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
  serializeErrorForLogs: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
}));

describe("ensureOAuthUserProvisioned", () => {
  beforeEach(() => {
    vi.resetModules();
    userFindFirstMock.mockReset();
    userCreateMock.mockReset();
    orgFindFirstMock.mockReset();
    orgMembershipCreateMock.mockReset();
    loggerWarnMock.mockReset();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    nextAuthMock.mockClear();
  });

  it("returns auth_no_org when no default org exists for OAuth auto-provisioning", async () => {
    userFindFirstMock.mockResolvedValue(null);
    orgFindFirstMock.mockResolvedValue(null);

    const { ensureOAuthUserProvisioned } = await import("./auth");
    const result = await ensureOAuthUserProvisioned("operator@gpc.test", vi.fn());

    expect(result).toBe("/login?error=auth_no_org");
    expect(userCreateMock).not.toHaveBeenCalled();
    expect(orgMembershipCreateMock).not.toHaveBeenCalled();
  });

  it("returns auth_db_unreachable after retry exhaustion", async () => {
    userFindFirstMock.mockRejectedValue(new Error("db unavailable"));
    const sleepMock = vi.fn(async () => {});

    const { ensureOAuthUserProvisioned } = await import("./auth");
    const result = await ensureOAuthUserProvisioned("operator@gpc.test", sleepMock);

    expect(result).toBe("/login?error=auth_db_unreachable");
    expect(userFindFirstMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(500);
  });

  it("creates the user and membership when the default org exists", async () => {
    userFindFirstMock.mockResolvedValue(null);
    orgFindFirstMock.mockResolvedValue({ id: "org-1" });
    userCreateMock.mockResolvedValue({ id: "user-1" });
    orgMembershipCreateMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const { ensureOAuthUserProvisioned } = await import("./auth");
    const result = await ensureOAuthUserProvisioned("operator@gpc.test", vi.fn());

    expect(result).toBe(true);
    expect(userCreateMock).toHaveBeenCalledTimes(1);
    expect(orgMembershipCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        role: "member",
      }),
    });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "Auth OAuth user auto-provisioned",
      expect.objectContaining({ email: "operator@gpc.test", orgId: "org-1" }),
    );
  });
});

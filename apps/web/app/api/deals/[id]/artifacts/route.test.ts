import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindFirstMock,
  artifactFindManyMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  artifactFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findFirst: dealFindFirstMock,
    },
    artifact: {
      findMany: artifactFindManyMock,
    },
  },
}));

vi.mock("@entitlement-os/artifacts", () => ({
  renderArtifactFromSpec: vi.fn(),
}));

vi.mock("@entitlement-os/shared", () => ({
  buildArtifactObjectKey: vi.fn(),
  DEAL_STATUSES: ["INTAKE", "TRIAGE_DONE", "PREAPP", "SUBMITTED", "APPROVED", "EXIT_MARKETED"],
  ARTIFACT_TYPES: [
    "TRIAGE_PDF",
    "SUBMISSION_CHECKLIST_PDF",
    "HEARING_DECK_PPTX",
    "EXIT_PACKAGE_PDF",
    "BUYER_TEASER_PDF",
    "INVESTMENT_MEMO_PDF",
    "OFFERING_MEMO_PDF",
    "COMP_ANALYSIS_PDF",
    "IC_DECK_PPTX",
  ],
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  uploadArtifactToGateway: vi.fn(),
}));

async function loadRoute() {
  return import("./route");
}

describe("GET /api/deals/[id]/artifacts", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    dealFindFirstMock.mockReset();
    artifactFindManyMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const res = await GET(new Request("http://localhost/api/deals/deal-1/artifacts") as never, {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(dealFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the scoped deal does not exist", async () => {
    dealFindFirstMock.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const res = await GET(new Request("http://localhost/api/deals/deal-1/artifacts") as never, {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Deal not found" });
    expect(artifactFindManyMock).not.toHaveBeenCalled();
  });

  it("lists artifacts for the scoped deal", async () => {
    dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    artifactFindManyMock.mockResolvedValue([
      { id: "artifact-1", artifactType: "TRIAGE_PDF" },
      { id: "artifact-2", artifactType: "BUYER_TEASER_PDF" },
    ]);
    const { GET } = await loadRoute();

    const res = await GET(new Request("http://localhost/api/deals/deal-1/artifacts") as never, {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(dealFindFirstMock).toHaveBeenCalledWith({
      where: { id: "deal-1", orgId: "org-1" },
      select: { id: true },
    });
    expect(artifactFindManyMock).toHaveBeenCalledWith({
      where: { dealId: "deal-1", orgId: "org-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(body).toEqual({
      artifacts: [
        { id: "artifact-1", artifactType: "TRIAGE_PDF" },
        { id: "artifact-2", artifactType: "BUYER_TEASER_PDF" },
      ],
    });
  });
});

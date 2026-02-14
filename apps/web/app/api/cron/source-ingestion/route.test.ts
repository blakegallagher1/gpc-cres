import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  jurisdictionSeedSourceFindManyMock,
  jurisdictionSeedSourceCreateMock,
  parishPackVersionFindManyMock,
  evidenceSnapshotFindFirstMock,
  runCreateMock,
  runUpdateMock,
  orgMembershipFindManyMock,
  captureEvidenceMock,
  withTimeoutMock,
  createNotificationMock,
} = vi.hoisted(() => ({
  jurisdictionSeedSourceFindManyMock: vi.fn(),
  jurisdictionSeedSourceCreateMock: vi.fn(),
  parishPackVersionFindManyMock: vi.fn(),
  evidenceSnapshotFindFirstMock: vi.fn(),
  runCreateMock: vi.fn(),
  runUpdateMock: vi.fn(),
  orgMembershipFindManyMock: vi.fn(),
  captureEvidenceMock: vi.fn(),
  withTimeoutMock: vi.fn(),
  createNotificationMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdictionSeedSource: {
      findMany: jurisdictionSeedSourceFindManyMock,
      create: jurisdictionSeedSourceCreateMock,
    },
    parishPackVersion: {
      findMany: parishPackVersionFindManyMock,
    },
    evidenceSnapshot: {
      findFirst: evidenceSnapshotFindFirstMock,
    },
    run: {
      create: runCreateMock,
      update: runUpdateMock,
    },
    orgMembership: {
      findMany: orgMembershipFindManyMock,
    },
  },
}));

vi.mock("@entitlement-os/evidence", () => ({
  captureEvidence: captureEvidenceMock,
  withTimeout: withTimeoutMock,
}));

vi.mock("@/lib/db/supabaseAdmin", () => ({
  supabaseAdmin: {},
}));

vi.mock("@/lib/services/notification.service", () => ({
  getNotificationService: () => ({
    create: createNotificationMock,
  }),
}));

import { GET } from "./route";

describe("GET /api/cron/source-ingestion", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";

    jurisdictionSeedSourceFindManyMock.mockReset();
    jurisdictionSeedSourceCreateMock.mockReset();
    parishPackVersionFindManyMock.mockReset();
    evidenceSnapshotFindFirstMock.mockReset();
    runCreateMock.mockReset();
    runUpdateMock.mockReset();
    orgMembershipFindManyMock.mockReset();
    captureEvidenceMock.mockReset();
    withTimeoutMock.mockReset();
    createNotificationMock.mockReset();
  });

  it("returns 401 when cron secret is invalid", async () => {
    const req = new NextRequest("http://localhost/api/cron/source-ingestion", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns prioritized stale offender summaries and manifest-backed notification metadata", async () => {
    jurisdictionSeedSourceFindManyMock.mockImplementation((args) =>
      args?.include
        ? [
            {
              jurisdictionId: "jurisdiction-1",
              url: "https://official.example.gov/zoning",
              jurisdiction: {
                id: "jurisdiction-1",
                name: "Sample Parish",
                orgId: "org-1",
                officialDomains: ["official.example.gov"],
              },
              purpose: "seed",
            },
            {
              jurisdictionId: "jurisdiction-1",
              url: "https://external.example.net/zoning",
              jurisdiction: {
                id: "jurisdiction-1",
                name: "Sample Parish",
                orgId: "org-1",
                officialDomains: ["official.example.gov"],
              },
              purpose: "seed",
            },
          ]
        : [
            {
              jurisdictionId: "jurisdiction-1",
              url: "https://official.example.gov/zoning",
            },
            {
              jurisdictionId: "jurisdiction-1",
              url: "https://external.example.net/zoning",
            },
          ]
    );
    parishPackVersionFindManyMock.mockResolvedValue([]);

    evidenceSnapshotFindFirstMock.mockResolvedValue({
      retrievedAt: new Date("2026-01-10T12:00:00.000Z"),
    });

    captureEvidenceMock.mockImplementation(async () => {
      throw new Error("503 upstream error");
    });
    withTimeoutMock.mockImplementation(async (promise: Promise<unknown>) => promise);

    runCreateMock.mockResolvedValue({ id: "run-source-ingest-1" });
    runUpdateMock.mockResolvedValue({});
    orgMembershipFindManyMock.mockResolvedValue([
      { userId: "user-1" },
    ]);

    const req = new NextRequest("http://localhost/api/cron/source-ingestion", {
      headers: { authorization: "Bearer cron-secret" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.stats.orgsProcessed).toBe(1);
    expect(body.stats.staleSources).toBe(2);
    expect(body.stats.discoveryCount).toBe(0);
    expect(body.stats.staleRatios).toHaveLength(1);

    const orgSummary = body.stats.staleRatios[0];
    expect(orgSummary).toMatchObject({
      orgId: "org-1",
      staleRatio: 1,
      staleOffenderCount: 2,
    });
    expect(orgSummary.staleOffenders).toHaveLength(2);
    expect(orgSummary.staleOffenders[0].url).toBe(
      "https://official.example.gov/zoning",
    );
    expect(orgSummary.staleOffenders[0].isOfficial).toBe(true);
    expect(orgSummary.staleOffenders[1].isOfficial).toBe(false);
    expect(orgSummary.sourceManifestHash).toBeTruthy();

    const notificationArgs = createNotificationMock.mock.calls[0][0];
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(notificationArgs.metadata).toMatchObject({
      staleOffenderCount: 2,
      staleOffenderSamples: orgSummary.staleOffenders,
      sourceManifestHash: orgSummary.sourceManifestHash,
    });

    const updateArgs = runUpdateMock.mock.calls[0][0];
    expect(updateArgs.data.outputJson.staleSourceOffenders).toHaveLength(2);
    expect(updateArgs.data.outputJson.sourceManifest).toHaveLength(2);
  });
});

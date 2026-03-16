import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, jurisdictionFindManyMock, parishPackVersionFindManyMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  jurisdictionFindManyMock: vi.fn(),
  parishPackVersionFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdiction: {
      findMany: jurisdictionFindManyMock,
    },
    parishPackVersion: {
      findMany: parishPackVersionFindManyMock,
    },
  },
}));

import { GET } from "./route";

describe("/api/jurisdictions route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    jurisdictionFindManyMock.mockReset();
    parishPackVersionFindManyMock.mockReset();
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/jurisdictions"),
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(jurisdictionFindManyMock).not.toHaveBeenCalled();
    expect(parishPackVersionFindManyMock).not.toHaveBeenCalled();
  });

  it("serializes valid lineage data into a plain JSON latestPack shape", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });

    const generatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    jurisdictionFindManyMock.mockResolvedValue([
      {
        id: "jur-1",
        name: "East Baton Rouge Parish",
        kind: "county",
        state: "LA",
        timezone: "America/Chicago",
        officialDomains: ["brla.gov"],
        seedSources: [
          { id: "seed-1", active: true },
          { id: "seed-2", active: false },
        ],
        _count: { deals: 4 },
      },
    ]);
    parishPackVersionFindManyMock.mockResolvedValue([
      {
        id: "pack-1",
        jurisdictionId: "jur-1",
        generatedAt,
        version: 7,
        sourceUrls: ["https://brla.gov/ordinances/pack-7"],
        sourceEvidenceIds: ["ev-1"],
        sourceSnapshotIds: ["snap-1"],
        sourceContentHashes: ["hash-1"],
        officialOnly: true,
        packCoverageScore: 0.92,
        canonicalSchemaVersion: "parish-pack-v1",
      },
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/jurisdictions"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      jurisdictions: [
        {
          id: "jur-1",
          name: "East Baton Rouge Parish",
          kind: "county",
          state: "LA",
          timezone: "America/Chicago",
          officialDomains: ["brla.gov"],
          seedSourceCount: 1,
          dealCount: 4,
          latestPack: {
            id: "pack-1",
            version: 7,
            generatedAt: generatedAt.toISOString(),
            sourceUrls: ["https://brla.gov/ordinances/pack-7"],
            sourceEvidenceIds: ["ev-1"],
            sourceSnapshotIds: ["snap-1"],
            sourceContentHashes: ["hash-1"],
            officialOnly: true,
            packCoverageScore: 0.92,
            canonicalSchemaVersion: "parish-pack-v1",
          },
          packContext: {
            hasPack: true,
            isStale: false,
            stalenessDays: 2,
            missingEvidence: [],
          },
        },
      ],
    });
  });

  it("normalizes malformed and missing lineage data without taking down the whole list", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const generatedAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    jurisdictionFindManyMock.mockResolvedValue([
      {
        id: "jur-good",
        name: "Good Parish",
        kind: "county",
        state: "LA",
        timezone: "America/Chicago",
        officialDomains: ["good.example.gov"],
        seedSources: [{ id: "seed-good", active: true }],
        _count: { deals: 1 },
      },
      {
        id: "jur-bad",
        name: "Broken Parish",
        kind: "county",
        state: "LA",
        timezone: "America/Chicago",
        officialDomains: ["broken.example.gov"],
        seedSources: [{ id: "seed-bad", active: true }],
        _count: { deals: 3 },
      },
    ]);
    parishPackVersionFindManyMock.mockResolvedValue([
      {
        id: "pack-bad",
        jurisdictionId: "jur-bad",
        generatedAt,
        version: 4,
        sourceUrls: [" https://broken.example.gov/pack ", 42],
        sourceEvidenceIds: "ev-2",
        sourceSnapshotIds: null,
        sourceContentHashes: [{}],
        officialOnly: false,
        packCoverageScore: 0.5,
        canonicalSchemaVersion: null,
      },
    ]);

    const res = await GET(
      new NextRequest("http://localhost/api/jurisdictions"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.jurisdictions).toHaveLength(2);
    expect(body.jurisdictions[0]).toMatchObject({
      id: "jur-good",
      latestPack: null,
      packContext: {
        hasPack: false,
        missingEvidence: ["No current parish pack found for this jurisdiction."],
      },
    });
    expect(body.jurisdictions[1]).toMatchObject({
      id: "jur-bad",
      latestPack: {
        id: "pack-bad",
        version: 4,
        generatedAt: generatedAt.toISOString(),
        sourceUrls: ["https://broken.example.gov/pack"],
        sourceEvidenceIds: [],
        sourceSnapshotIds: [],
        sourceContentHashes: [],
        officialOnly: false,
        packCoverageScore: 0.5,
        canonicalSchemaVersion: null,
      },
      packContext: {
        hasPack: true,
        isStale: true,
        stalenessDays: 9,
        missingEvidence: [
          "Pack lineage is missing sourceEvidenceIds.",
          "Pack lineage is missing sourceSnapshotIds.",
          "Pack lineage is missing sourceContentHashes.",
          "Pack is stale and should be refreshed.",
          "Pack coverage score is below recommended threshold.",
        ],
      },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[jurisdictions] malformed pack lineage field",
      expect.objectContaining({
        jurisdictionId: "jur-bad",
        jurisdictionName: "Broken Parish",
        packId: "pack-bad",
        packVersion: 4,
        fieldName: "sourceEvidenceIds",
      }),
    );
  });

  it("returns degraded pack context when current-pack lookup fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    resolveAuthMock.mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
    });
    jurisdictionFindManyMock.mockResolvedValue([
      {
        id: "jur-1",
        name: "East Baton Rouge Parish",
        kind: "county",
        state: "LA",
        timezone: "America/Chicago",
        officialDomains: ["brla.gov"],
        seedSources: [{ id: "seed-1", active: true }],
        _count: { deals: 2 },
      },
    ]);
    parishPackVersionFindManyMock.mockRejectedValue(
      new Error("current pack include failed"),
    );

    const res = await GET(
      new NextRequest("http://localhost/api/jurisdictions"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      jurisdictions: [
        {
          id: "jur-1",
          name: "East Baton Rouge Parish",
          kind: "county",
          state: "LA",
          timezone: "America/Chicago",
          officialDomains: ["brla.gov"],
          seedSourceCount: 1,
          dealCount: 2,
          latestPack: null,
          packContext: {
            hasPack: false,
            isStale: false,
            stalenessDays: null,
            missingEvidence: [
              "Current parish pack data is temporarily unavailable.",
            ],
          },
        },
      ],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[jurisdictions] failed to load current parish packs",
      expect.objectContaining({
        orgId: "org-1",
        jurisdictionCount: 1,
        error: "current pack include failed",
      }),
    );
  });
});

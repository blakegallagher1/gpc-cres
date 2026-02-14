import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, evidenceSourceFindManyMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  evidenceSourceFindManyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    evidenceSource: {
      findMany: evidenceSourceFindManyMock,
    },
  },
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";

describe("GET /api/evidence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T12:00:00.000Z"));
    resolveAuthMock.mockReset();
    evidenceSourceFindManyMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/evidence");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(evidenceSourceFindManyMock).not.toHaveBeenCalled();
  });

  it("returns evidence sources with latest snapshot and freshness signals", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    evidenceSourceFindManyMock.mockResolvedValue([
      {
        id: SOURCE_ID,
        url: "https://example.com/zoning",
        domain: "example.com",
        title: "Example Zoning",
        isOfficial: true,
        firstSeenAt: new Date("2026-02-14T10:00:00.000Z"),
        _count: { evidenceSnapshots: 2 },
        evidenceSnapshots: [
          {
            id: "snapshot-1",
            retrievedAt: new Date("2026-02-14T11:00:00.000Z"),
            contentHash: "hash-1",
            runId: "run-1",
            httpStatus: 200,
            contentType: "text/html",
          },
        ],
      },
    ]);

    const req = new NextRequest("http://localhost/api/evidence");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).toMatchObject({
      id: SOURCE_ID,
      url: "https://example.com/zoning",
      domain: "example.com",
      isOfficial: true,
      snapshotCount: 2,
      freshness: {
        freshnessState: "fresh",
        freshnessScore: 100,
        driftSignal: "insufficient",
        alertLevel: "none",
        alertReasons: [],
      },
      latestSnapshot: {
        id: "snapshot-1",
        contentHash: "hash-1",
        runId: "run-1",
        httpStatus: 200,
        contentType: "text/html",
      },
    });
  });

  it("returns snapshots with drift detection when includeSnapshots is enabled", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    evidenceSourceFindManyMock.mockResolvedValue([
      {
        id: SOURCE_ID,
        url: "https://example.com/zoning",
        domain: "example.com",
        title: null,
        isOfficial: false,
        firstSeenAt: new Date("2026-02-14T10:00:00.000Z"),
        _count: { evidenceSnapshots: 2 },
        evidenceSnapshots: [
          {
            id: "snapshot-2",
            retrievedAt: new Date("2026-02-14T11:55:00.000Z"),
            contentHash: "hash-2",
            runId: "run-2",
            httpStatus: 200,
            contentType: "application/pdf",
          },
          {
            id: "snapshot-3",
            retrievedAt: new Date("2026-02-14T11:50:00.000Z"),
            contentHash: "hash-3",
            runId: "run-3",
            httpStatus: 200,
            contentType: "text/plain",
          },
        ],
      },
    ]);

    const req = new NextRequest(
      `http://localhost/api/evidence?sourceId=${SOURCE_ID}&includeSnapshots=true&snapshotLimit=50`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].snapshots).toHaveLength(2);
    expect(body.sources[0].snapshots[0]).toMatchObject({
      id: "snapshot-2",
      contentHash: "hash-2",
      runId: "run-2",
      httpStatus: 200,
      contentType: "application/pdf",
    });
    expect(body.sources[0].freshness).toMatchObject({
      freshnessState: "fresh",
      freshnessScore: 100,
      driftSignal: "changed",
      alertLevel: "warning",
    });
    expect(body.sources[0].freshness.alertReasons).toContain(
      "Content hash drift detected from previous snapshot.",
    );
  });

  it("returns critical drift/staleness alerts for old or failed captures", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    evidenceSourceFindManyMock.mockResolvedValue([
      {
        id: SOURCE_ID,
        url: "https://example.com/aged",
        domain: "example.com",
        title: "Aged source",
        isOfficial: true,
        firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
        _count: { evidenceSnapshots: 2 },
        evidenceSnapshots: [
          {
            id: "snapshot-old",
            retrievedAt: new Date("2026-01-10T12:00:00.000Z"),
            contentHash: "old-hash-1",
            runId: "run-old",
            httpStatus: 404,
            contentType: "text/html",
          },
          {
            id: "snapshot-older",
            retrievedAt: new Date("2026-01-09T12:00:00.000Z"),
            contentHash: "old-hash-2",
            runId: "run-older",
            httpStatus: 200,
            contentType: "text/html",
          },
        ],
      },
    ]);

    const req = new NextRequest(
      `http://localhost/api/evidence?sourceId=${SOURCE_ID}&includeSnapshots=true&snapshotLimit=2`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sources[0].freshness.freshnessState).toBe("critical");
    expect(body.sources[0].freshness.alertLevel).toBe("critical");
    expect(body.sources[0].freshness.alertReasons).toEqual(
      expect.arrayContaining([
        "Latest capture returned a non-successful status.",
        "Evidence source has become critically stale.",
      ]),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findFirstMock,
  findManyMock,
  createManyMock,
  opportunityFindManyMock,
  opportunityCountMock,
  opportunityFindFirstMock,
  opportunityUpdateMock,
  updateMock,
} = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  findManyMock: vi.fn(),
  createManyMock: vi.fn(),
  opportunityFindManyMock: vi.fn(),
  opportunityCountMock: vi.fn(),
  opportunityFindFirstMock: vi.fn(),
  opportunityUpdateMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    savedSearch: {
      findFirst: findFirstMock,
      findMany: findManyMock,
      update: updateMock,
    },
    opportunityMatch: {
      createMany: createManyMock,
      findFirst: opportunityFindFirstMock,
      findMany: opportunityFindManyMock,
      count: opportunityCountMock,
      update: opportunityUpdateMock,
    },
  },
}));

import { SavedSearchService } from "@/lib/services/saved-search.service";

describe("SavedSearchService property DB gateway contracts", () => {
  const fetchMock = vi.fn();
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env = {
      ...envSnapshot,
      LOCAL_API_URL: "http://gateway.test",
      LOCAL_API_KEY: "gateway-key",
      CF_ACCESS_CLIENT_ID: "client-id.access",
      CF_ACCESS_CLIENT_SECRET: "client-secret",
    };
  });

  it("uses /api/parcels/search for saved search query execution", async () => {
    findFirstMock.mockResolvedValue({
      id: "search-1",
      criteria: {
        parishes: ["East Baton Rouge"],
        searchText: "Main",
      },
      matches: [],
    });
    createManyMock.mockResolvedValue({ count: 1 });
    updateMock.mockResolvedValue({ id: "search-1" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "parcel-1",
            parish_name: "East Baton Rouge",
            parcel_uid: "UID-1",
            owner_name: "Owner",
            situs_address: "123 Main St",
            acreage: 1.2,
            lat: 30.45,
            lng: -91.19,
          },
        ],
      }),
    } as Response);

    const service = new SavedSearchService();
    const result = await service.runSearch("search-1", "org-1", "user-1");

    expect(result).toEqual({ newMatches: 1, totalMatches: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/parcels/search?");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("q=Main");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("parish=East+Baton+Rouge");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        Authorization: "Bearer gateway-key",
        "CF-Access-Client-Id": "client-id.access",
        "CF-Access-Client-Secret": "client-secret",
      }),
    });
  });

  it("filters opportunities to the requested saved search", async () => {
    findManyMock.mockResolvedValue([{ id: "search-2" }]);
    opportunityFindManyMock
      .mockResolvedValueOnce([
        {
          id: "match-1",
          savedSearchId: "search-2",
          parcelId: "parcel-1",
          matchScore: { toString: () => "82.5" },
          matchedCriteria: { parish: true, acreageInRange: true },
          parcelData: {
            parish: "East Baton Rouge",
            parcelUid: "UID-1",
            ownerName: "Owner",
            address: "123 Main St",
            acreage: 2.2,
            lat: 30.45,
            lng: -91.19,
          },
          seenAt: null,
          pursuedAt: null,
          dismissedAt: null,
          createdAt: new Date("2026-03-16T00:00:00.000Z"),
          savedSearch: { id: "search-2", name: "Industrial Baton Rouge" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "hist-1",
          savedSearchId: "search-2",
          parcelId: "parcel-9",
          matchScore: { toString: () => "70" },
          matchedCriteria: { parish: true },
          parcelData: {
            parish: "East Baton Rouge",
            parcelUid: "UID-9",
            ownerName: "Owner",
            address: "99 Main St",
            acreage: 2.4,
            lat: 30.45,
            lng: -91.19,
          },
          seenAt: new Date("2026-03-14T00:00:00.000Z"),
          pursuedAt: new Date("2026-03-15T00:00:00.000Z"),
          dismissedAt: null,
          createdAt: new Date("2026-03-14T00:00:00.000Z"),
          savedSearch: { id: "search-2", name: "Industrial Baton Rouge" },
        },
      ]);
    opportunityCountMock.mockResolvedValue(1);

    const service = new SavedSearchService();
    const result = await service.getOpportunities("org-1", "user-1", 25, 0, "search-2");

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        userId: "user-1",
        id: "search-2",
      },
      select: { id: true },
    });
    expect(opportunityFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          savedSearchId: { in: ["search-2"] },
          dismissedAt: null,
        },
        take: 1,
      })
    );
    expect(opportunityCountMock).toHaveBeenCalledWith({
      where: {
        savedSearchId: { in: ["search-2"] },
        dismissedAt: null,
      },
    });
    expect(result.total).toBe(1);
    expect(result.opportunities[0]).toMatchObject({
      id: "match-1",
      parcelId: "parcel-1",
      priorityScore: expect.any(Number),
      feedbackSignal: "new",
      savedSearch: { id: "search-2", name: "Industrial Baton Rouge" },
    });
    expect(result.opportunities[0]?.thesis.summary).toContain("123 Main St");
    expect(result.opportunities[0]?.thesis.signals).toContain(
      "Operator history is positive in East Baton Rouge"
    );
  });

  it("persists pursue feedback for a scoped opportunity match", async () => {
    opportunityFindFirstMock.mockResolvedValue({
      id: "match-1",
      seenAt: null,
    });
    opportunityUpdateMock.mockResolvedValue({
      id: "match-1",
      pursuedAt: new Date("2026-03-16T00:00:00.000Z"),
    });

    const service = new SavedSearchService();
    await service.markPursued("match-1", "org-1", "user-1");

    expect(opportunityFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: "match-1",
        savedSearch: { orgId: "org-1", userId: "user-1" },
      },
    });
    expect(opportunityUpdateMock).toHaveBeenCalledWith({
      where: { id: "match-1" },
      data: expect.objectContaining({
        pursuedAt: expect.any(Date),
        seenAt: expect.any(Date),
      }),
    });
  });
});

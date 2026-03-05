import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findFirstMock,
  createManyMock,
  updateMock,
} = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  createManyMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    savedSearch: {
      findFirst: findFirstMock,
      update: updateMock,
    },
    opportunityMatch: {
      createMany: createManyMock,
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
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });
});

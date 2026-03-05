import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  savedSearchFindManyMock,
  savedSearchUpdateMock,
  createManyMock,
  createNotificationMock,
} = vi.hoisted(() => ({
  savedSearchFindManyMock: vi.fn(),
  savedSearchUpdateMock: vi.fn(),
  createManyMock: vi.fn(),
  createNotificationMock: vi.fn(),
}));

vi.mock("@/lib/services/notification.service", () => ({
  getNotificationService: () => ({
    create: createNotificationMock,
  }),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    savedSearch: {
      findMany: savedSearchFindManyMock,
      update: savedSearchUpdateMock,
    },
    opportunityMatch: {
      createMany: createManyMock,
    },
  },
}));

import { OpportunityScannerJob } from "@/lib/jobs/opportunity-scanner.job";

describe("OpportunityScannerJob property DB gateway contracts", () => {
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

  it("uses /api/parcels/search during scan execution", async () => {
    savedSearchFindManyMock.mockResolvedValue([
      {
        id: "search-1",
        orgId: "org-1",
        userId: "user-1",
        name: "Main Corridor",
        criteria: { parishes: ["East Baton Rouge"], searchText: "Main" },
        matches: [],
        user: { id: "user-1" },
      },
    ]);
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
            acreage: 2.0,
            lat: 30.45,
            lng: -91.19,
          },
        ],
      }),
    } as Response);
    createManyMock.mockResolvedValue({ count: 1 });
    savedSearchUpdateMock.mockResolvedValue({ id: "search-1" });
    createNotificationMock.mockResolvedValue({ id: "notif-1" });

    const job = new OpportunityScannerJob();
    const result = await job.execute();

    expect(result.success).toBe(true);
    expect(result.processed).toBe(1);
    expect(result.newMatches).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/parcels/search?");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("q=Main");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("parish=East+Baton+Rouge");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });
});

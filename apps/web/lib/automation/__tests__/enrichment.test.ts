const { openaiMock, dbMock } = vi.hoisted(() => ({
  openaiMock: {
    propertyDbRpc: vi.fn(),
  },
  dbMock: {
    prisma: {
      parcel: { findFirst: vi.fn(), update: vi.fn() },
      task: { create: vi.fn() },
    },
  },
}));

// Mock external deps before any imports
vi.mock("@entitlement-os/openai", () => openaiMock);
vi.mock("@entitlement-os/db", () => dbMock);

import {
  normalizeAddress,
  scoreMatchConfidence,
  handleParcelCreated,
} from "../enrichment";

describe("enrichment", () => {
  describe("normalizeAddress", () => {
    it("should strip apostrophes", () => {
      expect(normalizeAddress("O'Neal Lane")).toBe("ONeal Lane");
    });

    it("should strip commas and periods", () => {
      expect(normalizeAddress("123 Main St., Baton Rouge, LA")).toBe(
        "123 Main St Baton Rouge LA"
      );
    });

    it("should strip hash symbols", () => {
      expect(normalizeAddress("456 Oak Ave #200")).toBe("456 Oak Ave 200");
    });

    it("should collapse whitespace", () => {
      expect(normalizeAddress("789  Elm   Blvd")).toBe("789 Elm Blvd");
    });

    it("should trim leading/trailing whitespace", () => {
      expect(normalizeAddress("  123 Main St  ")).toBe("123 Main St");
    });

    it("should handle empty strings", () => {
      expect(normalizeAddress("")).toBe("");
    });

    it("should handle multiple punctuation types", () => {
      expect(normalizeAddress("O'Neal's, #123. Main")).toBe(
        "ONeals 123 Main"
      );
    });
  });

  describe("scoreMatchConfidence", () => {
    it("should return 1.0 for exact matches", () => {
      expect(scoreMatchConfidence("123 Main St", "123 Main St")).toBe(1.0);
    });

    it("should return 1.0 for matches differing only in punctuation", () => {
      expect(scoreMatchConfidence("123 Main St.", "123 Main St")).toBe(1.0);
    });

    it("should be case-insensitive", () => {
      expect(scoreMatchConfidence("123 MAIN ST", "123 Main St")).toBe(1.0);
    });

    it("should return 0.85 when one starts with the other", () => {
      expect(
        scoreMatchConfidence("123 Main St", "123 Main St Baton Rouge LA")
      ).toBe(0.85);
    });

    it("should return 0.85 when match starts with search", () => {
      expect(
        scoreMatchConfidence("123 Main St Baton Rouge LA", "123 Main St")
      ).toBe(0.85);
    });

    it("should return 0.7 for street number + first word match", () => {
      expect(
        scoreMatchConfidence("123 Main Street", "123 Main Boulevard")
      ).toBe(0.7);
    });

    it("should return 0.4 for street number only match", () => {
      expect(scoreMatchConfidence("123 Main St", "123 Oak Ave")).toBe(0.4);
    });

    it("should return 0.2 for completely different addresses", () => {
      expect(scoreMatchConfidence("123 Main St", "456 Oak Ave")).toBe(0.2);
    });

    it("should return 0 for empty search address", () => {
      expect(scoreMatchConfidence("", "123 Main St")).toBe(0);
    });

    it("should return 0 for empty match address", () => {
      expect(scoreMatchConfidence("123 Main St", "")).toBe(0);
    });

    it("should return 0 for both empty", () => {
      expect(scoreMatchConfidence("", "")).toBe(0);
    });
  });

  describe("handleParcelCreated", () => {
    const baseEvent = {
      type: "parcel.created" as const,
      parcelId: "p1",
      dealId: "d1",
      orgId: "org1",
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should pass East Baton Rouge parish from jurisdiction to property DB search", async () => {
      dbMock.prisma.parcel.findFirst.mockResolvedValue({
        id: "p1",
        address: "123 Main St",
        dealId: "d1",
        propertyDbId: null,
        deal: { jurisdiction: { name: "East Baton Rouge" } },
      });
      openaiMock.propertyDbRpc.mockResolvedValue([
        { id: "prop1", site_address: "123 Main St" },
      ]);
      dbMock.prisma.parcel.update.mockResolvedValue({});

      await handleParcelCreated(baseEvent);

      expect(openaiMock.propertyDbRpc).toHaveBeenCalledWith("api_search_parcels", {
        search_text: "123 Main St",
        parish: "East Baton Rouge",
        limit_rows: 10,
      });
    });

    it("should pass Ascension parish from jurisdiction to property DB search", async () => {
      dbMock.prisma.parcel.findFirst.mockResolvedValue({
        id: "p1",
        address: "456 Airline Hwy",
        dealId: "d1",
        propertyDbId: null,
        deal: { jurisdiction: { name: "Ascension" } },
      });
      openaiMock.propertyDbRpc.mockResolvedValue([
        { id: "prop2", site_address: "456 Airline Hwy" },
      ]);
      dbMock.prisma.parcel.update.mockResolvedValue({});

      await handleParcelCreated(baseEvent);

      expect(openaiMock.propertyDbRpc).toHaveBeenCalledWith("api_search_parcels", {
        search_text: "456 Airline Hwy",
        parish: "Ascension",
        limit_rows: 10,
      });
    });

    it("should pass null parish when deal has no jurisdiction", async () => {
      dbMock.prisma.parcel.findFirst.mockResolvedValue({
        id: "p1",
        address: "789 Oak Ave",
        dealId: "d1",
        propertyDbId: null,
        deal: { jurisdiction: null },
      });
      openaiMock.propertyDbRpc.mockResolvedValue([]);
      dbMock.prisma.task.create.mockResolvedValue({});

      await handleParcelCreated(baseEvent);

      expect(openaiMock.propertyDbRpc).toHaveBeenCalledWith("api_search_parcels", {
        search_text: "789 Oak Ave",
        parish: null,
        limit_rows: 10,
      });
    });

    it("should skip if event type is not parcel.created", async () => {
      const event = {
        type: "parcel.enriched" as const,
        parcelId: "p1",
        dealId: "d1",
        orgId: "org1",
      };

      await handleParcelCreated(event);

      expect(dbMock.prisma.parcel.findFirst).not.toHaveBeenCalled();
    });

    it("should skip if parcel has no address", async () => {
      dbMock.prisma.parcel.findFirst.mockResolvedValue({
        id: "p1",
        address: null,
        dealId: "d1",
        propertyDbId: null,
        deal: { jurisdiction: { name: "East Baton Rouge" } },
      });

      await handleParcelCreated(baseEvent);

      expect(openaiMock.propertyDbRpc).not.toHaveBeenCalled();
    });

    it("should skip if parcel is already enriched", async () => {
      dbMock.prisma.parcel.findFirst.mockResolvedValue({
        id: "p1",
        address: "123 Main St",
        dealId: "d1",
        propertyDbId: "existing-id",
        deal: { jurisdiction: { name: "East Baton Rouge" } },
      });

      await handleParcelCreated(baseEvent);

      expect(openaiMock.propertyDbRpc).not.toHaveBeenCalled();
    });

    it("should create manual geocoding task when no matches found", async () => {
      dbMock.prisma.parcel.findFirst.mockResolvedValue({
        id: "p1",
        address: "999 Nowhere Rd",
        dealId: "d1",
        propertyDbId: null,
        deal: { jurisdiction: { name: "East Baton Rouge" } },
      });
      openaiMock.propertyDbRpc.mockResolvedValue([]);
      dbMock.prisma.task.create.mockResolvedValue({});

      await handleParcelCreated(baseEvent);

      expect(dbMock.prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "[AUTO] Manual geocoding needed",
            orgId: "org1",
            dealId: "d1",
          }),
        })
      );
    });
  });
});

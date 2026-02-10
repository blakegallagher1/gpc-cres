// Mock external deps before any imports
jest.mock("@entitlement-os/openai", () => ({
  propertyDbRpc: jest.fn(),
}));
jest.mock("@entitlement-os/db", () => ({
  prisma: {
    parcel: { findFirst: jest.fn(), update: jest.fn() },
  },
}));

import { normalizeAddress, scoreMatchConfidence } from "../enrichment";

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
});

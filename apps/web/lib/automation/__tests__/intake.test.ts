jest.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    parcel: { create: jest.fn() },
    task: { create: jest.fn() },
    jurisdiction: { findFirst: jest.fn() },
    orgMembership: { findFirst: jest.fn() },
  },
}));

const db = jest.requireMock("@entitlement-os/db") as {
  prisma: {
    deal: { count: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    parcel: { create: jest.Mock };
    task: { create: jest.Mock };
    jurisdiction: { findFirst: jest.Mock };
    orgMembership: { findFirst: jest.Mock };
  };
};

import { parseIntakeContent, matchesGpcCriteria, handleIntakeReceived } from "../intake";

// --- Pure function tests ---

describe("parseIntakeContent", () => {
  it("extracts street addresses", () => {
    const result = parseIntakeContent("Property at 1234 Main St in Baton Rouge");
    expect(result.addresses).toContain("1234 Main St");
  });

  it("extracts multiple address formats", () => {
    const result = parseIntakeContent(
      "1234 Main St\n5678 Oak Ave\n999 Industrial Blvd"
    );
    expect(result.addresses).toHaveLength(3);
  });

  it("detects covered parishes", () => {
    const result = parseIntakeContent("Located in East Baton Rouge parish");
    expect(result.parishes).toContain("East Baton Rouge");
  });

  it("detects multiple parishes", () => {
    const result = parseIntakeContent(
      "Properties in East Baton Rouge and Ascension parish"
    );
    expect(result.parishes).toContain("East Baton Rouge");
    expect(result.parishes).toContain("Ascension");
  });

  it("does not detect uncovered parishes", () => {
    const result = parseIntakeContent("Located in Orleans parish");
    expect(result.parishes).toHaveLength(0);
  });

  it("detects outdoor storage SKU signals", () => {
    const result = parseIntakeContent("Looking for outdoor storage yard");
    expect(result.skuSignals).toContain("OUTDOOR_STORAGE");
  });

  it("detects truck parking SKU signals", () => {
    const result = parseIntakeContent("Need truck parking terminal space");
    expect(result.skuSignals).toContain("TRUCK_PARKING");
  });

  it("detects flex space SKU signals", () => {
    const result = parseIntakeContent("Seeking small bay flex space");
    expect(result.skuSignals).toContain("SMALL_BAY_FLEX");
  });

  it("extracts acreage mentions", () => {
    const result = parseIntakeContent("5.2 acres available");
    expect(result.acreageMentions).toContain("5.2 acres");
  });

  it("extracts price mentions", () => {
    const result = parseIntakeContent("Asking $250,000 per acre");
    expect(result.priceMentions.length).toBeGreaterThan(0);
  });

  it("handles empty content", () => {
    const result = parseIntakeContent("");
    expect(result.addresses).toHaveLength(0);
    expect(result.parishes).toHaveLength(0);
    expect(result.skuSignals).toHaveLength(0);
  });

  it("deduplicates SKU signals across multiple lines", () => {
    const result = parseIntakeContent(
      "outdoor storage available\nalso outdoor storage nearby"
    );
    expect(result.skuSignals.filter((s) => s === "OUTDOOR_STORAGE")).toHaveLength(1);
  });
});

describe("matchesGpcCriteria", () => {
  it("matches when parish and SKU both present", () => {
    const result = matchesGpcCriteria({
      addresses: [],
      parishes: ["East Baton Rouge"],
      skuSignals: ["OUTDOOR_STORAGE"],
      acreageMentions: [],
      priceMentions: [],
    });
    expect(result.matches).toBe(true);
  });

  it("does not match without parish", () => {
    const result = matchesGpcCriteria({
      addresses: [],
      parishes: [],
      skuSignals: ["OUTDOOR_STORAGE"],
      acreageMentions: [],
      priceMentions: [],
    });
    expect(result.matches).toBe(false);
    expect(result.reasons.some((r) => r.includes("No covered parish"))).toBe(true);
  });

  it("does not match without SKU signal", () => {
    const result = matchesGpcCriteria({
      addresses: [],
      parishes: ["Ascension"],
      skuSignals: [],
      acreageMentions: [],
      priceMentions: [],
    });
    expect(result.matches).toBe(false);
    expect(result.reasons.some((r) => r.includes("No target SKU"))).toBe(true);
  });

  it("does not match without either", () => {
    const result = matchesGpcCriteria({
      addresses: [],
      parishes: [],
      skuSignals: [],
      acreageMentions: [],
      priceMentions: [],
    });
    expect(result.matches).toBe(false);
  });
});

// --- Handler tests ---

describe("handleIntakeReceived", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ignores non intake.received events", async () => {
    await handleIntakeReceived({ type: "parcel.created", dealId: "d", parcelId: "p", orgId: "o" });
    expect(db.prisma.deal.count).not.toHaveBeenCalled();
  });

  it("returns on empty content", async () => {
    await handleIntakeReceived({ type: "intake.received", source: "email", content: "", orgId: "o" });
    expect(db.prisma.deal.count).not.toHaveBeenCalled();
  });

  it("skips intakes that do not match GPC criteria", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    await handleIntakeReceived({
      type: "intake.received",
      source: "email",
      content: "Random property in Orleans parish, no specific use mentioned",
      orgId: "o",
    });
    expect(db.prisma.deal.count).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("does not match"));
    consoleSpy.mockRestore();
  });

  it("skips when daily rate limit reached", async () => {
    db.prisma.deal.count.mockResolvedValue(10); // >= max (10)

    await handleIntakeReceived({
      type: "intake.received",
      source: "email",
      content: "Outdoor storage in East Baton Rouge at 123 Main St",
      orgId: "o",
    });

    expect(db.prisma.deal.create).not.toHaveBeenCalled();
  });

  it("skips when address matches existing deal", async () => {
    db.prisma.deal.count.mockResolvedValue(0);
    db.prisma.deal.findFirst.mockResolvedValue({ id: "existing", name: "Existing Deal" });

    await handleIntakeReceived({
      type: "intake.received",
      source: "email",
      content: "Outdoor storage at 123 Main St in East Baton Rouge",
      orgId: "o",
    });

    expect(db.prisma.deal.create).not.toHaveBeenCalled();
  });

  it("skips when no jurisdiction found for parish", async () => {
    db.prisma.deal.count.mockResolvedValue(0);
    db.prisma.deal.findFirst.mockResolvedValue(null); // no existing deal
    db.prisma.jurisdiction.findFirst.mockResolvedValue(null); // no jurisdiction

    await handleIntakeReceived({
      type: "intake.received",
      source: "email",
      content: "Outdoor storage at 123 Main St in East Baton Rouge",
      orgId: "o",
    });

    expect(db.prisma.deal.create).not.toHaveBeenCalled();
  });

  it("auto-creates deal when all conditions met", async () => {
    db.prisma.deal.count.mockResolvedValue(0);
    db.prisma.deal.findFirst.mockResolvedValue(null);
    db.prisma.jurisdiction.findFirst.mockResolvedValue({ id: "j1", name: "East Baton Rouge" });
    db.prisma.orgMembership.findFirst.mockResolvedValue({ userId: "user-1" });
    db.prisma.deal.create.mockResolvedValue({ id: "new-deal", name: "123 Main St" });
    db.prisma.parcel.create.mockResolvedValue({ id: "p1" });
    db.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleIntakeReceived({
      type: "intake.received",
      source: "email",
      content: "Outdoor storage at 123 Main St in East Baton Rouge",
      orgId: "o",
    });

    // Deal created
    expect(db.prisma.deal.create).toHaveBeenCalledTimes(1);
    const dealArg = db.prisma.deal.create.mock.calls[0][0];
    expect(dealArg.data.orgId).toBe("o");
    expect(dealArg.data.sku).toBe("OUTDOOR_STORAGE");
    expect(dealArg.data.jurisdictionId).toBe("j1");
    expect(dealArg.data.status).toBe("INTAKE");
    expect(dealArg.data.source).toContain("[AUTO]");

    // Parcel created
    expect(db.prisma.parcel.create).toHaveBeenCalledTimes(1);

    // Veto task created
    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const taskArg = db.prisma.task.create.mock.calls[0][0];
    expect(taskArg.data.title).toContain("[AUTO]");
    expect(taskArg.data.title).toContain("Review auto-created deal");
    expect(taskArg.data.dueAt).toBeDefined(); // 24h veto deadline
  });

  it("creates deal without parcel when no address extracted", async () => {
    db.prisma.deal.count.mockResolvedValue(0);
    // No address → no findFirst for duplicate check
    db.prisma.jurisdiction.findFirst.mockResolvedValue({ id: "j1", name: "Ascension" });
    db.prisma.orgMembership.findFirst.mockResolvedValue({ userId: "user-1" });
    db.prisma.deal.create.mockResolvedValue({ id: "new-deal", name: "email intake — Ascension" });
    db.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleIntakeReceived({
      type: "intake.received",
      source: "email",
      content: "Truck parking available in Ascension parish area",
      orgId: "o",
    });

    expect(db.prisma.deal.create).toHaveBeenCalledTimes(1);
    expect(db.prisma.parcel.create).not.toHaveBeenCalled();
  });
});

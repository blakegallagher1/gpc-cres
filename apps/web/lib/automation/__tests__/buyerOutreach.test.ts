jest.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findFirst: jest.fn() },
    buyer: { findMany: jest.fn() },
    outreach: { count: jest.fn(), findFirst: jest.fn() },
    task: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

const db = jest.requireMock("@entitlement-os/db") as {
  prisma: {
    deal: { findFirst: jest.Mock };
    buyer: { findMany: jest.Mock };
    outreach: { count: jest.Mock; findFirst: jest.Mock };
    task: { findFirst: jest.Mock; create: jest.Mock };
  };
};

import { findMatchingBuyers, handleBuyerOutreach, handleTriageBuyerMatch } from "../buyerOutreach";

describe("findMatchingBuyers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries buyers by SKU and jurisdiction", async () => {
    db.prisma.buyer.findMany.mockResolvedValue([]);
    await findMatchingBuyers("org-1", "OUTDOOR_STORAGE", "jur-1");

    expect(db.prisma.buyer.findMany).toHaveBeenCalledTimes(1);
    const arg = db.prisma.buyer.findMany.mock.calls[0][0];
    expect(arg.where.orgId).toBe("org-1");
    expect(arg.where.skuInterests).toEqual({ has: "OUTDOOR_STORAGE" });
    expect(arg.where.jurisdictionInterests).toEqual({ has: "jur-1" });
  });

  it("returns matched buyers", async () => {
    db.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: "Co A", email: "a@test.com", buyerType: "operator" },
    ]);

    const result = await findMatchingBuyers("org-1", "TRUCK_PARKING", "jur-1");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Buyer A");
  });
});

describe("handleBuyerOutreach", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ignores non deal.statusChanged events", async () => {
    await handleBuyerOutreach({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("ignores status changes that are not EXIT_MARKETED", async () => {
    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "TRIAGE_DONE", to: "PREAPP", orgId: "o",
    });
    expect(db.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal not found", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(null);
    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });
    expect(db.prisma.buyer.findMany).not.toHaveBeenCalled();
  });

  it("returns when weekly outreach limit reached", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test", sku: "OUTDOOR_STORAGE", jurisdictionId: "j1",
    });
    db.prisma.outreach.count.mockResolvedValue(20); // >= max (20)

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    expect(db.prisma.buyer.findMany).not.toHaveBeenCalled();
  });

  it("creates 'no matching buyers' task when none match", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test Deal", sku: "SMALL_BAY_FLEX", jurisdictionId: "j1",
    });
    db.prisma.outreach.count.mockResolvedValue(0);
    db.prisma.buyer.findMany.mockResolvedValue([]);
    db.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = db.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("No matching buyers");
  });

  it("creates outreach review task with eligible buyers", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test Deal", sku: "TRUCK_PARKING", jurisdictionId: "j1",
    });
    db.prisma.outreach.count.mockResolvedValue(0);
    db.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: "Co A", email: "a@test.com", buyerType: "operator" },
      { id: "b2", name: "Buyer B", company: null, email: "b@test.com", buyerType: "investor" },
    ]);
    // Not in cool-off, not already contacted
    db.prisma.outreach.findFirst.mockResolvedValue(null);
    db.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = db.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("2 buyer outreach");
    expect(arg.data.description).toContain("Buyer A");
    expect(arg.data.description).toContain("Buyer B");
    expect(arg.data.pipelineStep).toBe(8);
  });

  it("filters out buyers already contacted for this deal", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test", sku: "OUTDOOR_STORAGE", jurisdictionId: "j1",
    });
    db.prisma.outreach.count.mockResolvedValue(0);
    db.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: null, email: "a@test.com", buyerType: "operator" },
    ]);
    // b1 already contacted (findFirst returns a result for alreadyContacted check)
    // The handler calls both isInCoolOff and alreadyContacted with findFirst
    // First call: isInCoolOff → null, Second call: alreadyContacted → existing outreach
    db.prisma.outreach.findFirst
      .mockResolvedValueOnce(null) // isInCoolOff → not in cool-off
      .mockResolvedValueOnce({ id: "existing" }); // alreadyContacted → yes

    await handleBuyerOutreach({
      type: "deal.statusChanged", dealId: "d", from: "APPROVED", to: "EXIT_MARKETED", orgId: "o",
    });

    // All buyers filtered out, so no outreach task
    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });
});

describe("handleTriageBuyerMatch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("ignores non triage.completed events", async () => {
    await handleTriageBuyerMatch({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    expect(db.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("ignores non-ADVANCE decisions", async () => {
    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "KILL", orgId: "o",
    });
    expect(db.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("creates buyer interest task when matching buyers found", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test Deal", sku: "TRUCK_PARKING", jurisdictionId: "j1",
    });
    db.prisma.buyer.findMany.mockResolvedValue([
      { id: "b1", name: "Buyer A", company: null, email: null, buyerType: "operator" },
    ]);
    db.prisma.task.findFirst.mockResolvedValue(null);
    db.prisma.task.create.mockResolvedValue({ id: "t1" });

    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "ADVANCE", orgId: "o",
    });

    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = db.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("1 potential buyer");
    expect(arg.data.pipelineStep).toBe(1);
  });

  it("does not duplicate buyer interest tasks", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test", sku: "OUTDOOR_STORAGE", jurisdictionId: "j1",
    });
    db.prisma.buyer.findMany.mockResolvedValue([{ id: "b1", name: "Buyer", company: null, email: null, buyerType: "investor" }]);
    db.prisma.task.findFirst.mockResolvedValue({ id: "existing-task" });

    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "ADVANCE", orgId: "o",
    });

    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });

  it("does nothing when no matching buyers", async () => {
    db.prisma.deal.findFirst.mockResolvedValue({
      id: "d", name: "Test", sku: "SMALL_BAY_FLEX", jurisdictionId: "j1",
    });
    db.prisma.buyer.findMany.mockResolvedValue([]);

    await handleTriageBuyerMatch({
      type: "triage.completed", dealId: "d", runId: "r", decision: "ADVANCE", orgId: "o",
    });

    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });
});

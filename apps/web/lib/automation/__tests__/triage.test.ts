jest.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findFirst: jest.fn() },
    run: { findFirst: jest.fn(), count: jest.fn() },
    task: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

const db = jest.requireMock("@entitlement-os/db") as {
  prisma: {
    deal: { findFirst: jest.Mock };
    run: { findFirst: jest.Mock; count: jest.Mock };
    task: { findFirst: jest.Mock; create: jest.Mock };
  };
};

import { handleTriageReadiness } from "../triage";
import type { AutomationEvent } from "../events";

function makeEvent(overrides?: Partial<Extract<AutomationEvent, { type: "parcel.enriched" }>>): AutomationEvent {
  return {
    type: "parcel.enriched",
    dealId: "deal-1",
    parcelId: "parcel-1",
    orgId: "org-1",
    ...overrides,
  };
}

function makeDeal(overrides?: Record<string, unknown>) {
  return {
    id: "deal-1",
    name: "Test Deal",
    status: "INTAKE",
    parcels: [{ id: "p1", propertyDbId: "prop-1" }],
    ...overrides,
  };
}

describe("handleTriageReadiness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ignores non parcel.enriched events", async () => {
    await handleTriageReadiness({ type: "parcel.created", dealId: "d", parcelId: "p", orgId: "o" });
    expect(db.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal not found", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(null);
    await handleTriageReadiness(makeEvent());
    expect(db.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal status is not INTAKE", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(makeDeal({ status: "TRIAGE_DONE" }));
    await handleTriageReadiness(makeEvent());
    expect(db.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal has no parcels", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(makeDeal({ parcels: [] }));
    await handleTriageReadiness(makeEvent());
    expect(db.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if not all parcels are enriched", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(
      makeDeal({ parcels: [{ id: "p1", propertyDbId: "prop-1" }, { id: "p2", propertyDbId: null }] })
    );
    await handleTriageReadiness(makeEvent());
    expect(db.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if a successful triage run already exists", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    db.prisma.run.findFirst.mockResolvedValue({ id: "run-1", status: "succeeded" });
    await handleTriageReadiness(makeEvent());
    expect(db.prisma.run.count).not.toHaveBeenCalled();
  });

  it("returns if daily rate limit exceeded", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    db.prisma.run.findFirst.mockResolvedValue(null);
    db.prisma.run.count.mockResolvedValue(1); // >= maxRunsPerDealPerDay (1)
    await handleTriageReadiness(makeEvent());
    expect(db.prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it("returns if an active triage task already exists", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    db.prisma.run.findFirst.mockResolvedValue(null);
    db.prisma.run.count.mockResolvedValue(0);
    db.prisma.task.findFirst.mockResolvedValue({ id: "task-1" });
    await handleTriageReadiness(makeEvent());
    expect(db.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates triage notification task when all conditions met", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    db.prisma.run.findFirst.mockResolvedValue(null);
    db.prisma.run.count.mockResolvedValue(0);
    db.prisma.task.findFirst.mockResolvedValue(null);
    db.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleTriageReadiness(makeEvent());

    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const createArg = db.prisma.task.create.mock.calls[0][0];
    expect(createArg.data.title).toContain("[AUTO]");
    expect(createArg.data.title).toContain("ready for triage");
    expect(createArg.data.dealId).toBe("deal-1");
    expect(createArg.data.orgId).toBe("org-1");
    expect(createArg.data.pipelineStep).toBe(1);
  });

  it("handles multi-parcel deal with all enriched", async () => {
    db.prisma.deal.findFirst.mockResolvedValue(
      makeDeal({
        parcels: [
          { id: "p1", propertyDbId: "prop-1" },
          { id: "p2", propertyDbId: "prop-2" },
          { id: "p3", propertyDbId: "prop-3" },
        ],
      })
    );
    db.prisma.run.findFirst.mockResolvedValue(null);
    db.prisma.run.count.mockResolvedValue(0);
    db.prisma.task.findFirst.mockResolvedValue(null);
    db.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleTriageReadiness(makeEvent());

    expect(db.prisma.task.create).toHaveBeenCalledTimes(1);
    const desc = db.prisma.task.create.mock.calls[0][0].data.description;
    expect(desc).toContain("3 parcel(s)");
  });
});

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      deal: { findFirst: vi.fn() },
      run: { findFirst: vi.fn(), count: vi.fn() },
      task: { findFirst: vi.fn(), create: vi.fn() },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

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
    vi.clearAllMocks();
  });

  it("ignores non parcel.enriched events", async () => {
    await handleTriageReadiness({ type: "parcel.created", dealId: "d", parcelId: "p", orgId: "o" });
    expect(dbMock.prisma.deal.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal not found", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(null);
    await handleTriageReadiness(makeEvent());
    expect(dbMock.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal status is not INTAKE", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(makeDeal({ status: "TRIAGE_DONE" }));
    await handleTriageReadiness(makeEvent());
    expect(dbMock.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if deal has no parcels", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(makeDeal({ parcels: [] }));
    await handleTriageReadiness(makeEvent());
    expect(dbMock.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if not all parcels are enriched", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(
      makeDeal({ parcels: [{ id: "p1", propertyDbId: "prop-1" }, { id: "p2", propertyDbId: null }] })
    );
    await handleTriageReadiness(makeEvent());
    expect(dbMock.prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it("returns if a successful triage run already exists", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    dbMock.prisma.run.findFirst.mockResolvedValue({ id: "run-1", status: "succeeded" });
    await handleTriageReadiness(makeEvent());
    expect(dbMock.prisma.run.count).not.toHaveBeenCalled();
  });

  it("returns if daily rate limit exceeded", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    dbMock.prisma.run.findFirst.mockResolvedValue(null);
    dbMock.prisma.run.count.mockResolvedValue(1); // >= maxRunsPerDealPerDay (1)
    await handleTriageReadiness(makeEvent());
    expect(dbMock.prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it("returns if an active triage task already exists", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    dbMock.prisma.run.findFirst.mockResolvedValue(null);
    dbMock.prisma.run.count.mockResolvedValue(0);
    dbMock.prisma.task.findFirst.mockResolvedValue({ id: "task-1" });
    await handleTriageReadiness(makeEvent());
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates triage notification task when all conditions met", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(makeDeal());
    dbMock.prisma.run.findFirst.mockResolvedValue(null);
    dbMock.prisma.run.count.mockResolvedValue(0);
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleTriageReadiness(makeEvent());

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const createArg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(createArg.data.title).toContain("[AUTO]");
    expect(createArg.data.title).toContain("ready for triage");
    expect(createArg.data.dealId).toBe("deal-1");
    expect(createArg.data.orgId).toBe("org-1");
    expect(createArg.data.pipelineStep).toBe(1);
  });

  it("handles multi-parcel deal with all enriched", async () => {
    dbMock.prisma.deal.findFirst.mockResolvedValue(
      makeDeal({
        parcels: [
          { id: "p1", propertyDbId: "prop-1" },
          { id: "p2", propertyDbId: "prop-2" },
          { id: "p3", propertyDbId: "prop-3" },
        ],
      })
    );
    dbMock.prisma.run.findFirst.mockResolvedValue(null);
    dbMock.prisma.run.count.mockResolvedValue(0);
    dbMock.prisma.task.findFirst.mockResolvedValue(null);
    dbMock.prisma.task.create.mockResolvedValue({ id: "new-task" });

    await handleTriageReadiness(makeEvent());

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const desc = dbMock.prisma.task.create.mock.calls[0][0].data.description;
    expect(desc).toContain("3 parcel(s)");
  });
});

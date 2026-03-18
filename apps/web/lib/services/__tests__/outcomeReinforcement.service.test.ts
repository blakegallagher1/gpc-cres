import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      episodicEntry: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      proceduralSkill: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

import { reinforceLearningFromDealOutcome } from "../outcomeReinforcement.service";

describe("reinforceLearningFromDealOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.prisma.episodicEntry.findMany.mockResolvedValue([
      {
        id: "episode-1",
        proceduralSkillEpisodes: [{ proceduralSkillId: "skill-1" }],
      },
      {
        id: "episode-2",
        proceduralSkillEpisodes: [{ proceduralSkillId: "skill-1" }],
      },
    ]);
    dbMock.prisma.episodicEntry.updateMany.mockResolvedValue({ count: 2 });
  });

  it("increments success counters for exited deals", async () => {
    dbMock.prisma.proceduralSkill.findUnique.mockResolvedValue({
      successCount: 1,
      failCount: 1,
    });
    dbMock.prisma.proceduralSkill.update.mockResolvedValue(undefined);

    const result = await reinforceLearningFromDealOutcome({
      orgId: "org-1",
      dealId: "deal-1",
      terminalStatus: "EXITED",
    });

    expect(result).toEqual({
      updatedEpisodeCount: 2,
      updatedSkillCount: 1,
    });
    expect(dbMock.prisma.proceduralSkill.update).toHaveBeenCalledWith({
      where: { id: "skill-1" },
      data: {
        successCount: 3,
        failCount: 1,
        successRate: 0.75,
      },
    });
  });

  it("increments fail counters for killed deals and recomputes success rate", async () => {
    dbMock.prisma.proceduralSkill.findUnique.mockResolvedValue({
      successCount: 2,
      failCount: 1,
    });
    dbMock.prisma.proceduralSkill.update.mockResolvedValue(undefined);

    await reinforceLearningFromDealOutcome({
      orgId: "org-1",
      dealId: "deal-1",
      terminalStatus: "KILLED",
    });

    expect(dbMock.prisma.proceduralSkill.update).toHaveBeenCalledWith({
      where: { id: "skill-1" },
      data: {
        successCount: 2,
        failCount: 3,
        successRate: 0.4,
      },
    });
  });
});

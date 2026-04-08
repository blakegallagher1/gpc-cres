import { beforeEach, describe, expect, it, vi } from "vitest";

const { reinforceLearningFromDealOutcomeMock } = vi.hoisted(() => ({
  reinforceLearningFromDealOutcomeMock: vi.fn(),
}));

vi.mock("@gpc/server/services/outcome-reinforcement.service", () => ({
  reinforceLearningFromDealOutcome: reinforceLearningFromDealOutcomeMock,
}));

import { reinforceLearningFromDealOutcome } from "../outcomeReinforcement.service";

describe("reinforceLearningFromDealOutcome wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the package service result for exited deals", async () => {
    reinforceLearningFromDealOutcomeMock.mockResolvedValue({
      updatedEpisodeCount: 2,
      updatedSkillCount: 1,
    });

    const input = {
      orgId: "org-1",
      dealId: "deal-1",
      terminalStatus: "EXITED" as const,
    };

    const result = await reinforceLearningFromDealOutcome(input);

    expect(reinforceLearningFromDealOutcomeMock).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      updatedEpisodeCount: 2,
      updatedSkillCount: 1,
    });
  });

  it("returns the package service result for killed deals", async () => {
    reinforceLearningFromDealOutcomeMock.mockResolvedValue({
      updatedEpisodeCount: 2,
      updatedSkillCount: 1,
    });

    const input = {
      orgId: "org-1",
      dealId: "deal-1",
      terminalStatus: "KILLED" as const,
    };

    const result = await reinforceLearningFromDealOutcome(input);

    expect(reinforceLearningFromDealOutcomeMock).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      updatedEpisodeCount: 2,
      updatedSkillCount: 1,
    });
  });
});

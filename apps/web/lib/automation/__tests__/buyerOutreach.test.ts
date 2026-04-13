const mockedBuyerOutreach = vi.hoisted(() => ({
  findMatchingBuyers: vi.fn(),
  handleBuyerOutreach: vi.fn(),
  handleTriageBuyerMatch: vi.fn(),
}));

vi.mock("@gpc/server/automation/buyerOutreach", () => mockedBuyerOutreach);

import {
  findMatchingBuyers,
  handleBuyerOutreach,
  handleTriageBuyerMatch,
} from "../buyerOutreach";

describe("automation buyer outreach facade", () => {
  it("re-exports buyer outreach helpers from @gpc/server", async () => {
    mockedBuyerOutreach.findMatchingBuyers.mockResolvedValue([{ id: "b1" }]);
    mockedBuyerOutreach.handleBuyerOutreach.mockResolvedValue(undefined);
    mockedBuyerOutreach.handleTriageBuyerMatch.mockResolvedValue(undefined);

    expect(findMatchingBuyers).toBe(mockedBuyerOutreach.findMatchingBuyers);
    expect(handleBuyerOutreach).toBe(mockedBuyerOutreach.handleBuyerOutreach);
    expect(handleTriageBuyerMatch).toBe(
      mockedBuyerOutreach.handleTriageBuyerMatch,
    );

    await findMatchingBuyers("org-1", "TRUCK_PARKING", "jur-1");
    await handleBuyerOutreach({
      type: "deal.statusChanged",
      dealId: "d",
      from: "APPROVED",
      to: "EXIT_MARKETED",
      orgId: "o",
    });
    await handleTriageBuyerMatch({
      type: "triage.completed",
      dealId: "d",
      runId: "r",
      decision: "ADVANCE",
      orgId: "o",
    });

    expect(mockedBuyerOutreach.findMatchingBuyers).toHaveBeenCalledWith(
      "org-1",
      "TRUCK_PARKING",
      "jur-1",
    );
    expect(mockedBuyerOutreach.handleBuyerOutreach).toHaveBeenCalledTimes(1);
    expect(mockedBuyerOutreach.handleTriageBuyerMatch).toHaveBeenCalledTimes(1);
  });
});

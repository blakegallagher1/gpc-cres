const mockedAdvancement = vi.hoisted(() => ({
  getNextTransition: vi.fn(),
  handleAdvancement: vi.fn(),
  handleStatusChangeReminder: vi.fn(),
}));

vi.mock("@gpc/server/automation/advancement.service", () => mockedAdvancement);

import {
  getNextTransition,
  handleAdvancement,
  handleStatusChangeReminder,
} from "../advancement";

describe("automation advancement facade", () => {
  it("re-exports advancement helpers from @gpc/server", async () => {
    mockedAdvancement.getNextTransition.mockReturnValue("next");
    mockedAdvancement.handleAdvancement.mockResolvedValue(undefined);
    mockedAdvancement.handleStatusChangeReminder.mockResolvedValue(undefined);

    expect(getNextTransition).toBe(mockedAdvancement.getNextTransition);
    expect(handleAdvancement).toBe(mockedAdvancement.handleAdvancement);
    expect(handleStatusChangeReminder).toBe(
      mockedAdvancement.handleStatusChangeReminder,
    );

    await handleAdvancement({ type: "task.completed", dealId: "d", taskId: "t", orgId: "o" });
    await handleStatusChangeReminder({
      type: "deal.stageChanged",
      dealId: "d",
      from: "SCREENING",
      to: "UNDERWRITING",
      orgId: "o",
    });

    expect(getNextTransition("TRIAGE_DONE")).toBe("next");
    expect(mockedAdvancement.getNextTransition).toHaveBeenCalledWith("TRIAGE_DONE");
    expect(mockedAdvancement.handleAdvancement).toHaveBeenCalledTimes(1);
    expect(mockedAdvancement.handleStatusChangeReminder).toHaveBeenCalledTimes(1);
  });
});

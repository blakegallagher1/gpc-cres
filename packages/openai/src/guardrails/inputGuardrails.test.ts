import { describe, expect, it } from "vitest";

import { coordinatorInputGuardrail } from "./inputGuardrails.js";

const ACTIVE_DEAL_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DEAL_ID = "22222222-2222-4222-8222-222222222222";

describe("coordinatorInputGuardrail", () => {
  it("does not flag a mismatch when the active deal is referenced alongside other UUIDs", async () => {
    const result = await coordinatorInputGuardrail.execute({
      input: [
        `Analyze deal ${ACTIVE_DEAL_ID} in the context of related example ${OTHER_DEAL_ID}.`,
      ],
      context: {
        context: {
          dealId: ACTIVE_DEAL_ID,
        },
      },
    });

    expect(result.tripwireTriggered).toBe(false);
    expect(result.outputInfo.dealReferenceMismatch).toEqual([]);
  });

  it("still flags a mismatch when only foreign deal ids are referenced", async () => {
    const result = await coordinatorInputGuardrail.execute({
      input: [`Analyze deal ${OTHER_DEAL_ID}.`],
      context: {
        context: {
          dealId: ACTIVE_DEAL_ID,
        },
      },
    });

    expect(result.tripwireTriggered).toBe(true);
    expect(result.outputInfo.dealReferenceMismatch).toEqual([
      "deal_reference_mismatch",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { createIntentAwareCoordinator } from "../../../src/agents/index.js";

describe("Phase 1 Agent Pack :: progressive context", () => {
  it("[MATRIX:agent:progressive-context][PACK:lazy] defers specialist context assembly until specialist instructions are resolved", async () => {
    const coordinator = createIntentAwareCoordinator("general");
    const firstSpecialist = (coordinator.handoffs ?? [])[0];

    expect(firstSpecialist).toBeDefined();
    expect(typeof firstSpecialist.instructions).toBe("function");

    const instructions = await (
      firstSpecialist.instructions as (
        runContext: unknown,
        agent: typeof firstSpecialist,
      ) => Promise<string>
    )({} as never, firstSpecialist);

    expect(instructions.includes("## Specialist Metadata")).toBe(true);
    expect(instructions.includes("## Runtime Resources")).toBe(true);
    expect(instructions.includes("CORE CAPABILITIES")).toBe(true);
  });
});

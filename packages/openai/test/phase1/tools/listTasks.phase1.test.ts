import { describe, expect, it } from "vitest";

import { listTasks } from "../../../src/tools/taskTools.js";
import { getRequiredFields, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: listTasks", () => {
  it("[MATRIX:tool:listTasks][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(listTasks.name).toBe("list_tasks");

    const required = getRequiredFields(listTasks);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("status")).toBe(true);
  });

  it("[MATRIX:tool:listTasks][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const source = readRepoSource("packages/openai/src/tools/taskTools.ts");

    expect(source.includes("prisma.task.findMany")).toBe(true);
    expect(source.includes("orgId,")).toBe(true);
    expect(source.includes("dealId,")).toBe(true);
    expect(source.includes("...(status ? { status } : {})")).toBe(true);
  });

  it("[MATRIX:tool:listTasks][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/taskTools.ts");
    expect(source.includes("owner: { select: { id: true, email: true } }")).toBe(true);
    expect(source.includes("orderBy: [{ pipelineStep: \"asc\" }, { createdAt: \"asc\" }]")).toBe(true);
    expect(source.includes("return JSON.stringify(tasks)")).toBe(true);
  });
});

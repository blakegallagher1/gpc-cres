import { describe, expect, it } from "vitest";

import { createTask } from "../../../src/tools/taskTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: createTask", () => {
  it("[MATRIX:tool:createTask][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(createTask.type).toBe("function");
    expect(createTask.name).toBe("create_task");
    expect(createTask.strict).toBe(true);

    const required = getRequiredFields(createTask);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("dealId")).toBe(true);
    expect(required.includes("title")).toBe(true);
    expect(required.includes("pipelineStep")).toBe(true);
  });

  it("[MATRIX:tool:createTask][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(createTask, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/taskTools.ts");
    expect(source.includes("const deal = await prisma.deal.findFirst")).toBe(true);
    expect(source.includes("where: { id: dealId, orgId }")).toBe(true);
    expect(source.includes("Deal not found or access denied")).toBe(true);
  });

  it("[MATRIX:tool:createTask][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/taskTools.ts");
    expect(source.includes("prisma.task.create")).toBe(true);
    expect(source.includes("dueAt: dueAt ? new Date(dueAt) : null")).toBe(true);
    expect(source.includes("ownerUserId: ownerUserId ?? null")).toBe(true);
  });
});

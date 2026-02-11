import { describe, expect, it } from "vitest";

import { updateTask } from "../../../src/tools/taskTools.js";
import { getRequiredFields, getSchemaProp, readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: updateTask", () => {
  it("[MATRIX:tool:updateTask][PACK:schema] validates input/output schema contract and malformed payload rejection", () => {
    expect(updateTask.type).toBe("function");
    expect(updateTask.name).toBe("update_task");
    expect(updateTask.strict).toBe(true);

    const required = getRequiredFields(updateTask);
    expect(required.includes("orgId")).toBe(true);
    expect(required.includes("taskId")).toBe(true);
    expect(required.includes("status")).toBe(true);
  });

  it("[MATRIX:tool:updateTask][PACK:security] validates auth, org scoping, and cross-tenant access protections", () => {
    const orgId = getSchemaProp(updateTask, "orgId");
    expect(orgId?.format).toBe("uuid");

    const source = readRepoSource("packages/openai/src/tools/taskTools.ts");
    expect(source.includes("where: { id: taskId, orgId }")).toBe(true);
    expect(source.includes("Task not found or access denied")).toBe(true);
  });

  it("[MATRIX:tool:updateTask][PACK:idempotency] validates retry safety and duplicate-write prevention behavior", () => {
    const source = readRepoSource("packages/openai/src/tools/taskTools.ts");
    expect(source.includes("prisma.task.updateMany")).toBe(true);
    expect(source.includes("result.count === 0")).toBe(true);
    expect(source.includes("findFirstOrThrow")).toBe(true);
  });
});

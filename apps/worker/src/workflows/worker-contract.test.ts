import { describe, expect, it } from "vitest";

import * as workflows from "./index.js";

const expectedWorkflowExports = [
  "agentRunWorkflow",
  "bulkArtifactWorkflow",
  "changeDetectionWorkflow",
  "dealIntakeWorkflow",
  "parishPackRefreshWorkflow",
  "triageWorkflow",
] as const;

describe("worker workflow exports", () => {
  it("keeps Temporal workflow names stable for worker registration", () => {
    for (const workflowName of expectedWorkflowExports) {
      expect(workflows[workflowName]).toBeTypeOf("function");
    }
  });
});

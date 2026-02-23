import { isAgentOsFeatureEnabled } from "../config.js";
import { trimToolOutputForTool } from "../utils/toolOutputTrimmer.js";
import { PolicyEngine, type PolicyDecision } from "./policyEngine.js";
import { SelfRepairExecutor } from "./selfRepair.js";
import { ToolRegistry } from "./registry.js";

type JsonRecord = Record<string, unknown>;

export type OrchestratorContext = {
  orgId: string;
  runId?: string;
  riskLevel?: string;
};

export type OrchestratorResult = {
  output: unknown;
  latencyMs: number;
  policyDecision: PolicyDecision;
  repaired: boolean;
  trimmed: boolean;
};

/**
 * Wraps tool execution with policy checks, output trimming, stats recording,
 * and self-repair. When all feature flags are off, acts as a transparent
 * pass-through with only timing overhead.
 */
export class ToolOrchestrator {
  private policyEngine: PolicyEngine;
  private selfRepair: SelfRepairExecutor;
  private registry: ToolRegistry | null;

  constructor(opts?: { registry?: ToolRegistry; costCapUsd?: number }) {
    this.policyEngine = new PolicyEngine(opts?.costCapUsd);
    this.selfRepair = new SelfRepairExecutor();
    this.registry = opts?.registry ?? null;
  }

  resetRunState(): void {
    this.policyEngine.resetCost();
    this.selfRepair.resetCounters();
  }

  async execute(
    toolName: string,
    input: unknown,
    executeFn: (input: unknown) => Promise<unknown>,
    context: OrchestratorContext,
  ): Promise<OrchestratorResult> {
    const start = performance.now();
    let policyDecision: PolicyDecision = { action: "approve", reason: "No policy engine" };
    let repaired = false;
    let trimmed = false;

    if (isAgentOsFeatureEnabled("policyEngine")) {
      policyDecision = this.policyEngine.evaluate(toolName, input, {
        riskLevel: context.riskLevel,
      });

      if (policyDecision.action === "deny") {
        return {
          output: `Policy denied: ${policyDecision.reason}`,
          latencyMs: performance.now() - start,
          policyDecision,
          repaired: false,
          trimmed: false,
        };
      }

      if (policyDecision.action === "escalate") {
        return {
          output: `Escalation required: ${policyDecision.reason}`,
          latencyMs: performance.now() - start,
          policyDecision,
          repaired: false,
          trimmed: false,
        };
      }
    }

    let output: unknown;
    let success = true;

    try {
      output = await executeFn(input);
    } catch (err) {
      success = false;

      if (isAgentOsFeatureEnabled("selfRepair")) {
        const repairResult = await this.selfRepair.handleFailure(
          toolName,
          input,
          err instanceof Error ? err : new Error(String(err)),
          executeFn,
        );

        if (repairResult.repaired) {
          output = repairResult.result;
          repaired = true;
          success = true;
        } else {
          const latencyMs = performance.now() - start;
          this.recordStats(toolName, context.orgId, latencyMs, false);
          throw err;
        }
      } else {
        const latencyMs = performance.now() - start;
        this.recordStats(toolName, context.orgId, latencyMs, false);
        throw err;
      }
    }

    if (isAgentOsFeatureEnabled("toolOutputTrimming") && typeof output === "string") {
      const before = output;
      output = trimToolOutputForTool(output, toolName);
      trimmed = output !== before;
    }

    const latencyMs = performance.now() - start;
    this.recordStats(toolName, context.orgId, latencyMs, success);

    return { output, latencyMs, policyDecision, repaired, trimmed };
  }

  private recordStats(toolName: string, orgId: string, latencyMs: number, success: boolean): void {
    if (this.registry && isAgentOsFeatureEnabled("dynamicToolRegistry")) {
      void this.registry.recordExecution(toolName, orgId, latencyMs, success, 0).catch(() => {});
    }
  }
}

/**
 * Wrap an SDK tool's execute function through the orchestrator pipeline.
 * Returns a new tool object with the same schema but wrapped execution.
 *
 * When no orchestrator features are enabled, the wrapped function simply
 * calls through to the original with negligible overhead.
 */
export function wrapToolWithOrchestrator(
  tool: unknown,
  orchestrator: ToolOrchestrator,
  context: OrchestratorContext,
): unknown {
  if (!tool || typeof tool !== "object") return tool;

  const rec = tool as JsonRecord;
  const originalExecute = rec.execute;
  if (typeof originalExecute !== "function") return tool;

  const toolName =
    typeof rec.name === "string" ? rec.name : "unknown_tool";

  const anyFeaturesEnabled =
    isAgentOsFeatureEnabled("policyEngine") ||
    isAgentOsFeatureEnabled("selfRepair") ||
    isAgentOsFeatureEnabled("toolOutputTrimming") ||
    isAgentOsFeatureEnabled("dynamicToolRegistry");

  if (!anyFeaturesEnabled) return tool;

  const wrappedExecute = async (...args: unknown[]): Promise<unknown> => {
    const input = args[1] ?? args[0];

    const result = await orchestrator.execute(
      toolName,
      input,
      async (wrappedInput) => {
        const callArgs = [...args];
        if (callArgs.length >= 2) {
          callArgs[1] = wrappedInput;
        } else {
          callArgs[0] = wrappedInput;
        }
        return (originalExecute as (...a: unknown[]) => Promise<unknown>).apply(
          tool,
          callArgs,
        );
      },
      context,
    );

    return result.output;
  };

  return { ...rec, execute: wrappedExecute };
}

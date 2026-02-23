type JsonRecord = Record<string, unknown>;

export type ToolPolicy = {
  exact: Set<string>;
  prefixes: string[];
};

function getToolName(tool: unknown): string | null {
  if (!tool || typeof tool !== "object") return null;
  const asRecord = tool as JsonRecord;
  const direct = asRecord.name;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }
  const fn = asRecord.function;
  if (fn && typeof fn === "object") {
    const functionName = (fn as JsonRecord).name;
    if (typeof functionName === "string" && functionName.trim().length > 0) {
      return functionName;
    }
  }
  return null;
}

export class DynamicToolRegistry {
  private readonly tools: unknown[] = [];
  private policyByIntent: Record<string, ToolPolicy> = {};

  register(tools: readonly unknown[]): void {
    for (const tool of tools) {
      this.tools.push(tool);
    }
  }

  configureIntentPolicies(policyByIntent: Record<string, ToolPolicy>): void {
    this.policyByIntent = policyByIntent;
  }

  getAllTools(): readonly unknown[] {
    return [...this.tools];
  }

  getToolsForIntent(intent: string): unknown[] {
    const policy = this.policyByIntent[intent] ?? this.policyByIntent.general;
    if (!policy) {
      return [...this.tools];
    }

    return this.tools.filter((tool) => {
      if (tool && typeof tool === "object" && (tool as JsonRecord).type === "hosted_tool") {
        return false;
      }
      const name = getToolName(tool);
      if (!name) return false;
      if (policy.exact.has(name)) return true;
      return policy.prefixes.some((prefix) => name.startsWith(prefix));
    });
  }
}


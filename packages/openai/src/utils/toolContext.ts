/**
 * Standardized tool execution context (P3 Pattern 3).
 * Provides a consistent interface for tools to access runtime context
 * without reaching through nested SDK internals.
 */

export type ToolExecutionContext = {
  orgId: string;
  userId: string;
  conversationId: string | null;
  dealId: string | null;
  jurisdictionId: string | null;
  runType: string | null;
  preferredCuaModel: string | null;
};

/**
 * Extract a standardized context from the raw SDK context object.
 * The SDK passes context as the second arg to tool.execute().
 * Its shape varies — this normalizes it.
 */
export function extractToolContext(rawContext: unknown): ToolExecutionContext {
  const ctx = normalizeContextShape(rawContext);
  return {
    orgId: getString(ctx, "orgId") ?? "",
    userId: getString(ctx, "userId") ?? "",
    conversationId: getString(ctx, "conversationId"),
    dealId: getString(ctx, "dealId"),
    jurisdictionId: getString(ctx, "jurisdictionId"),
    runType: getString(ctx, "runType"),
    preferredCuaModel: getString(ctx, "preferredCuaModel"),
  };
}

/**
 * Check if a context has a valid orgId (minimum requirement for scoped queries).
 */
export function hasValidOrgContext(ctx: ToolExecutionContext): boolean {
  return ctx.orgId.length > 0;
}

/**
 * Check if context has deal-specific information.
 */
export function hasDealContext(ctx: ToolExecutionContext): boolean {
  return ctx.dealId !== null && ctx.dealId.length > 0;
}

function normalizeContextShape(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  // The SDK sometimes nests context under a .context property
  if (obj.context && typeof obj.context === "object") {
    return { ...obj, ...(obj.context as Record<string, unknown>) };
  }
  return obj;
}

function getString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

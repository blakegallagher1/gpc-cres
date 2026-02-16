import * as Sentry from "@sentry/node";

type AgentErrorContext = {
  tool?: string;
  model?: string;
  dealId?: string;
  orgId?: string;
  input?: unknown;
  [key: string]: unknown;
};

type ToolLike = {
  name?: unknown;
  execute?: (...args: unknown[]) => unknown;
  [key: string]: unknown;
};

let sentryInitialized = false;

export function initAgentsSentry(): void {
  if (sentryInitialized) return;
  const dsn = process.env.SENTRY_AGENTS_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.3 : 1.0,
  });
  sentryInitialized = true;
}

export function captureAgentError(
  agentName: string,
  error: unknown,
  context: AgentErrorContext = {},
): void {
  initAgentsSentry();
  const safeError = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope((scope) => {
    scope.setTag("agent", agentName);
    if (context.tool) scope.setTag("tool", context.tool);
    if (context.model) scope.setTag("model", context.model);
    if (context.dealId) scope.setTag("dealId", context.dealId);
    if (context.orgId) scope.setTag("orgId", context.orgId);
    scope.setContext("agent_context", context);
    Sentry.captureException(safeError);
  });
}

export async function traceAgentRun<T>(
  agentName: string,
  fn: () => Promise<T>,
  context: AgentErrorContext = {},
): Promise<T> {
  initAgentsSentry();
  return Sentry.startSpan(
    {
      name: `agent.${agentName}.run`,
      op: "agent.run",
      attributes: {
        "agent.name": agentName,
        ...(context.model ? { "agent.model": String(context.model) } : {}),
        ...(context.dealId ? { "agent.deal_id": String(context.dealId) } : {}),
        ...(context.orgId ? { "agent.org_id": String(context.orgId) } : {}),
      },
    },
    async () => {
      try {
        return await fn();
      } catch (error) {
        captureAgentError(agentName, error, context);
        throw error;
      }
    },
  );
}

export function instrumentAgentTools(agentName: string, tools: readonly unknown[]): unknown[] {
  initAgentsSentry();
  return tools.map((tool) => {
    if (typeof tool !== "object" || tool === null) return tool;
    const candidate = tool as ToolLike;
    if (typeof candidate.execute !== "function") return tool;

    const toolName = typeof candidate.name === "string" ? candidate.name : "unknown_tool";
    const originalExecute = candidate.execute.bind(candidate);

    return {
      ...candidate,
      execute: async (...args: unknown[]) =>
        traceAgentRun(
          agentName,
          async () =>
            Sentry.startSpan(
              {
                name: `tool.${toolName}`,
                op: "agent.tool",
                attributes: {
                  "agent.name": agentName,
                  "tool.name": toolName,
                },
              },
              async () => {
                try {
                  return await originalExecute(...args);
                } catch (error) {
                  captureAgentError(agentName, error, {
                    tool: toolName,
                    input: args[0],
                  });
                  throw error;
                }
              },
            ),
          {},
        ),
    };
  });
}

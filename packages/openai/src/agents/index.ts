import { Agent } from "@openai/agents";

import { type QueryIntent } from "../queryRouter.js";
import { initAgentsSentry, instrumentAgentTools } from "../sentry.js";
import {
  entitlementOsTools,
  buildGoogleMapsMcpServerTool,
} from "../tools/index.js";
import { createEntitlementOSAgent } from "./entitlement-os.js";

export { createEntitlementOSAgent } from "./entitlement-os.js";

/**
 * Create an EntitlementOS agent with all tools and domain expertise.
 * Returns a new Agent instance ready for `run()`.
 */
export function createConfiguredCoordinator(options?: {
  intent?: QueryIntent;
}): Agent<unknown, any> {
  initAgentsSentry();

  // Intent is preserved for analytics/logging but no longer used for routing
  const intent = options?.intent ?? "general";

  const agent = createEntitlementOSAgent();
  const googleMapsMcpTool = buildGoogleMapsMcpServerTool({ intent });

  return agent.clone({
    tools: instrumentAgentTools(
      agent.name,
      [
        ...entitlementOsTools,
        ...(googleMapsMcpTool ? [googleMapsMcpTool] : []),
      ],
    ) as Agent["tools"],
  });
}

/**
 * Legacy alias for createConfiguredCoordinator.
 * Kept for backward compatibility during transition.
 */
export function createIntentAwareCoordinator(intent: QueryIntent): Agent<unknown, any> {
  return createConfiguredCoordinator({ intent });
}

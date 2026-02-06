import { Agent } from '@openai/agents';

export { coordinatorAgent } from './coordinator.js';
export { legalAgent } from './legal.js';
export { researchAgent } from './research.js';
export { riskAgent } from './risk.js';
export { financeAgent } from './finance.js';
export { screenerAgent } from './screener.js';
export { dueDiligenceAgent } from './dueDiligence.js';
export { entitlementsAgent } from './entitlements.js';
export { designAgent } from './design.js';
export { operationsAgent } from './operations.js';
export { marketingAgent } from './marketing.js';
export { taxAgent } from './tax.js';
export { marketIntelAgent } from './marketIntel.js';

// Lazy imports to avoid circular references during handoff wiring
import { coordinatorAgent } from './coordinator.js';
import { legalAgent } from './legal.js';
import { researchAgent } from './research.js';
import { riskAgent } from './risk.js';
import { financeAgent } from './finance.js';
import { screenerAgent } from './screener.js';
import { dueDiligenceAgent } from './dueDiligence.js';
import { entitlementsAgent } from './entitlements.js';
import { designAgent } from './design.js';
import { operationsAgent } from './operations.js';
import { marketingAgent } from './marketing.js';
import { taxAgent } from './tax.js';
import { marketIntelAgent } from './marketIntel.js';

/** All specialist agents (everything except the coordinator). */
export const specialistAgents = [
  legalAgent,
  researchAgent,
  riskAgent,
  financeAgent,
  screenerAgent,
  dueDiligenceAgent,
  entitlementsAgent,
  designAgent,
  operationsAgent,
  marketingAgent,
  taxAgent,
  marketIntelAgent,
] as const;

/**
 * Create a Coordinator agent with all specialist handoffs wired up.
 * Returns a new Agent instance ready for `Runner.run()`.
 *
 * We clone the coordinator so the module-level export stays handoff-free,
 * allowing callers to wire custom subsets if needed.
 */
export function createConfiguredCoordinator(): Agent {
  return new Agent({
    name: coordinatorAgent.name,
    model: 'gpt-5.2',
    instructions: coordinatorAgent.instructions as string,
    handoffDescription: coordinatorAgent.handoffDescription,
    tools: [...coordinatorAgent.tools],
    handoffs: [...specialistAgents],
  });
}

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

type SpecialistAgentConfig = {
  key: SpecialistAgentKey;
  agent: Agent;
  tools: readonly unknown[];
};

const withTools = (agent: Agent, tools: readonly unknown[]): Agent =>
  agent.clone({ tools: [...tools] as Agent['tools'], handoffs: [] });

const SPECIALIST_AGENT_CONFIGS: SpecialistAgentConfig[] = [
  { key: 'legal', agent: legalAgent, tools: legalTools },
  { key: 'research', agent: researchAgent, tools: researchTools },
  { key: 'risk', agent: riskAgent, tools: riskTools },
  { key: 'finance', agent: financeAgent, tools: financeTools },
  { key: 'screener', agent: screenerAgent, tools: screenerTools },
  { key: 'dueDiligence', agent: dueDiligenceAgent, tools: dueDiligenceTools },
  { key: 'entitlements', agent: entitlementsAgent, tools: entitlementsTools },
  { key: 'design', agent: designAgent, tools: designTools },
  { key: 'operations', agent: operationsAgent, tools: operationsTools },
  { key: 'marketing', agent: marketingAgent, tools: marketingTools },
  { key: 'tax', agent: taxAgent, tools: taxTools },
  { key: 'marketIntel', agent: marketIntelAgent, tools: marketIntelTools },
];

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

import {
  coordinatorTools,
  legalTools,
  researchTools,
  riskTools,
  financeTools,
  screenerTools,
  dueDiligenceTools,
  entitlementsTools,
  marketingTools,
  operationsTools,
  marketIntelTools,
  designTools,
  taxTools,
} from '../tools/index.js';
import {
  QueryIntent,
  SpecialistAgentKey,
  getQueryIntentProfile,
  buildPlannerContext,
} from '../queryRouter.js';

/** All specialist agents (everything except the coordinator). */
export const specialistAgents = SPECIALIST_AGENT_CONFIGS.map((config) => config.agent);

function buildSpecialistTeam(keys: SpecialistAgentKey[]): Agent[] {
  const seen = new Set<SpecialistAgentKey>();
  return keys
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((key) => {
      const config = SPECIALIST_AGENT_CONFIGS.find((entry) => entry.key === key);
      if (!config) {
        throw new Error(`Unknown specialist agent key: ${key}`);
      }
      return withTools(config.agent, config.tools);
    });
}

export function createIntentAwareCoordinator(intent: QueryIntent): Agent {
  const profile = getQueryIntentProfile(intent);
  const specialists = buildSpecialistTeam(profile.specialists);
  const plannerContext = buildPlannerContext(intent);
  const instructions = plannerContext
    ? `${coordinatorAgent.instructions}\n\n${plannerContext}`
    : coordinatorAgent.instructions;

  return coordinatorAgent.clone({
    tools: [...coordinatorTools] as Agent['tools'],
    handoffs: specialists,
    instructions,
  });
}

/**
 * Create a Coordinator agent with all specialist handoffs wired up.
 * Returns a new Agent instance ready for `run()`.
 *
 * We clone every agent so the module-level exports stay tool-free,
 * allowing callers to wire custom subsets if needed.
 */
export function createConfiguredCoordinator(): Agent {
  return createIntentAwareCoordinator('general');
}

import { Agent } from '@openai/agents';
import type { RunContext } from "@openai/agents";
import { coordinatorInputGuardrail } from "../guardrails/inputGuardrails.js";
import { LazyContext } from "./contextLoader.js";
import {
  financeOutputGuardrail,
  legalOutputGuardrail,
} from "../guardrails/outputGuardrails.js";

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
  outputGuardrails?: Agent["outputGuardrails"];
};

type SpecialistConsultToolConfig = {
  key: SpecialistAgentKey;
  toolName: string;
  toolDescription: string;
};

const PARCEL_RESOURCE_TOOLS = new Set([
  "search_parcels",
  "get_parcel_details",
  "screen_flood",
  "screen_soils",
  "screen_wetlands",
  "screen_epa",
  "screen_traffic",
  "screen_ldeq",
  "screen_full",
]);

const SPECIALIST_AGENT_CONFIGS: SpecialistAgentConfig[] = [
  {
    key: "legal",
    agent: legalAgent,
    tools: legalTools,
    outputGuardrails: [legalOutputGuardrail],
  },
  { key: 'research', agent: researchAgent, tools: researchTools },
  { key: 'risk', agent: riskAgent, tools: riskTools },
  {
    key: "finance",
    agent: financeAgent,
    tools: financeTools,
    outputGuardrails: [financeOutputGuardrail],
  },
  { key: 'screener', agent: screenerAgent, tools: screenerTools },
  { key: 'dueDiligence', agent: dueDiligenceAgent, tools: dueDiligenceTools },
  { key: 'entitlements', agent: entitlementsAgent, tools: entitlementsTools },
  { key: 'design', agent: designAgent, tools: designTools },
  { key: 'operations', agent: operationsAgent, tools: operationsTools },
  { key: 'marketing', agent: marketingAgent, tools: marketingTools },
  { key: 'tax', agent: taxAgent, tools: taxTools },
  { key: 'marketIntel', agent: marketIntelAgent, tools: marketIntelTools },
];

const SPECIALIST_CONSULT_TOOLS: SpecialistConsultToolConfig[] = [
  {
    key: "finance",
    toolName: "consult_finance_specialist",
    toolDescription:
      "Consult Finance Agent for focused underwriting/capital-structure questions while the Coordinator retains control.",
  },
  {
    key: "risk",
    toolName: "consult_risk_specialist",
    toolDescription:
      "Consult Risk Agent for focused hazard/compliance/uncertainty checks while the Coordinator retains control.",
  },
  {
    key: "legal",
    toolName: "consult_legal_specialist",
    toolDescription:
      "Consult Legal Agent for focused contract/zoning/legal-risk questions while the Coordinator retains control.",
  },
];

function filterUnsupportedAgentTools(tools: readonly unknown[]): unknown[] {
  return tools.filter((tool) => {
    if (typeof tool !== "object" || tool === null) {
      return true;
    }
    const type = (tool as { type?: unknown }).type;
    return (
      type !== "hosted_tool" &&
      type !== "web_search_preview" &&
      type !== "file_search"
    );
  });
}

function getToolNames(tools: readonly unknown[]): string[] {
  return filterUnsupportedAgentTools(tools)
    .map((tool) =>
      typeof tool === "object" &&
      tool !== null &&
      "name" in tool &&
      typeof (tool as { name?: unknown }).name === "string"
        ? (tool as { name: string }).name
        : null,
    )
    .filter((name): name is string => Boolean(name));
}

function buildSpecialistResourceContext(config: SpecialistAgentConfig): string {
  const toolNames = getToolNames(config.tools);
  if (toolNames.length === 0) return "";

  const lines = [
    "## Runtime Resources",
    `- Tool inventory: ${toolNames.join(", ")}`,
  ];

  const parcelTools = toolNames.filter((name) => PARCEL_RESOURCE_TOOLS.has(name));
  if (parcelTools.length > 0) {
    lines.push(
      "- Parcel intelligence resource pack available via Louisiana Property DB tools:",
      `  ${parcelTools.join(", ")}`,
    );
  }

  return lines.join("\n");
}

function buildSpecialistContextLoader(config: SpecialistAgentConfig): LazyContext {
  return new LazyContext({
    metadata: () =>
      [
        "## Specialist Metadata",
        `- Agent: ${config.agent.name}`,
        `- Domain Key: ${config.key}`,
        `- Handoff Scope: ${config.agent.handoffDescription}`,
      ].join("\n"),
    body: async ({ runContext, agent }) => {
      if (typeof config.agent.instructions === "string") {
        return config.agent.instructions;
      }
      if (!runContext || !agent) {
        return "";
      }
      return config.agent.instructions(
        runContext as RunContext<unknown>,
        agent as Agent,
      );
    },
    resources: () => buildSpecialistResourceContext(config),
  });
}

const SPECIALIST_CONTEXT_LOADERS = new Map<SpecialistAgentKey, LazyContext>(
  SPECIALIST_AGENT_CONFIGS.map((config) => [
    config.key,
    buildSpecialistContextLoader(config),
  ]),
);

function withTools(config: SpecialistAgentConfig): Agent {
  initAgentsSentry();
  const contextLoader = SPECIALIST_CONTEXT_LOADERS.get(config.key);
  if (!contextLoader) {
    throw new Error(`Missing context loader for specialist ${config.key}`);
  }

  return config.agent.clone({
    tools: instrumentAgentTools(
      config.agent.name,
      filterUnsupportedAgentTools([...config.tools]),
    ) as Agent["tools"],
    handoffs: [],
    outputGuardrails: [...(config.outputGuardrails ?? [])] as Agent["outputGuardrails"],
    instructions: async (runContext, agent) => {
      const composed = await contextLoader.compose(
        {
          runContext: runContext as RunContext<unknown>,
          agent: agent as Agent,
        },
        { includeResources: true },
      );
      if (composed) return composed;
      return typeof config.agent.instructions === "string"
        ? config.agent.instructions
        : "";
    },
  });
}

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
import { initAgentsSentry, instrumentAgentTools } from "../sentry.js";

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
      return withTools(config);
    });
}

function buildSpecialistConsultTools(specialists: Agent[]): Agent["tools"] {
  const specialistByName = new Map(specialists.map((agent) => [agent.name, agent]));
  const specialistByKey = new Map<SpecialistAgentKey, Agent>(
    SPECIALIST_AGENT_CONFIGS.map((config) => [config.key, specialistByName.get(config.agent.name) ?? withTools(config)]),
  );

  return SPECIALIST_CONSULT_TOOLS.map((toolConfig) => {
    const specialist = specialistByKey.get(toolConfig.key);
    if (!specialist) {
      throw new Error(`Missing specialist for consult tool: ${toolConfig.key}`);
    }
    return specialist.asTool({
      toolName: toolConfig.toolName,
      toolDescription: toolConfig.toolDescription,
    });
  }) as Agent["tools"];
}

export function createIntentAwareCoordinator(intent: QueryIntent): Agent {
  initAgentsSentry();
  const profile = getQueryIntentProfile(intent);
  const specialists = buildSpecialistTeam(profile.specialists);
  const consultTools = buildSpecialistConsultTools(specialists);
  const plannerContext = buildPlannerContext(intent);
  const instructions = plannerContext
    ? `${coordinatorAgent.instructions}\n\n${plannerContext}`
    : coordinatorAgent.instructions;

  return coordinatorAgent.clone({
    tools: instrumentAgentTools(
      coordinatorAgent.name,
      filterUnsupportedAgentTools([...coordinatorTools, ...consultTools]),
    ) as Agent["tools"],
    handoffs: specialists,
    instructions,
    inputGuardrails: [coordinatorInputGuardrail] as Agent["inputGuardrails"],
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

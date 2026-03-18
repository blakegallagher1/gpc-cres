import { Agent, type RunContext } from "@openai/agents";

import { coordinatorInputGuardrail } from "../guardrails/inputGuardrails.js";
import {
  financeOutputGuardrail,
  legalOutputGuardrail,
} from "../guardrails/outputGuardrails.js";
import {
  buildPlannerContext,
  getQueryIntentProfile,
  type QueryIntent,
  type SpecialistAgentKey,
} from "../queryRouter.js";
import { initAgentsSentry, instrumentAgentTools } from "../sentry.js";
import {
  acquisition_cap_rate_evaluation,
  acquisition_dcf_analysis,
  acquisition_internal_comparable_sales,
  acquisition_investment_returns,
  acquisition_rent_roll_analysis,
  asset_capital_plan_summary,
  asset_lease_admin_summary,
  asset_noi_optimization_plan,
  asset_operations_health,
  asset_tenant_exposure_analysis,
  capital_debt_sizing_overview,
  capital_disposition_analysis,
  capital_lender_outreach_brief,
  capital_refinance_scenarios,
  capital_stack_optimization,
  compare_document_vs_deal_terms,
  coordinatorTools,
  designTools,
  dueDiligenceTools,
  entitlementsTools,
  financeTools,
  getDealContext,
  get_document_extraction_summary,
  get_rent_roll,
  get_shared_context,
  legalTools,
  log_reasoning_trace,
  marketIntelTools,
  marketTrajectoryTools,
  marketingTools,
  model_capital_stack,
  operationsTools,
  query_document_extractions,
  researchTools,
  riskTools,
  screenerTools,
  search_procedural_skills,
  search_similar_episodes,
  search_knowledge_base,
  share_analysis_finding,
  taxTools,
  store_knowledge_entry,
  assess_uncertainty,
  buildGoogleMapsMcpServerTool,
} from "../tools/index.js";
import { LazyContext } from "./contextLoader.js";

export { coordinatorAgent, COORDINATOR_INSTRUCTIONS } from "./coordinator.js";
export { acquisitionUnderwritingAgent } from "./acquisition-underwriting.js";
export { assetManagementAgent } from "./asset-management.js";
export { capitalMarketsAgent } from "./capital-markets.js";
export { designAgent } from "./design.js";
export { dueDiligenceAgent } from "./dueDiligence.js";
export { entitlementsAgent } from "./entitlements.js";
export { financeAgent } from "./finance.js";
export { legalAgent } from "./legal.js";
export { marketIntelAgent } from "./marketIntel.js";
export { marketingAgent } from "./marketing.js";
export { operationsAgent } from "./operations.js";
export { researchAgent } from "./research.js";
export { riskAgent } from "./risk.js";
export { screenerAgent } from "./screener.js";
export { taxAgent } from "./tax.js";
export { marketTrajectoryAgent } from "./marketTrajectory.js";

import { coordinatorAgent } from "./coordinator.js";
import { acquisitionUnderwritingAgent } from "./acquisition-underwriting.js";
import { assetManagementAgent } from "./asset-management.js";
import { capitalMarketsAgent } from "./capital-markets.js";
import { designAgent } from "./design.js";
import { dueDiligenceAgent } from "./dueDiligence.js";
import { entitlementsAgent } from "./entitlements.js";
import { financeAgent } from "./finance.js";
import { legalAgent } from "./legal.js";
import { marketIntelAgent } from "./marketIntel.js";
import { marketTrajectoryAgent } from "./marketTrajectory.js";
import { marketingAgent } from "./marketing.js";
import { operationsAgent } from "./operations.js";
import { researchAgent } from "./research.js";
import { riskAgent } from "./risk.js";
import { screenerAgent } from "./screener.js";
import { taxAgent } from "./tax.js";

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

const SPECIALIST_INTENT_MAP: Record<SpecialistAgentKey, QueryIntent> = {
  legal: "legal",
  research: "research",
  risk: "risk",
  finance: "finance",
  screener: "screener",
  dueDiligence: "due_diligence",
  entitlements: "entitlements",
  design: "design",
  operations: "operations",
  marketing: "marketing",
  tax: "tax",
  marketIntel: "market_intel",
  marketTrajectory: "market_trajectory",
  acquisitionUnderwriting: "acquisition_underwriting",
  assetManagement: "asset_management",
  capitalMarkets: "capital_markets",
};

export const SPECIALIST_CONSULT_TOOLS: SpecialistConsultToolConfig[] = [
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
  {
    key: "marketTrajectory",
    toolName: "consult_market_trajectory_specialist",
    toolDescription:
      "Consult Market Trajectory Agent for neighborhood growth analysis, permit activity mapping, and gentrification indicator tracking.",
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

function withTools(config: SpecialistAgentConfig): Agent {
  initAgentsSentry();
  const contextLoader = buildSpecialistContextLoader(config);
  const googleMapsMcpTool = buildGoogleMapsMcpServerTool({
    intent: SPECIALIST_INTENT_MAP[config.key],
  });

  return config.agent.clone({
    tools: instrumentAgentTools(
      config.agent.name,
      filterUnsupportedAgentTools([
        ...config.tools,
        ...(googleMapsMcpTool ? [googleMapsMcpTool] : []),
      ]),
    ) as Agent["tools"],
    handoffs: [],
    outputGuardrails: [
      ...(config.outputGuardrails ?? []),
    ] as Agent["outputGuardrails"],
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

function buildSpecialistAgentConfigs(): SpecialistAgentConfig[] {
  const acquisitionTools = [
    getDealContext,
    acquisition_dcf_analysis,
    acquisition_cap_rate_evaluation,
    acquisition_rent_roll_analysis,
    acquisition_internal_comparable_sales,
    acquisition_investment_returns,
    get_document_extraction_summary,
    query_document_extractions,
    compare_document_vs_deal_terms,
    search_knowledge_base,
    search_procedural_skills,
    search_similar_episodes,
    store_knowledge_entry,
    share_analysis_finding,
    get_shared_context,
    assess_uncertainty,
    log_reasoning_trace,
  ] as const;

  const assetManagementTools = [
    getDealContext,
    get_rent_roll,
    asset_lease_admin_summary,
    asset_tenant_exposure_analysis,
    asset_noi_optimization_plan,
    asset_capital_plan_summary,
    asset_operations_health,
    search_knowledge_base,
    search_procedural_skills,
    search_similar_episodes,
    store_knowledge_entry,
    share_analysis_finding,
    get_shared_context,
    log_reasoning_trace,
  ] as const;

  const capitalMarketsTools = [
    getDealContext,
    get_rent_roll,
    model_capital_stack,
    capital_debt_sizing_overview,
    capital_lender_outreach_brief,
    capital_disposition_analysis,
    capital_refinance_scenarios,
    capital_stack_optimization,
    get_document_extraction_summary,
    query_document_extractions,
    compare_document_vs_deal_terms,
    search_knowledge_base,
    search_procedural_skills,
    search_similar_episodes,
    store_knowledge_entry,
    share_analysis_finding,
    get_shared_context,
    log_reasoning_trace,
  ] as const;

  return [
    {
      key: "legal",
      agent: legalAgent,
      tools: legalTools,
      outputGuardrails: [legalOutputGuardrail],
    },
    {
      key: "research",
      agent: researchAgent,
      tools: researchTools,
    },
    {
      key: "risk",
      agent: riskAgent,
      tools: riskTools,
    },
    {
      key: "finance",
      agent: financeAgent,
      tools: financeTools,
      outputGuardrails: [financeOutputGuardrail],
    },
    {
      key: "screener",
      agent: screenerAgent,
      tools: screenerTools,
    },
    {
      key: "dueDiligence",
      agent: dueDiligenceAgent,
      tools: dueDiligenceTools,
    },
    {
      key: "entitlements",
      agent: entitlementsAgent,
      tools: entitlementsTools,
    },
    {
      key: "design",
      agent: designAgent,
      tools: designTools,
    },
    {
      key: "operations",
      agent: operationsAgent,
      tools: operationsTools,
    },
    {
      key: "marketing",
      agent: marketingAgent,
      tools: marketingTools,
    },
    {
      key: "tax",
      agent: taxAgent,
      tools: taxTools,
    },
    {
      key: "marketIntel",
      agent: marketIntelAgent,
      tools: marketIntelTools,
    },
    {
      key: "marketTrajectory",
      agent: marketTrajectoryAgent,
      tools: marketTrajectoryTools,
    },
    {
      key: "acquisitionUnderwriting",
      agent: acquisitionUnderwritingAgent,
      tools: acquisitionTools,
      outputGuardrails: [financeOutputGuardrail],
    },
    {
      key: "assetManagement",
      agent: assetManagementAgent,
      tools: assetManagementTools,
    },
    {
      key: "capitalMarkets",
      agent: capitalMarketsAgent,
      tools: capitalMarketsTools,
      outputGuardrails: [financeOutputGuardrail],
    },
  ];
}

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
  marketTrajectoryAgent,
  acquisitionUnderwritingAgent,
  assetManagementAgent,
  capitalMarketsAgent,
];

function buildSpecialistTeam(keys: readonly SpecialistAgentKey[]): Agent[] {
  const configs = buildSpecialistAgentConfigs();
  const configByKey = new Map(configs.map((config) => [config.key, config]));
  const seen = new Set<SpecialistAgentKey>();

  return keys
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((key) => {
      const config = configByKey.get(key);
      if (!config) {
        throw new Error(`Unknown specialist agent key: ${key}`);
      }
      return withTools(config);
    });
}

function buildSpecialistConsultTools(
  configs: readonly SpecialistAgentConfig[],
  specialists: readonly Agent[],
): Agent["tools"] {
  const specialistByName = new Map(specialists.map((agent) => [agent.name, agent]));
  const configByKey = new Map(configs.map((config) => [config.key, config]));

  return SPECIALIST_CONSULT_TOOLS.map((toolConfig) => {
    const config = configByKey.get(toolConfig.key);
    if (!config) {
      throw new Error(`Missing specialist config for consult tool: ${toolConfig.key}`);
    }

    const specialist =
      specialistByName.get(config.agent.name) ?? withTools(config);

    return specialist.asTool({
      toolName: toolConfig.toolName,
      toolDescription: toolConfig.toolDescription,
    });
  }) as Agent["tools"];
}

export function createIntentAwareCoordinator(intent: QueryIntent): Agent<unknown, any> {
  return createConfiguredCoordinator({ intent });
}

/**
 * Create a Coordinator agent with all specialist handoffs wired up.
 * Returns a new Agent instance ready for `run()`.
 *
 * We clone every agent so the module-level exports stay tool-free,
 * allowing callers to wire custom subsets if needed.
 */
export function createConfiguredCoordinator(options?: {
  intent?: QueryIntent;
}): Agent<unknown, any> {
  initAgentsSentry();

  const intent = options?.intent ?? "general";
  const profile = getQueryIntentProfile(intent);
  const specialistConfigs = buildSpecialistAgentConfigs();
  const specialists = buildSpecialistTeam(profile.specialists);
  const consultTools = buildSpecialistConsultTools(specialistConfigs, specialists);
  const plannerContext = buildPlannerContext(intent);
  const googleMapsMcpTool = buildGoogleMapsMcpServerTool({ intent });
  const instructions = plannerContext
    ? `${coordinatorAgent.instructions}\n\n${plannerContext}`
    : coordinatorAgent.instructions;

  return coordinatorAgent.clone({
    tools: instrumentAgentTools(
      coordinatorAgent.name,
      filterUnsupportedAgentTools([
        ...coordinatorTools,
        ...consultTools,
        ...(googleMapsMcpTool ? [googleMapsMcpTool] : []),
      ]),
    ) as Agent["tools"],
    handoffs: specialists,
    instructions,
    inputGuardrails: [coordinatorInputGuardrail] as Agent["inputGuardrails"],
  });
}

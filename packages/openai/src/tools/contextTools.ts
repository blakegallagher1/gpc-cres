import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * Cross-agent context sharing tools.
 *
 * These tools enable specialists to share findings with each other through
 * a shared analysis context, moving toward more collaborative multi-agent
 * reasoning instead of purely hierarchical coordinator-mediated communication.
 *
 * The shared context acts as a working memory that any agent can read from
 * or write to during a deal analysis session.
 */

/**
 * share_analysis_finding — allows any specialist agent to publish a finding
 * to the shared analysis context so other agents can reference it.
 */
export const share_analysis_finding = tool({
  name: "share_analysis_finding",
  description:
    "Publish an analysis finding to the shared context so other specialist agents can " +
    "reference it. Use this when you discover something that would be relevant to other " +
    "agents' analyses — for example, Risk agent discovering flood zone issues that " +
    "Finance should factor into insurance costs, or Research finding market data that " +
    "Design should consider for site planning. Include a confidence level and any caveats.",
  parameters: z.object({
    deal_id: z
      .string()
      .describe("The deal ID this finding relates to."),
    category: z
      .enum([
        "risk_factor",
        "market_insight",
        "financial_constraint",
        "legal_requirement",
        "design_constraint",
        "timeline_impact",
        "cost_impact",
        "opportunity",
      ])
      .describe("Category of the finding for routing to relevant agents."),
    finding: z
      .string()
      .describe(
        "Clear, specific description of the finding. Include quantitative data where available."
      ),
    confidence: z
      .enum(["high", "medium", "low"])
      .describe("Confidence level in this finding based on evidence quality."),
    source_agent: z
      .string()
      .describe("Name of the agent publishing this finding."),
    affected_agents: z
      .array(z.string())
      .nullable()
      .describe(
        "List of agent names that should pay attention to this finding. " +
        "Pass null to broadcast to all agents."
      ),
    evidence_refs: z
      .array(z.string())
      .nullable()
      .describe("Optional evidence reference IDs supporting this finding."),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _sharedContextWrite: true,
      dealId: params.deal_id,
      category: params.category,
      finding: params.finding,
      confidence: params.confidence,
      sourceAgent: params.source_agent,
      affectedAgents: params.affected_agents ?? null,
      evidenceRefs: params.evidence_refs ?? [],
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * get_shared_context — retrieves findings published by other agents
 * for a specific deal, optionally filtered by category or source.
 */
export const get_shared_context = tool({
  name: "get_shared_context",
  description:
    "Retrieve analysis findings shared by other specialist agents for a deal. " +
    "Use this at the start of your analysis to check what other agents have already " +
    "discovered, and periodically during analysis to incorporate new findings. " +
    "This enables collaborative reasoning where each agent builds on others' work " +
    "instead of analyzing in isolation.",
  parameters: z.object({
    deal_id: z
      .string()
      .describe("The deal ID to retrieve shared context for."),
    categories: z
      .array(
        z.enum([
          "risk_factor",
          "market_insight",
          "financial_constraint",
          "legal_requirement",
          "design_constraint",
          "timeline_impact",
          "cost_impact",
          "opportunity",
        ])
      )
      .nullable()
      .describe(
        "Filter by finding categories. Pass null to get all categories."
      ),
    min_confidence: z
      .enum(["high", "medium", "low"])
      .nullable()
      .describe(
        "Minimum confidence level to include. 'high' returns only high-confidence findings. " +
        "Pass null to include all confidence levels."
      ),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _sharedContextRead: true,
      dealId: params.deal_id,
      categories: params.categories ?? null,
      minConfidence: params.min_confidence ?? null,
    });
  },
});

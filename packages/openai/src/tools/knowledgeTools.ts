import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * search_knowledge_base — searches the firm's historical knowledge base using
 * vector similarity to find relevant past deals, analyses, and learnings.
 * Available to ALL agents.
 *
 * Enhanced: Now supports contextual queries with deal-specific context injection,
 * temporal relevance weighting, and cross-referencing capabilities to enable
 * genuine institutional memory.
 */
export const search_knowledge_base = tool({
  name: "search_knowledge_base",
  description:
    "Search the firm's historical knowledge base for relevant past deals, analyses, " +
    "and learnings using semantic similarity. Use this when analyzing a new deal to find " +
    "patterns from similar past deals, check for precedent in entitlement decisions, " +
    "reference market analyses, or recall past agent findings. Results include the " +
    "matched text, source type, similarity score, and temporal relevance. " +
    "IMPORTANT: Always search the knowledge base before making recommendations to " +
    "check for relevant precedent and avoid repeating past mistakes.",
  parameters: z.object({
    query: z
      .string()
      .describe("Natural language search query describing what you're looking for."),
    content_types: z
      .array(
        z.enum([
          "deal_memo",
          "agent_analysis",
          "document_extraction",
          "market_report",
          "user_note",
          "outcome_record",
          "reasoning_trace",
        ])
      )
      .nullable()
      .describe(
        "Optional filter by content type. Pass null to search all types. " +
        "New types: 'outcome_record' for historical deal results, " +
        "'reasoning_trace' for past agent reasoning chains."
      ),
    limit: z
      .number()
      .nullable()
      .describe("Maximum number of results to return (default 5)."),
    deal_context: z
      .object({
        parish: z.string().nullable().describe("Parish name for geographic relevance."),
        sku_type: z.string().nullable().describe("SKU type for use-case relevance."),
        deal_status: z.string().nullable().describe("Current deal status for stage relevance."),
      })
      .nullable()
      .describe(
        "Optional deal context to boost relevance scoring. " +
        "Providing context helps find more relevant precedents."
      ),
    recency_weight: z
      .enum(["none", "moderate", "strong"])
      .nullable()
      .describe(
        "How much to weight recent entries over older ones. " +
        "'strong' heavily favors recent data (useful for market conditions). " +
        "'none' treats all entries equally (useful for legal/regulatory precedent). " +
        "Default: 'moderate'."
      ),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _knowledgeSearch: true,
      query: params.query,
      contentTypes: params.content_types ?? null,
      limit: params.limit ?? 5,
      dealContext: params.deal_context ?? null,
      recencyWeight: params.recency_weight ?? "moderate",
    });
  },
});

/**
 * store_knowledge_entry — allows agents to persist learnings, analysis
 * conclusions, and reasoning traces to the knowledge base for future reference.
 */
export const store_knowledge_entry = tool({
  name: "store_knowledge_entry",
  description:
    "Store a learning, analysis conclusion, or reasoning trace in the knowledge base " +
    "for future reference. Use this when you discover a pattern, reach an important " +
    "conclusion, or learn something that would be valuable for future deal analyses. " +
    "This builds the firm's institutional memory over time.",
  parameters: z.object({
    content_type: z
      .enum([
        "agent_analysis",
        "market_report",
        "outcome_record",
        "reasoning_trace",
      ])
      .describe("Type of knowledge being stored."),
    title: z
      .string()
      .describe("Short descriptive title for this knowledge entry."),
    content: z
      .string()
      .describe("The knowledge content to store. Be specific and include quantitative data."),
    deal_id: z
      .string()
      .nullable()
      .describe("Associated deal ID, if applicable."),
    parish: z
      .string()
      .nullable()
      .describe("Associated parish, if applicable."),
    sku_type: z
      .string()
      .nullable()
      .describe("Associated SKU type, if applicable."),
    tags: z
      .array(z.string())
      .nullable()
      .describe("Searchable tags for categorization."),
    source_agent: z
      .string()
      .describe("Name of the agent storing this knowledge."),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _knowledgeStore: true,
      contentType: params.content_type,
      title: params.title,
      content: params.content,
      dealId: params.deal_id ?? null,
      parish: params.parish ?? null,
      skuType: params.sku_type ?? null,
      tags: params.tags ?? [],
      sourceAgent: params.source_agent,
      timestamp: new Date().toISOString(),
    });
  },
});

import { tool } from "@openai/agents";
import { z } from "zod";
import { buildMemoryToolHeaders } from "./memoryTools";

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
      .optional().nullable()
      .describe(
        "Optional filter by content type. Pass null to search all types. " +
        "New types: 'outcome_record' for historical deal results, " +
        "'reasoning_trace' for past agent reasoning chains."
      ),
    limit: z
      .number()
      .optional().nullable()
      .describe("Maximum number of results to return (default 5)."),
    deal_context: z
      .object({
        parish: z.string().optional().nullable().describe("Parish name for geographic relevance."),
        sku_type: z.string().optional().nullable().describe("SKU type for use-case relevance."),
        deal_status: z.string().optional().nullable().describe("Current deal status for stage relevance."),
      })
      .optional().nullable()
      .describe(
        "Optional deal context to boost relevance scoring. " +
        "Providing context helps find more relevant precedents."
      ),
    recency_weight: z
      .enum(["none", "moderate", "strong"])
      .optional().nullable()
      .describe(
        "How much to weight recent entries over older ones. " +
        "'strong' heavily favors recent data (useful for market conditions). " +
        "'none' treats all entries equally (useful for legal/regulatory precedent). " +
        "Default: 'moderate'."
      ),
  }),
  execute: async (params, context) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
      const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
      const qs = new URLSearchParams({ view: "search", q: params.query });
      if (params.limit) qs.set("limit", String(params.limit));
      if (params.content_types?.length) qs.set("types", params.content_types.join(","));
      const resp = await fetch(`${url}/api/knowledge?${qs.toString()}`, {
        method: "GET",
        headers: buildMemoryToolHeaders(context),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return `Knowledge search failed: ${resp.status} ${errBody}`;
      }
      const data = await resp.json() as { results?: unknown[] };
      if (!data.results || data.results.length === 0) {
        return "No relevant knowledge found for this query.";
      }
      return JSON.stringify(data.results);
    } catch (err) {
      return `Knowledge search error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

/**
 * store_knowledge_entry — allows agents to persist learnings, analysis
 * conclusions, and reasoning traces to the knowledge base for future reference.
 */
export const store_knowledge_entry = tool({
  name: "store_knowledge_entry",
  description:
    "Store an agent analysis pattern, reasoning trace, or general conclusion in the knowledge base. " +
    "NOT for property-specific facts (comps, prices, cap rates, NOI, lender terms, tour notes) — " +
    "use store_memory for those. This tool is for meta-level insights, analytical patterns, and " +
    "reasoning chains that inform future deal analyses.",
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
      .optional().nullable()
      .describe("Associated deal ID, if applicable."),
    parish: z
      .string()
      .optional().nullable()
      .describe("Associated parish, if applicable."),
    sku_type: z
      .string()
      .optional().nullable()
      .describe("Associated SKU type, if applicable."),
    tags: z
      .array(z.string())
      .optional().nullable()
      .describe("Searchable tags for categorization."),
    source_agent: z
      .string()
      .describe("Name of the agent storing this knowledge."),
  }),
  execute: async (params, context) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
      const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
      const sourceId = `${params.source_agent}:${params.title.slice(0, 60).replace(/\s+/g, "-").toLowerCase()}`;
      const contentText = `${params.title}\n\n${params.content}`;
      const resp = await fetch(`${url}/api/knowledge`, {
        method: "POST",
        headers: buildMemoryToolHeaders(context),
        body: JSON.stringify({
          action: "ingest",
          contentType: params.content_type,
          sourceId,
          contentText,
          metadata: {
            title: params.title,
            dealId: params.deal_id ?? null,
            parish: params.parish ?? null,
            skuType: params.sku_type ?? null,
            tags: params.tags ?? [],
            sourceAgent: params.source_agent,
          },
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text();
        return `Knowledge store failed: ${resp.status} ${errBody}`;
      }
      const data = await resp.json() as { chunks?: number };
      const chunks = data.chunks ?? 1;
      return `Stored "${params.title}" (${chunks} chunk${chunks !== 1 ? "s" : ""}).`;
    } catch (err) {
      return `Knowledge store error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

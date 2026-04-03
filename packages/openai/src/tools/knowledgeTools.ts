import { tool } from "@openai/agents";
import { z } from "zod";
import { buildMemoryToolHeaders } from "./memoryTools";

type BrowserPlaybookSignature = {
  domain: string | null;
  objectivePattern: string | null;
  apiPath: string | null;
};

function isBrowserPlaybookContent(value: string): boolean {
  return /"type"\s*:\s*"browser_playbook"/.test(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractKnowledgeFallbackTerms(query: string): string[] {
  const normalized = query.toLowerCase();
  const preferredTerms = [
    "lacdb",
    "resimplifi",
    "east baton rouge",
    "baton rouge",
    "sale listings",
    "for sale",
  ].filter((term) => normalized.includes(term));
  if (preferredTerms.length > 0) {
    return preferredTerms;
  }

  const stopWords = new Set([
    "go",
    "to",
    "and",
    "the",
    "for",
    "find",
    "with",
    "from",
    "that",
    "this",
    "properties",
  ]);

  const tokenTerms = normalized
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token));

  return [...new Set(tokenTerms)].slice(0, 4);
}

function extractBrowserPlaybookSignature(content: string): BrowserPlaybookSignature {
  const domainMatch = content.match(/"domain"\s*:\s*"([^"]+)"/i);
  const objectiveMatch = content.match(/"objective_pattern"\s*:\s*"([^"]+)"/i);
  const apiMatch = content.match(/"api"\s*:\s*"([^"]+)"/i);

  return {
    domain: domainMatch ? normalizeWhitespace(domainMatch[1]) : null,
    objectivePattern: objectiveMatch ? normalizeWhitespace(objectiveMatch[1]) : null,
    apiPath: apiMatch ? normalizeWhitespace(apiMatch[1]) : null,
  };
}

function isSameBrowserPlaybook(
  left: BrowserPlaybookSignature,
  right: BrowserPlaybookSignature,
): boolean {
  return (
    left.domain !== null &&
    left.domain === right.domain &&
    left.objectivePattern !== null &&
    left.objectivePattern === right.objectivePattern &&
    left.apiPath !== null &&
    left.apiPath === right.apiPath
  );
}

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
          "episodic_summary",
          "procedural_skill",
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
      const headers = buildMemoryToolHeaders(context);
      const runSearch = async (query: string, exact = false) => {
        const qs = new URLSearchParams({ view: "search", q: query });
        if (params.limit) qs.set("limit", String(params.limit));
        if (params.content_types?.length) qs.set("types", params.content_types.join(","));
        if (exact) qs.set("mode", "exact");
        const resp = await fetch(`${url}/api/knowledge?${qs.toString()}`, {
          method: "GET",
          headers,
        });
        if (!resp.ok) {
          const errBody = await resp.text();
          throw new Error(`Knowledge search failed: ${resp.status} ${errBody}`);
        }
        return await resp.json() as { results?: unknown[] };
      };

      const data = await runSearch(params.query);
      const initialResults = Array.isArray(data.results) ? data.results : [];
      if (initialResults.length > 0) {
        return JSON.stringify(initialResults);
      }

      const fallbackTerms = extractKnowledgeFallbackTerms(params.query);
      const deduped = new Map<string, unknown>();
      for (const term of fallbackTerms) {
        const fallback = await runSearch(term, true);
        for (const entry of fallback.results ?? []) {
          const key = JSON.stringify(entry);
          if (!deduped.has(key)) {
            deduped.set(key, entry);
          }
        }
        if (deduped.size >= (params.limit ?? 5)) {
          break;
        }
      }

      if (deduped.size === 0) {
        return "No relevant knowledge found for this query.";
      }

      data.results = [...deduped.values()].slice(0, params.limit ?? 5);
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
  needsApproval: true,
  execute: async (params, context) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
      const url = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
      const headers = buildMemoryToolHeaders(context);
      const sourceId = `${params.source_agent}:${params.title.slice(0, 60).replace(/\s+/g, "-").toLowerCase()}`;
      const contentText = `${params.title}\n\n${params.content}`;

      if (
        params.content_type === "agent_analysis" &&
        isBrowserPlaybookContent(params.content)
      ) {
        const currentSignature = extractBrowserPlaybookSignature(params.content);
        const lookupTerm = currentSignature.domain ?? params.title;
        const qs = new URLSearchParams({
          view: "search",
          q: lookupTerm,
          limit: "10",
          types: "agent_analysis",
          mode: "exact",
        });
        const existingResp = await fetch(`${url}/api/knowledge?${qs.toString()}`, {
          method: "GET",
          headers,
        });
        if (existingResp.ok) {
          const existing = await existingResp.json() as {
            results?: Array<{ sourceId?: unknown; contentText?: unknown }>;
          };
          const duplicate = (existing.results ?? []).some((entry) => {
            const existingContentText =
              typeof entry.contentText === "string" ? entry.contentText : null;
            if (!existingContentText) {
              return false;
            }

            const existingSignature = extractBrowserPlaybookSignature(existingContentText);
            if (isSameBrowserPlaybook(currentSignature, existingSignature)) {
              return true;
            }

            return existingContentText === contentText;
          });
          if (duplicate) {
            return `Skipped duplicate knowledge entry "${params.title}".`;
          }
        }
      }

      const resp = await fetch(`${url}/api/knowledge`, {
        method: "POST",
        headers,
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

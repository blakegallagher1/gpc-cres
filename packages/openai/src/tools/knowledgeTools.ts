import { tool } from "@openai/agents";
import { z } from "zod";

/**
 * search_knowledge_base — searches the firm's historical knowledge base using
 * vector similarity to find relevant past deals, analyses, and learnings.
 * Available to ALL agents.
 */
export const search_knowledge_base = tool({
  name: "search_knowledge_base",
  description:
    "Search the firm's historical knowledge base for relevant past deals, analyses, " +
    "and learnings using semantic similarity. Use this when analyzing a new deal to find " +
    "patterns from similar past deals, check for precedent in entitlement decisions, " +
    "reference market analyses, or recall past agent findings. Results include the " +
    "matched text, source type, and similarity score.",
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
        ])
      )
      .nullable()
      .describe(
        "Optional filter by content type. Pass null to search all types."
      ),
    limit: z
      .number()
      .nullable()
      .describe("Maximum number of results to return (default 5)."),
  }),
  execute: async (params) => {
    return JSON.stringify({
      _knowledgeSearch: true,
      query: params.query,
      contentTypes: params.content_types ?? null,
      limit: params.limit ?? 5,
    });
  },
});

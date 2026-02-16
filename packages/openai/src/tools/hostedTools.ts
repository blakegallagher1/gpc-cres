import type OpenAI from "openai";

/**
 * Hosted Responses API tool declarations used across agents.
 * These tools are OpenAI-managed and require no execute() implementation.
 */
export const hostedWebSearchPreviewTool = {
  type: "web_search_preview" as const,
  search_context_size: "medium" as const,
} satisfies OpenAI.Responses.WebSearchPreviewTool;

/**
 * File search declaration for vector-store backed document retrieval.
 * Kept available for agent wiring once vector store IDs are provisioned.
 */
export const hostedFileSearchTool = {
  type: "file_search" as const,
} as const;

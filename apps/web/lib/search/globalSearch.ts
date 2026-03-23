import { z } from "zod";

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
export const GLOBAL_SEARCH_DEFAULT_LIMIT = 5;
export const GLOBAL_SEARCH_MAX_LIMIT = 8;

export const globalSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(
      GLOBAL_SEARCH_MIN_QUERY_LENGTH,
      `q must be at least ${GLOBAL_SEARCH_MIN_QUERY_LENGTH} characters`,
    ),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(GLOBAL_SEARCH_MAX_LIMIT)
    .default(GLOBAL_SEARCH_DEFAULT_LIMIT),
});

export type GlobalSearchSource =
  | "deals"
  | "parcels"
  | "knowledge"
  | "runs"
  | "conversations";

export interface GlobalSearchDealResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchParcelResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchKnowledgeResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchRunResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchConversationResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchResponse {
  query: string;
  limit: number;
  groups: {
    deals: GlobalSearchDealResult[];
    parcels: GlobalSearchParcelResult[];
    knowledge: GlobalSearchKnowledgeResult[];
    runs: GlobalSearchRunResult[];
    conversations: GlobalSearchConversationResult[];
  };
  errors: Partial<Record<GlobalSearchSource, string>>;
}

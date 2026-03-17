import {
  deleteKnowledge,
  ingestKnowledge,
  searchKnowledgeBase,
  type KnowledgeSearchResult,
} from "./knowledgeBase.service";

const MAP_CONTEXT_BLOCK_PATTERN = /\[Map Context\][\s\S]*?\[\/Map Context\]\s*/gi;
const MAX_CONTEXT_RESULTS = 4;
const MAX_CONTEXT_SNIPPET_LENGTH = 280;
const MIN_RETRIEVAL_QUERY_LENGTH = 12;

const DOMAIN_KEYWORDS = [
  {
    domain: "strategy",
    keywords: [
      "moat",
      "strategy",
      "roadmap",
      "product",
      "vision",
      "growth",
      "business model",
      "positioning",
      "operating system",
    ],
  },
  {
    domain: "operations",
    keywords: [
      "workflow",
      "process",
      "automation",
      "system",
      "ops",
      "sop",
      "task",
      "dashboard",
      "implementation",
      "team",
    ],
  },
  {
    domain: "entitlement",
    keywords: [
      "entitlement",
      "zoning",
      "variance",
      "permit",
      "planning",
      "parish",
      "rezoning",
      "hearing",
      "commission",
      "site plan",
    ],
  },
  {
    domain: "acquisition",
    keywords: [
      "acquisition",
      "seller",
      "owner",
      "purchase",
      "contract",
      "loi",
      "parcel",
      "site",
      "sourcing",
      "origination",
    ],
  },
  {
    domain: "underwriting",
    keywords: [
      "underwriting",
      "pro forma",
      "rent",
      "expense",
      "noi",
      "cap rate",
      "yield",
      "irr",
      "dscr",
      "cash flow",
    ],
  },
  {
    domain: "capital",
    keywords: [
      "capital",
      "equity",
      "debt",
      "loan",
      "lender",
      "financing",
      "refinance",
      "investor",
      "lp",
      "gp",
    ],
  },
  {
    domain: "buyers",
    keywords: [
      "buyer",
      "disposition",
      "teaser",
      "outreach",
      "broker",
      "bid",
      "marketing process",
      "exit",
    ],
  },
  {
    domain: "marketing",
    keywords: [
      "marketing",
      "brand",
      "website",
      "seo",
      "content",
      "email",
      "lead magnet",
      "campaign",
    ],
  },
  {
    domain: "finance",
    keywords: [
      "budget",
      "tax",
      "cash",
      "burn",
      "accounting",
      "payroll",
      "expense",
      "bank",
    ],
  },
  {
    domain: "hiring",
    keywords: [
      "hire",
      "hiring",
      "candidate",
      "employee",
      "recruiter",
      "talent",
      "interview",
    ],
  },
  {
    domain: "relationships",
    keywords: [
      "planner",
      "attorney",
      "broker",
      "buyer",
      "lender",
      "partner",
      "city",
      "parish staff",
      "seller",
    ],
  },
] as const;

export type BusinessDomain =
  | (typeof DOMAIN_KEYWORDS)[number]["domain"]
  | "general";

export type BusinessMemoryCaptureKind =
  | "preference"
  | "goal"
  | "directive"
  | "relationship_signal"
  | "process_note"
  | "market_observation"
  | "idea"
  | "fact";

export type BusinessMemoryCaptureInput = {
  orgId: string;
  userId: string;
  messageId: string;
  messageText: string;
  conversationId?: string | null;
  dealId?: string | null;
  createdAt?: Date;
};

export type BusinessMemoryCaptureResult = {
  captured: boolean;
  sourceId: string | null;
  ingestedIds: string[];
  sanitizedText: string;
  businessDomains: BusinessDomain[];
  captureKind: BusinessMemoryCaptureKind | null;
};

export type BusinessMemoryContextInput = {
  orgId: string;
  userId: string;
  userMessage: string;
  conversationId?: string | null;
  dealId?: string | null;
};

export type BusinessMemoryContextResult = {
  contextBlock: string;
  results: KnowledgeSearchResult[];
  retrievalMode: "semantic" | "exact" | null;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function buildChatCaptureSourceId(messageId: string): string {
  return `chat-message:${messageId}`;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value.slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function getMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function getMetadataStringArray(
  metadata: Record<string, unknown>,
  key: string,
): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function sanitizeBusinessMemoryText(text: string): string {
  return normalizeWhitespace(text.replace(MAP_CONTEXT_BLOCK_PATTERN, ""));
}

export function classifyBusinessDomains(text: string): BusinessDomain[] {
  const normalized = text.toLowerCase();
  const matches = DOMAIN_KEYWORDS.filter(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  ).map(({ domain }) => domain);

  return matches.length > 0 ? matches : ["general"];
}

export function classifyBusinessMemoryCaptureKind(
  text: string,
): BusinessMemoryCaptureKind {
  const normalized = text.toLowerCase();

  if (
    normalized.includes("i prefer") ||
    normalized.includes("default to") ||
    normalized.includes("always") ||
    normalized.includes("never") ||
    normalized.includes("do not") ||
    normalized.includes("don't") ||
    normalized.includes("should be")
  ) {
    return "preference";
  }

  if (
    normalized.includes("i want") ||
    normalized.includes("we need") ||
    normalized.includes("goal") ||
    normalized.includes("target") ||
    normalized.includes("trying to") ||
    normalized.includes("grow")
  ) {
    return "goal";
  }

  if (
    /^(proceed|build|implement|add|update|create|fix|run|ship)\b/.test(normalized) ||
    normalized.includes("please ") ||
    normalized.includes("need you to")
  ) {
    return "directive";
  }

  if (
    normalized.includes("buyer") ||
    normalized.includes("broker") ||
    normalized.includes("lender") ||
    normalized.includes("attorney") ||
    normalized.includes("partner") ||
    normalized.includes("seller")
  ) {
    return "relationship_signal";
  }

  if (
    normalized.includes("workflow") ||
    normalized.includes("process") ||
    normalized.includes("checklist") ||
    normalized.includes("sop") ||
    normalized.includes("how we")
  ) {
    return "process_note";
  }

  if (
    normalized.includes("market") ||
    normalized.includes("pricing") ||
    normalized.includes("comp") ||
    normalized.includes("demand") ||
    normalized.includes("supply")
  ) {
    return "market_observation";
  }

  if (
    normalized.includes("idea") ||
    normalized.includes("maybe we should") ||
    normalized.includes("could be")
  ) {
    return "idea";
  }

  return "fact";
}

function rankBusinessMemoryResults(
  results: KnowledgeSearchResult[],
  context: Pick<BusinessMemoryContextInput, "conversationId" | "dealId">,
): KnowledgeSearchResult[] {
  return [...results].sort((left, right) => {
    const leftMetadata = getMetadataRecord(left.metadata);
    const rightMetadata = getMetadataRecord(right.metadata);

    const leftConversationBoost =
      context.conversationId && leftMetadata.conversationId === context.conversationId ? 0.3 : 0;
    const rightConversationBoost =
      context.conversationId && rightMetadata.conversationId === context.conversationId ? 0.3 : 0;
    const leftDealBoost = context.dealId && leftMetadata.dealId === context.dealId ? 0.2 : 0;
    const rightDealBoost = context.dealId && rightMetadata.dealId === context.dealId ? 0.2 : 0;

    return right.similarity + rightConversationBoost + rightDealBoost -
      (left.similarity + leftConversationBoost + leftDealBoost);
  });
}

function dedupeBusinessMemoryResults(
  results: KnowledgeSearchResult[],
): KnowledgeSearchResult[] {
  const seen = new Set<string>();
  const deduped: KnowledgeSearchResult[] = [];

  for (const result of results) {
    if (seen.has(result.sourceId)) {
      continue;
    }
    seen.add(result.sourceId);
    deduped.push(result);
  }

  return deduped;
}

function formatBusinessMemoryLine(result: KnowledgeSearchResult): string {
  const metadata = getMetadataRecord(result.metadata);
  const captureKind =
    typeof metadata.captureKind === "string" ? metadata.captureKind : "fact";
  const businessDomains = getMetadataStringArray(metadata, "businessDomains");
  const capturedDate =
    toIsoDate(metadata.capturedAt) ??
    toIsoDate(result.createdAt) ??
    "unknown-date";
  const snippet = truncate(normalizeWhitespace(result.contentText), MAX_CONTEXT_SNIPPET_LENGTH);

  return `- ${capturedDate} | kind=${captureKind} | domains=${
    businessDomains.length > 0 ? businessDomains.join(",") : "general"
  } | user-authored note: ${snippet}`;
}

async function searchBusinessMemory(
  orgId: string,
  query: string,
  context: Pick<BusinessMemoryContextInput, "conversationId" | "dealId">,
): Promise<BusinessMemoryContextResult> {
  try {
    const semanticResults = await searchKnowledgeBase(
      orgId,
      query,
      ["chat_capture"],
      MAX_CONTEXT_RESULTS * 2,
      "semantic",
    );
    const rankedSemantic = dedupeBusinessMemoryResults(
      rankBusinessMemoryResults(semanticResults, context),
    ).slice(0, MAX_CONTEXT_RESULTS);

    if (rankedSemantic.length > 0) {
      return {
        contextBlock: "",
        results: rankedSemantic,
        retrievalMode: "semantic",
      };
    }
  } catch {
    // Exact fallback below handles missing Qdrant or embedding dependencies.
  }

  try {
    const exactResults = await searchKnowledgeBase(
      orgId,
      query,
      ["chat_capture"],
      MAX_CONTEXT_RESULTS * 2,
      "exact",
    );
    return {
      contextBlock: "",
      results: dedupeBusinessMemoryResults(
        rankBusinessMemoryResults(exactResults, context),
      ).slice(0, MAX_CONTEXT_RESULTS),
      retrievalMode: "exact",
    };
  } catch {
    return {
      contextBlock: "",
      results: [],
      retrievalMode: null,
    };
  }
}

export async function buildBusinessMemoryContext(
  input: BusinessMemoryContextInput,
): Promise<BusinessMemoryContextResult> {
  const sanitizedQuery = sanitizeBusinessMemoryText(input.userMessage);
  if (sanitizedQuery.length < MIN_RETRIEVAL_QUERY_LENGTH) {
    return {
      contextBlock: "",
      results: [],
      retrievalMode: null,
    };
  }

  const searchResult = await searchBusinessMemory(input.orgId, sanitizedQuery, {
    conversationId: input.conversationId,
    dealId: input.dealId,
  });

  if (searchResult.results.length === 0) {
    return searchResult;
  }

  const contextBlock = [
    "[Historical business memory from prior user chats]",
    "Treat this as background context from earlier user-authored chat messages. It may be stale, incomplete, or superseded. Verify before taking irreversible action.",
    ...searchResult.results.map(formatBusinessMemoryLine),
  ].join("\n");

  return {
    ...searchResult,
    contextBlock,
  };
}

export async function captureBusinessChatMemory(
  input: BusinessMemoryCaptureInput,
): Promise<BusinessMemoryCaptureResult> {
  const sanitizedText = sanitizeBusinessMemoryText(input.messageText);
  if (!sanitizedText) {
    return {
      captured: false,
      sourceId: null,
      ingestedIds: [],
      sanitizedText,
      businessDomains: [],
      captureKind: null,
    };
  }

  const businessDomains = classifyBusinessDomains(sanitizedText);
  const captureKind = classifyBusinessMemoryCaptureKind(sanitizedText);
  const sourceId = buildChatCaptureSourceId(input.messageId);
  const capturedAt = (input.createdAt ?? new Date()).toISOString();

  try {
    await deleteKnowledge(input.orgId, sourceId);
    const ingestedIds = await ingestKnowledge(
      input.orgId,
      "chat_capture",
      sourceId,
      sanitizedText,
      {
        sourceType: "chat_message",
        sourceMessageId: input.messageId,
        userId: input.userId,
        conversationId: input.conversationId ?? null,
        dealId: input.dealId ?? null,
        captureKind,
        businessDomains,
        capturedAt,
        isUserAuthored: true,
      },
    );

    return {
      captured: ingestedIds.length > 0,
      sourceId,
      ingestedIds,
      sanitizedText,
      businessDomains,
      captureKind,
    };
  } catch (error) {
    console.warn(
      "[business-memory-capture]",
      error instanceof Error ? error.message : String(error),
    );
    return {
      captured: false,
      sourceId,
      ingestedIds: [],
      sanitizedText,
      businessDomains,
      captureKind,
    };
  }
}

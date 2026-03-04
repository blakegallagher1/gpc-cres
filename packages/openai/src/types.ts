export type OpenAiToolType = "web_search" | "file_search";

export type OpenAiWebSearchSource = {
  url: string;
  title?: string;
  // Some tool results include a snippet/summary field; keep it optional.
  snippet?: string;
};

export type OpenAiUsageSummary = {
  inputTokens?: number;
  promptTokens?: number;
  outputTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  raw?: Record<string, unknown>;
};

export type OpenAiToolOutputSummary = {
  totalToolCalls: number;
  totalToolOutputs: number;
  failedToolOutputs: number;
  callsByType: Record<string, number>;
  outputsByType: Record<string, number>;
};

export type OpenAiResponseMetadata = {
  model?: string;
  status?: string;
  finishReason?: string;
  serviceTier?: string;
  createdAt?: string;
  completedAt?: string;
  createdAtEpoch?: number;
  completedAtEpoch?: number;
  promptCacheKey?: string;
  parallelToolCalls?: boolean;
  maxToolCalls?: number;
  temperature?: number;
  topP?: number;
  background?: boolean;
  safetyIdentifier?: string;
  usage?: OpenAiUsageSummary;
  toolOutputSummary?: OpenAiToolOutputSummary;
  raw?: Record<string, unknown>;
};

export type OpenAiToolSources = {
  webSearchSources: OpenAiWebSearchSource[];
  fileSearchResults: unknown[];
};

export type StrictJsonResponse<T> = {
  responseId: string | null;
  outputJson: T;
  metadata?: OpenAiResponseMetadata;
  toolSources: OpenAiToolSources;
};

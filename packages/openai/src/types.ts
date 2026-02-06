export type OpenAiToolType = "web_search" | "file_search";

export type OpenAiWebSearchSource = {
  url: string;
  title?: string;
  // Some tool results include a snippet/summary field; keep it optional.
  snippet?: string;
};

export type OpenAiToolSources = {
  webSearchSources: OpenAiWebSearchSource[];
  fileSearchResults: unknown[];
};

export type StrictJsonResponse<T> = {
  responseId: string | null;
  outputJson: T;
  toolSources: OpenAiToolSources;
};


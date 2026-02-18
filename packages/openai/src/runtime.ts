import type { StreamRunOptions } from "@openai/agents";

const DEFAULT_MAX_TURNS = 15;

export type BuildAgentStreamRunOptionsParams = {
  maxTurns?: number;
  conversationId?: string;
};

function isOpenAiConversationId(value: string): boolean {
  return value.startsWith("conv");
}

export function buildAgentStreamRunOptions(
  params: BuildAgentStreamRunOptionsParams = {},
): StreamRunOptions {
  const options: StreamRunOptions = {
    stream: true,
    maxTurns: params.maxTurns ?? DEFAULT_MAX_TURNS,
  };

  if (
    process.env.OPENAI_AGENTS_MEMORY_DISABLED !== "true" &&
    params.conversationId &&
    isOpenAiConversationId(params.conversationId)
  ) {
    options.conversationId = params.conversationId;
  }

  if (process.env.OPENAI_AGENTS_TRACING_DISABLED !== "true") {
    const tracingApiKey = process.env.OPENAI_AGENTS_TRACING_API_KEY ?? process.env.OPENAI_API_KEY;
    if (tracingApiKey) {
      options.tracing = { apiKey: tracingApiKey };
    }
  }

  return options;
}

import { OpenAIProvider, Runner } from "@openai/agents";

const TRANSPORT_ENV = "OPENAI_AGENTS_RESPONSES_TRANSPORT";
const LEGACY_WS_ENV = "OPENAI_AGENTS_WS_ENABLED";
const WEBSOCKET_TRANSPORT = "websocket";
const TRUE_VALUE = "true";

let websocketProvider: OpenAIProvider | null = null;
let websocketRunner: Runner | null = null;

function normalizeEnvFlag(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function shouldUseResponsesWebSocketTransport(): boolean {
  const transport = normalizeEnvFlag(process.env[TRANSPORT_ENV]);
  if (transport) {
    return transport === WEBSOCKET_TRANSPORT;
  }

  return normalizeEnvFlag(process.env[LEGACY_WS_ENV]) === TRUE_VALUE;
}

export function getResponsesWebSocketRunner(): Runner {
  if (!websocketProvider || !websocketRunner) {
    websocketProvider = new OpenAIProvider({
      useResponses: true,
      useResponsesWebSocket: true,
      cacheResponsesWebSocketModels: true,
      websocketBaseURL: process.env.OPENAI_WEBSOCKET_BASE_URL,
    });
    websocketRunner = new Runner({ modelProvider: websocketProvider });
  }

  return websocketRunner;
}

export function isResponsesWebSocketTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Responses websocket") ||
    message.includes("websocket_connection_limit_reached") ||
    message.includes("previous_response_not_found")
  );
}


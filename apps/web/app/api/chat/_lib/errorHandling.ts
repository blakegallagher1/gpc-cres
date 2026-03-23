import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import { isPrismaConnectivityError } from "@/lib/server/devParcelFallback";

export type ChatClientErrorPayload = {
  code?: string;
  correlationId?: string;
  message: string;
};

export function isChatPersistenceUnavailable(error: unknown): boolean {
  return isSchemaDriftError(error) || isPrismaConnectivityError(error);
}

function isInternalFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("prisma") ||
    normalized.includes("findmany") ||
    normalized.includes("public.") ||
    normalized.includes("user_preferences") ||
    normalized.includes("the table")
  );
}

function isGatewayProxyErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("gateway db proxy error") ||
    (normalized.includes("proxy error") && /\b5\d{2}\b/.test(normalized))
  );
}

function isInvalidQueryParametersMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid query parameters") ||
    normalized.includes("must be a valid uuid") ||
    normalized.includes("query parameter") ||
    normalized.includes("savedsearchid must be a valid uuid")
  );
}

function isSystemConfigurationErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid schema for response_format") ||
    normalized.includes("response_format") ||
    normalized.includes("not a valid format") ||
    normalized.includes("json_schema") ||
    normalized.includes("outputtype")
  );
}

function isGuardrailTripwireMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("input guardrail triggered") ||
    normalized.includes("output guardrail triggered") ||
    normalized.includes("guardrail tripwire")
  );
}

export function sanitizeChatErrorMessage(
  message: string,
  correlationId?: string,
): ChatClientErrorPayload {
  if (isGatewayProxyErrorMessage(message)) {
    return {
      code: "upstream_service_error",
      correlationId,
      message:
        "The requested analysis could not start. Link a deal if this command is deal-specific, then try again.",
    };
  }

  if (isInvalidQueryParametersMessage(message)) {
    return {
      code: "invalid_query_parameters",
      correlationId,
      message: "This panel could not load with the current filters. Retry or reset the selection.",
    };
  }

  if (!isGuardrailTripwireMessage(message)) {
    if (
      isInternalFailureMessage(message) ||
      isSystemConfigurationErrorMessage(message)
    ) {
      return {
        code: "system_configuration_error",
        correlationId,
        message: "System configuration error. Please contact admin.",
      };
    }
    return { message };
  }

  return {
    code: "guardrail_tripwire",
    message:
      "Request blocked by safety guardrails. Please revise the prompt or remove risky/unvalidated content and try again.",
  };
}

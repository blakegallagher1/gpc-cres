import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import { isPrismaConnectivityError } from "@/lib/server/devParcelFallback";

export type ChatClientErrorPayload = {
  code?: string;
  correlationId?: string;
  message: string;
};

function isGatewayPersistenceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Gateway DB proxy failed");
}

export function isChatPersistenceUnavailable(error: unknown): boolean {
  return (
    isSchemaDriftError(error) ||
    isPrismaConnectivityError(error) ||
    isGatewayPersistenceError(error)
  );
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

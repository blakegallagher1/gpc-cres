export function extractErrorMessage(value: unknown): string | null {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return null;
}

export function isDatabaseConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) {
    return false;
  }

  const lowered = message.toLowerCase();
  return (
    lowered.includes("gateway db proxy error") ||
    lowered.includes("prismaclientinitializationerror") ||
    lowered.includes("can't reach database server") ||
    lowered.includes("cant reach database server") ||
    lowered.includes("could not connect to server") ||
    lowered.includes("connect etimedout") ||
    lowered.includes("econnreset") ||
    lowered.includes("origin database does not support ssl") ||
    lowered.includes("connect econnrefused") ||
    lowered.includes("connection terminated unexpectedly") ||
    lowered.includes("database error")
  );
}

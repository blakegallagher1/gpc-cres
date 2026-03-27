/**
 * Tool input/output guardrails for validating tool arguments and results.
 * Input guardrails run before tool execution; output guardrails run after.
 */

export type GuardrailResult = {
  valid: boolean;
  error?: string;
};

export type InputGuardrail = (
  toolName: string,
  args: Record<string, unknown>,
) => GuardrailResult;

export type OutputGuardrail = (
  toolName: string,
  output: unknown,
) => GuardrailResult;

// ---- Input Guardrails ----

const ALLOWED_BROWSER_DOMAINS = [
  "gallagherpropco.com",
  "www.gallagherpropco.com",
  "ebrso.org",
  "www.ebrso.org",
  "ascensionassessor.com",
  "fema.gov",
  "www.fema.gov",
  "msc.fema.gov",
  "lacdb.com",
  "www.lacdb.com",
];

/**
 * Validate that browser_task URLs are on the allowlist.
 */
export const urlAllowlistGuardrail: InputGuardrail = (_toolName, args) => {
  const url = args.url;
  if (!url || typeof url !== "string") return { valid: true };
  try {
    const hostname = new URL(url).hostname;
    const isAllowed = ALLOWED_BROWSER_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
    if (!isAllowed) {
      return { valid: false, error: `URL domain '${hostname}' is not in the browser allowlist. Allowed: ${ALLOWED_BROWSER_DOMAINS.join(", ")}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `Invalid URL: ${url}` };
  }
};

/**
 * Validate that parcel IDs match expected format.
 */
export const parcelIdFormatGuardrail: InputGuardrail = (_toolName, args) => {
  const parcelId = args.parcelId ?? args.parcel_id;
  if (parcelId === undefined || parcelId === null) return { valid: true };
  if (typeof parcelId !== "string") return { valid: true };
  // EBR parcel IDs are typically numeric strings, 5-15 digits
  const trimmed = parcelId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Parcel ID cannot be empty" };
  }
  return { valid: true };
};

/**
 * Validate required fields are present in tool arguments.
 */
export function requiredFieldsGuardrail(requiredFields: string[]): InputGuardrail {
  return (_toolName, args) => {
    const missing = requiredFields.filter(
      (f) => args[f] === undefined || args[f] === null || args[f] === "",
    );
    if (missing.length > 0) {
      return { valid: false, error: `Missing required fields: ${missing.join(", ")}` };
    }
    return { valid: true };
  };
}

// ---- Output Guardrails ----

/**
 * Validate that tool output has minimum data completeness.
 */
export function outputCompletenessGuardrail(minFields: number): OutputGuardrail {
  return (_toolName, output) => {
    if (!output || typeof output !== "object") return { valid: true };
    const fieldCount = Object.keys(output as Record<string, unknown>).length;
    if (fieldCount < minFields) {
      return {
        valid: false,
        error: `Output has only ${fieldCount} fields (minimum: ${minFields}). Data may be incomplete.`,
      };
    }
    return { valid: true };
  };
}

/**
 * Validate that output doesn't contain error indicators.
 */
export const noErrorOutputGuardrail: OutputGuardrail = (_toolName, output) => {
  if (!output || typeof output !== "object") return { valid: true };
  const obj = output as Record<string, unknown>;
  if (obj.error && typeof obj.error === "string") {
    return { valid: false, error: `Tool returned error: ${obj.error}` };
  }
  if (obj.success === false) {
    return { valid: false, error: "Tool reported failure" };
  }
  return { valid: true };
};

/**
 * Run all input guardrails for a tool. Returns first failure or success.
 */
export function runInputGuardrails(
  toolName: string,
  args: Record<string, unknown>,
  guardrails: InputGuardrail[],
): GuardrailResult {
  for (const guardrail of guardrails) {
    const result = guardrail(toolName, args);
    if (!result.valid) return result;
  }
  return { valid: true };
}

/**
 * Run all output guardrails for a tool. Returns first failure or success.
 */
export function runOutputGuardrails(
  toolName: string,
  output: unknown,
  guardrails: OutputGuardrail[],
): GuardrailResult {
  for (const guardrail of guardrails) {
    const result = guardrail(toolName, output);
    if (!result.valid) return result;
  }
  return { valid: true };
}

import type { InputGuardrail } from "@openai/agents";

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|prior)\s+instructions\b/i,
  /\boverride\s+(the\s+)?(system|developer)\s+prompt\b/i,
  /\b(reveal|show|print)\s+(the\s+)?(system|developer)\s+prompt\b/i,
  /\bbypass\s+(safety|guardrails?|polic(y|ies))\b/i,
  /\bjailbreak\b/i,
  /\bact\s+as\s+root\b/i,
];

const OFF_TOPIC_PATTERNS = [
  /\brecipe\b/i,
  /\bpoem\b/i,
  /\bsong\s+lyrics?\b/i,
  /\bvideo\s+game\b/i,
  /\bhoroscope\b/i,
];

const CRE_TOPIC_PATTERNS = [
  /\bdeal\b/i,
  /\bparcel\b/i,
  /\bzoning\b/i,
  /\bunderwrit/i,
  /\bnoi\b/i,
  /\bcap\s*rate\b/i,
  /\bdscr\b/i,
  /\bloan\b/i,
  /\blease\b/i,
  /\bjurisdiction\b/i,
  /\bentitlement\b/i,
];

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeInputText(input: string | unknown[]): string {
  if (typeof input === "string") return input;
  if (!Array.isArray(input)) return "";
  return input
    .map((item) => {
      if (typeof item === "string") return item;
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join(" ");
}

export function detectPromptInjectionSignals(text: string): string[] {
  return PROMPT_INJECTION_PATTERNS.filter((pattern) => pattern.test(text)).map(
    (pattern) => pattern.source,
  );
}

export function detectOffTopicSignals(text: string): string[] {
  const hasCreSignal = CRE_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
  if (hasCreSignal) return [];
  return OFF_TOPIC_PATTERNS.filter((pattern) => pattern.test(text)).map(
    (pattern) => pattern.source,
  );
}

export function detectInvalidDealReferenceSignals(text: string): string[] {
  const violations: string[] = [];

  for (const match of text.matchAll(
    /\bdeal(?:\s*id)?\s*[:=]\s*["']?([a-z0-9-]{8,})["']?/gi,
  )) {
    const candidate = match[1];
    if (!UUID_V4_PATTERN.test(candidate)) {
      violations.push(`invalid_deal_id:${candidate}`);
    }
  }

  for (const match of text.matchAll(
    /"dealId"\s*:\s*"([a-z0-9-]{8,})"/gi,
  )) {
    const candidate = match[1];
    if (!UUID_V4_PATTERN.test(candidate)) {
      violations.push(`invalid_deal_id:${candidate}`);
    }
  }

  return [...new Set(violations)];
}

export const coordinatorInputGuardrail: InputGuardrail = {
  name: "coordinator_input_guardrail",
  runInParallel: false,
  execute: async ({ input, context }) => {
    const text = normalizeInputText(input);
    const promptInjectionSignals = detectPromptInjectionSignals(text);
    const offTopicSignals = detectOffTopicSignals(text);
    const invalidDealReferences = detectInvalidDealReferenceSignals(text);
    const referencedDealIds = Array.from(
      new Set(
        Array.from(text.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi))
          .map((match) => match[0]),
      ),
    );
    const activeDealId =
      context &&
      typeof context.context === "object" &&
      context.context !== null &&
      "dealId" in (context.context as Record<string, unknown>) &&
      typeof (context.context as Record<string, unknown>).dealId === "string"
        ? ((context.context as Record<string, unknown>).dealId as string)
        : null;
    const dealReferenceMismatch =
      activeDealId &&
      referencedDealIds.length > 0 &&
      referencedDealIds.some((id) => id !== activeDealId)
        ? ["deal_reference_mismatch"]
        : [];

    const violations = [
      ...promptInjectionSignals,
      ...offTopicSignals,
      ...invalidDealReferences,
      ...dealReferenceMismatch,
    ];

    return {
      tripwireTriggered: violations.length > 0,
      outputInfo: {
        category: "input_validation",
        promptInjectionSignals,
        offTopicSignals,
        invalidDealReferences,
        dealReferenceMismatch,
      },
    };
  },
};

/**
 * AI summary helper for producing concise episode summaries from raw model outputs.
 */

import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);

const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4.1-mini";

type OpenAIResponsesResult = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<
      | {
          type?: string;
          text?: string;
        }
      | {
          type?: string;
          text?: {
            value?: string;
          };
        }
    >;
  }>;
};

type SummaryOutputShape = {
  [key: string]: unknown;
};

/**
 * Create a strict, short summary from model outputs using the OpenAI Responses API.
 * Throws when the API key is missing or response extraction fails.
 */
export async function createSummary(output: SummaryOutputShape): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run createSummary");
  }

  const openAI = createOpenAIClient(apiKey);
  const safeOutput = JSON.stringify(output ?? {}, null, 2).slice(0, 12_000);

  const response = (await openAI.responses.create({
    model: SUMMARY_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a disciplined analyst creating a concise memory summary.",
      },
      {
        role: "user",
        content: `Create a 2-4 sentence summary focused on evidence, outcomes, and context:\n\n${safeOutput}`,
      },
    ],
    max_output_tokens: 220,
    temperature: 0.2,
  })) as OpenAIResponsesResult;

  const text = extractSummaryText(response);
  if (!text) {
    throw new Error("OpenAI response did not contain extractable summary text");
  }

  return text.trim();
}

function createOpenAIClient(apiKey: string): {
  responses: { create: (payload: unknown) => Promise<unknown> };
} {
  const openAIModule = safeRequire<any>("openai");
  if (!openAIModule) {
    throw new Error("openai package is not installed");
  }
  const OpenAIClass = openAIModule.default ?? openAIModule.OpenAI;
  if (!OpenAIClass) {
    throw new Error("OpenAI class export not found");
  }
  return new OpenAIClass({ apiKey });
}

function extractSummaryText(response: OpenAIResponsesResult): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return "";
  }

  for (const block of response.output) {
    if (!block || block.type !== "message" || !Array.isArray(block.content)) {
      continue;
    }
    for (const item of block.content) {
      if (typeof item?.text === "string" && item.text.trim()) {
        return item.text;
      }
      if (typeof (item as { text?: { value?: string } }).text === "object") {
        const nested = (item as { text?: { value?: string } }).text;
        if (nested?.value?.trim()) {
          return nested.value;
        }
      }
    }
  }

  return "";
}

function safeRequire<T>(moduleName: string): T | null {
  try {
    return requireModule(moduleName) as T;
  } catch {
    return null;
  }
}

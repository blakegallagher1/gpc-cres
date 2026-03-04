import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildResponseContinuationParams } from "../agentos/sessionManager.js";

const { responsesCreateMock } = vi.hoisted(() => ({
  responsesCreateMock: vi.fn(),
}));

vi.mock("openai", () => {
  class OpenAI {
    public responses = {
      create: responsesCreateMock,
    };

    constructor(_options: unknown) {}
  }

  return { default: OpenAI };
});

const originalEnabled = process.env.AGENTOS_ENABLED;
const originalContextManagement = process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED;
const originalThreshold = process.env.AGENTOS_COMPACTION_THRESHOLD;

describe("createStrictJsonResponse compaction and chaining", () => {
  beforeEach(() => {
    vi.resetModules();
    responsesCreateMock.mockReset();
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";
    process.env.AGENTOS_COMPACTION_THRESHOLD = "12345";
  });

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.AGENTOS_ENABLED;
    } else {
      process.env.AGENTOS_ENABLED = originalEnabled;
    }
    if (originalContextManagement === undefined) {
      delete process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED;
    } else {
      process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = originalContextManagement;
    }
    if (originalThreshold === undefined) {
      delete process.env.AGENTOS_COMPACTION_THRESHOLD;
    } else {
      process.env.AGENTOS_COMPACTION_THRESHOLD = originalThreshold;
    }
  });

  it("enables compaction by default and forwards previous_response_id", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_default",
      output_text: JSON.stringify({ ok: true }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ ok: boolean }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean" },
          },
          required: ["ok"],
        },
      },
      previousResponseId: "resp_chainabc123",
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const expectedContinuation = buildResponseContinuationParams("resp_chainabc123");

    expect(request.previous_response_id).toBe(expectedContinuation.previous_response_id);
    expect(request.context_management).toEqual([
      {
        type: "compaction",
        compact_threshold: 12345,
      },
    ]);
    expect(request.context_management).toEqual(expectedContinuation.context_management);

    expect(result.outputJson).toEqual({ ok: true });
    expect(result.responseId).toBe("resp_default");
  });

  it("supports compaction opt-out while preserving strict JSON parsing", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_opt_out",
      output_text: JSON.stringify({ value: 42 }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ value: number }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            value: { type: "number" },
          },
          required: ["value"],
        },
      },
      contextManagement: null,
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      context_management?: unknown;
    };
    expect(request.context_management).toBeUndefined();
    expect(result.outputJson).toEqual({ value: 42 });
  });

  it("supports compaction: { enabled: false } while preserving strict JSON parsing", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_enabled_false",
      output_text: JSON.stringify({ score: 99 }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ score: number }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number" },
          },
          required: ["score"],
        },
      },
      compaction: {
        enabled: false,
      },
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      context_management?: unknown;
    };
    expect(request.context_management).toBeUndefined();
    expect(result.outputJson).toEqual({ score: 99 });
  });

  it("supports compaction: { strategy: 'manual' } while preserving strict JSON parsing", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_manual_strategy",
      output_text: JSON.stringify({ score: 77 }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ score: number }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            score: { type: "number" },
          },
          required: ["score"],
        },
      },
      compaction: {
        strategy: "manual",
      },
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      context_management?: unknown;
    };
    expect(request.context_management).toBeUndefined();
    expect(result.outputJson).toEqual({ score: 77 });
  });

  it("returns response metadata including usage and tool event summary", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_with_metadata",
      model: "gpt-5-mini",
      status: "completed",
      service_tier: "default",
      created_at: 1_700_000_000,
      completed_at: 1_700_000_006,
      prompt_cache_key: "pcache_123",
      parallel_tool_calls: true,
      max_tool_calls: 8,
      temperature: 0.2,
      top_p: 0.95,
      background: false,
      safety_identifier: "safe_abc123",
      usage: {
        input_tokens: 64,
        output_tokens: 9,
        total_tokens: 73,
        input_tokens_details: {
          cached_tokens: 8,
        },
      },
      output_text: JSON.stringify({ status: "ok" }),
      output: [
        {
          type: "web_search_call",
          id: "wsc_1",
          action: {
            type: "web_search_call",
            query: "entitlement properties",
            sources: [
              {
                url: "https://example.com/result",
                title: "Example Source",
                snippet: "Example snippet",
              },
            ],
          },
        },
        {
          type: "web_search_call_output",
          status: "completed",
          id: "wso_1",
          output: [
            {
              type: "result",
              title: "example",
              url: "https://example.com/result",
            },
          ],
        },
        {
          type: "shell_call_output",
          output: [
            {
              stdout: "ok",
              stderr: "",
              outcome: {
                type: "timeout",
              },
            },
          ],
        },
      ],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ status: string }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
          },
          required: ["status"],
        },
      },
    });

    expect(result.outputJson).toEqual({ status: "ok" });
    expect(result.responseId).toBe("resp_with_metadata");
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.model).toBe("gpt-5-mini");
    expect(result.metadata?.status).toBe("completed");
    expect(result.metadata?.serviceTier).toBe("default");
    expect(result.metadata?.promptCacheKey).toBe("pcache_123");
    expect(result.metadata?.parallelToolCalls).toBe(true);
    expect(result.metadata?.maxToolCalls).toBe(8);
    expect(result.metadata?.temperature).toBe(0.2);
    expect(result.metadata?.topP).toBe(0.95);
    expect(result.metadata?.background).toBe(false);
    expect(result.metadata?.safetyIdentifier).toBe("safe_abc123");
    expect(result.metadata?.createdAtEpoch).toBe(1_700_000_000);
    expect(result.metadata?.completedAtEpoch).toBe(1_700_000_006);
    expect(result.metadata?.createdAt).toBe("2023-11-14T22:13:20.000Z");
    expect(result.metadata?.completedAt).toBe("2023-11-14T22:13:26.000Z");
    expect(result.metadata?.raw).toMatchObject({
      id: "resp_with_metadata",
      model: "gpt-5-mini",
      status: "completed",
      serviceTier: "default",
      promptCacheKey: "pcache_123",
      parallelToolCalls: true,
      maxToolCalls: 8,
      temperature: 0.2,
      topP: 0.95,
      background: false,
      safetyIdentifier: "safe_abc123",
      createdAtEpoch: 1_700_000_000,
      completedAtEpoch: 1_700_000_006,
    });
    expect(result.metadata?.usage).toMatchObject({
      inputTokens: 64,
      outputTokens: 9,
      totalTokens: 73,
      cachedInputTokens: 8,
    });
    expect(result.metadata?.toolOutputSummary).toEqual({
      totalToolCalls: 1,
      totalToolOutputs: 2,
      failedToolOutputs: 1,
      callsByType: {
        web_search_call: 1,
      },
      outputsByType: {
        web_search_call_output: 1,
        shell_call_output: 1,
      },
    });
    expect(result.toolSources.webSearchSources).toEqual([
      {
        url: "https://example.com/result",
        title: "Example Source",
        snippet: "Example snippet",
      },
    ]);
  });

  it("honors explicit contextManagement override while preserving strict parsing", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_override_wins",
      output_text: JSON.stringify({ status: "manual" }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ status: string }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
          },
          required: ["status"],
        },
      },
      contextManagement: [
        {
          type: "compaction",
          compact_threshold: 500,
        },
      ],
      compaction: {
        enabled: false,
      },
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      context_management?: unknown;
    };
    expect(request.context_management).toEqual([
      {
        type: "compaction",
        compact_threshold: 500,
      },
    ]);
    expect(result.outputJson).toEqual({ status: "manual" });
  });

  it("honors explicit context_management override while preserving strict parsing", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_manual",
      output_text: JSON.stringify({ status: "manual" }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ status: string }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
          },
          required: ["status"],
        },
      },
      contextManagement: [
        {
          type: "compaction",
          compact_threshold: 500,
        },
      ],
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      context_management?: unknown;
    };
    expect(request.context_management).toEqual([
      {
        type: "compaction",
        compact_threshold: 500,
      },
    ]);
    expect(result.outputJson).toEqual({ status: "manual" });
  });

  it("returns response_id even when id is absent", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_snake",
      output_text: JSON.stringify({ status: "ok" }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    const result = await createStrictJsonResponse<{ status: string }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string" },
          },
          required: ["status"],
        },
      },
    });

    expect(result.responseId).toBe("resp_snake");
  });

  it("supports createTextResponse advanced composition controls", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_text",
      output_text: "ok",
      output: [],
    });

    const { createTextResponse } = await import("../responses.js");

    await createTextResponse({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      systemPrompt: "You are concise.",
      userPrompt: "Say this",
      maxOutputTokens: 64,
      topP: 0.85,
      temperature: 0.3,
      reasoning: {
        effort: "low",
      } as const,
      parallelToolCalls: false,
      truncation: "auto",
      previousResponseId: "resp_chainabc123",
      store: true,
      promptCacheKey: "text-cache",
      compaction: {
        enabled: false,
      },
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      model: string;
      prompt_cache_key?: string;
      parallel_tool_calls?: boolean;
      truncation?: string;
      top_p?: number;
      max_output_tokens?: number;
      temperature?: number;
      store?: boolean;
      previous_response_id?: string;
    };

    expect(request.model).toBe("gpt-4o-mini");
    expect(request.prompt_cache_key).toBe("text-cache");
    expect(request.parallel_tool_calls).toBe(false);
    expect(request.truncation).toBe("auto");
    expect(request.top_p).toBe(0.85);
    expect(request.max_output_tokens).toBe(64);
    expect(request.temperature).toBe(0.3);
    expect(request.store).toBe(true);
    expect(request.previous_response_id).toBe("resp_chainabc123");
  });

  it("forwards previous_response_id as provided after trimming", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_invalid_previous",
      output_text: JSON.stringify({ ok: true }),
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    await createStrictJsonResponse<{ ok: boolean }>({
      apiKey: "test-key",
      model: "gpt-test",
      input: "Return JSON",
      jsonSchema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            ok: { type: "boolean" },
          },
          required: ["ok"],
        },
      },
      previousResponseId: "not-a-response-id",
    });

    const request = responsesCreateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const expectedContinuation = buildResponseContinuationParams("not-a-response-id");
    if (expectedContinuation.previous_response_id === undefined) {
      expect(request).not.toHaveProperty("previous_response_id");
    } else {
      expect(request.previous_response_id).toBe(expectedContinuation.previous_response_id);
    }
  });

  it("fails closed when model output is not valid JSON", async () => {
    responsesCreateMock.mockResolvedValue({
      id: "resp_bad_json",
      output_text: "{not valid json",
      output: [],
    });

    const { createStrictJsonResponse } = await import("../responses.js");

    await expect(
      createStrictJsonResponse<{ status: string }>({
        apiKey: "test-key",
        model: "gpt-test",
        input: "Return JSON",
        jsonSchema: {
          name: "test_schema",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              status: { type: "string" },
            },
            required: ["status"],
          },
        },
      }),
    ).rejects.toThrow("Failed to parse OpenAI JSON output");
  });
});

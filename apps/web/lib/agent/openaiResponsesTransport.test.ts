import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isResponsesWebSocketTransportError,
  shouldUseResponsesWebSocketTransport,
} from "./openaiResponsesTransport";

describe("OpenAI Responses WebSocket transport gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to HTTP transport", () => {
    expect(shouldUseResponsesWebSocketTransport()).toBe(false);
  });

  it("enables WebSocket transport from the current transport env", () => {
    vi.stubEnv("OPENAI_AGENTS_RESPONSES_TRANSPORT", "websocket");

    expect(shouldUseResponsesWebSocketTransport()).toBe(true);
  });

  it("lets the current transport env override the legacy flag", () => {
    vi.stubEnv("OPENAI_AGENTS_RESPONSES_TRANSPORT", "http");
    vi.stubEnv("OPENAI_AGENTS_WS_ENABLED", "true");

    expect(shouldUseResponsesWebSocketTransport()).toBe(false);
  });

  it("keeps the legacy WebSocket flag as a compatibility alias", () => {
    vi.stubEnv("OPENAI_AGENTS_WS_ENABLED", "true");

    expect(shouldUseResponsesWebSocketTransport()).toBe(true);
  });

  it("classifies Responses WebSocket failures as fallback-safe transport errors", () => {
    expect(
      isResponsesWebSocketTransportError(
        new Error("Responses websocket connection closed before opening."),
      ),
    ).toBe(true);
    expect(
      isResponsesWebSocketTransportError(
        new Error("OpenAI error code: previous_response_not_found"),
      ),
    ).toBe(true);
  });

  it("does not classify generic model failures as transport fallback errors", () => {
    expect(isResponsesWebSocketTransportError(new Error("tool execution failed"))).toBe(false);
  });
});


import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAgentWebSocketMock, mapDispatchMock, buildMapContextInputMock } =
  vi.hoisted(() => ({
    useAgentWebSocketMock: vi.fn(),
    mapDispatchMock: vi.fn(),
    buildMapContextInputMock: vi.fn(() => undefined),
  }));

vi.mock("@/components/agent-state/AgentStatePanel", () => ({
  AgentStatePanel: () => <div data-testid="agent-state-panel" />,
}));

vi.mock("@/components/chat/MessageList", () => ({
  MessageList: ({ conversationId }: { conversationId?: string | null }) => (
    <div data-conversation-id={conversationId ?? ""} data-testid="message-list" />
  ),
}));

vi.mock("@/components/chat/ChatInput", () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock("@/components/chat/ConversationSidebar", () => ({
  ConversationSidebar: ({
    activeConversationId,
  }: {
    activeConversationId: string | null;
  }) => (
    <div
      data-active-conversation-id={activeConversationId ?? ""}
      data-testid="conversation-sidebar"
    />
  ),
}));

vi.mock("@/components/chat/AgentIndicator", () => ({
  AgentIndicator: () => <div data-testid="agent-indicator" />,
}));

vi.mock("@/components/chat/DealSelector", () => ({
  DealSelector: () => <div data-testid="deal-selector" />,
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/lib/chat/MapChatContext", () => ({
  buildMapContextInput: buildMapContextInputMock,
  useMapChatState: () => ({
    selectedParcelIds: [],
    referencedFeatures: [],
    center: null,
    zoom: null,
    pendingActions: [],
    viewportLabel: null,
  }),
  useMapChatDispatch: () => mapDispatchMock,
}));

vi.mock("@/lib/chat/useAgentWebSocket", () => ({
  useAgentWebSocket: useAgentWebSocketMock,
}));

describe("ChatContainer", () => {
  const originalWsUrl = process.env.NEXT_PUBLIC_AGENT_WS_URL;
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_AGENT_WS_URL = "wss://agents.example.com";
    window.history.replaceState({}, "", "/chat");

    useAgentWebSocketMock.mockReset();
    useAgentWebSocketMock.mockReturnValue({
      sendMessage: vi.fn(),
      status: "connected",
      disconnect: vi.fn(),
      operations: new Map(),
    });

    mapDispatchMock.mockReset();
    buildMapContextInputMock.mockReset();
    buildMapContextInputMock.mockReturnValue(undefined);

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/token") {
        return new Response(JSON.stringify({ token: "jwt-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "/api/chat/conversations") {
        return new Response(JSON.stringify({ conversations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("draft-session-1");
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AGENT_WS_URL = originalWsUrl;
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("does not fetch a nonexistent conversation for a fresh websocket chat", async () => {
    const { ChatContainer } = await import("@/components/chat/ChatContainer");

    const { container } = render(<ChatContainer />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/token");
      expect(fetchMock).toHaveBeenCalledWith("/api/chat/conversations");
    });

    const fetchedUrls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(fetchedUrls).toContain("/api/auth/token");
    expect(fetchedUrls).toContain("/api/chat/conversations");
    expect(fetchedUrls).not.toContain("/api/chat/conversations/draft-session-1");
    expect(window.location.search).toBe("");
    expect(useAgentWebSocketMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: "draft-session-1",
        token: "jwt-token",
        enabled: true,
      }),
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

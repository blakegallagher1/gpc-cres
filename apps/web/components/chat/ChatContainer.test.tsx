import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CHAT_CONTAINER_TEST_TIMEOUT_MS = 15_000;
const RESTORED_SUMMARY_CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

const { useAgentWebSocketMock, mapDispatchMock, buildMapContextInputMock, useIsMobileMock } =
  vi.hoisted(() => ({
    useAgentWebSocketMock: vi.fn(),
    mapDispatchMock: vi.fn(),
    buildMapContextInputMock: vi.fn(() => undefined),
    useIsMobileMock: vi.fn(() => false),
  }));

vi.mock("@/components/agent-state/AgentStatePanel", () => ({
  AgentStatePanel: ({
    confidence,
    lastAgentName,
    verificationSteps,
  }: {
    confidence?: number;
    lastAgentName?: string;
    verificationSteps?: string[];
  }) => (
    <div data-testid="agent-state-panel">
      <p>{lastAgentName}</p>
      <p>{Math.round((confidence ?? 0) * 100)}%</p>
      {verificationSteps?.map((step) => <p key={step}>{step}</p>)}
      <button type="button">Show details</button>
    </div>
  ),
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
    open,
    mobile,
  }: {
    activeConversationId: string | null;
    open?: boolean;
    mobile?: boolean;
  }) => (
    <div
      data-active-conversation-id={activeConversationId ?? ""}
      data-mobile={mobile ? "true" : "false"}
      data-open={open ? "true" : "false"}
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
  useIsMobile: useIsMobileMock,
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
  const originalLocalStorage = window.localStorage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_AGENT_WS_URL = "wss://agents.example.com";
    window.history.replaceState({}, "", "/chat");
    const localStorageStore = new Map<string, string>();
    const localStorageMock = {
      getItem: vi.fn((key: string) => localStorageStore.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageStore.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        localStorageStore.delete(key);
      }),
      clear: vi.fn(() => {
        localStorageStore.clear();
      }),
      key: vi.fn((index: number) => Array.from(localStorageStore.keys())[index] ?? null),
      get length() {
        return localStorageStore.size;
      },
    } satisfies Storage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    useIsMobileMock.mockReturnValue(false);

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

      if (url === `/api/chat/conversations/${RESTORED_SUMMARY_CONVERSATION_ID}`) {
        return new Response(
          JSON.stringify({
            conversation: {
              id: RESTORED_SUMMARY_CONVERSATION_ID,
              title: "Saved underwriting run",
              dealId: null,
              createdAt: "2026-03-21T14:00:00.000Z",
              updatedAt: "2026-03-21T14:05:00.000Z",
              messages: [
                {
                  id: "msg-summary-1",
                  role: "assistant",
                  content: "Underwriting screen complete.",
                  agentName: "finance",
                  createdAt: "2026-03-21T14:04:00.000Z",
                  metadata: {
                    kind: "chat_assistant_message",
                    runId: "run-restored-1",
                    trust: {
                      lastAgentName: "finance",
                      confidence: 0.82,
                      toolsInvoked: ["underwriting_model"],
                      missingEvidence: ["Rent roll not attached"],
                      verificationSteps: ["Confirm current rent roll"],
                      proofChecks: ["Compared leverage to debt yield floor"],
                      evidenceCitations: [],
                      durationMs: 1420,
                      errorSummary: null,
                      toolFailures: [],
                    },
                  },
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("draft-session-1");
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AGENT_WS_URL = originalWsUrl;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it(
    "does not fetch a nonexistent conversation for a fresh chat session",
    async () => {
      const { ChatContainer } = await import("@/components/chat/ChatContainer");

      render(<ChatContainer />);

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
          sessionId: null,
          token: "jwt-token",
          enabled: false,
        }),
      );
      expect(screen.getByText("Ask anything.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Draft memo" })).toBeInTheDocument();
      expect(
        screen.getByText(/Lead with the matter, outcome, or document you need\./i),
      ).toBeInTheDocument();
      expect(screen.getByTestId("conversation-sidebar")).toHaveAttribute("data-open", "true");
      expect(screen.getByTestId("conversation-sidebar")).toHaveAttribute(
        "data-mobile",
        "false",
      );
      expect(screen.queryByRole("button", { name: "History", exact: true })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Verification", exact: true }),
      ).not.toBeInTheDocument();
    },
    CHAT_CONTAINER_TEST_TIMEOUT_MS,
  );

  it(
    "keeps the mobile layout focused on the console surface",
    async () => {
      useIsMobileMock.mockReturnValue(true);
      const { ChatContainer } = await import("@/components/chat/ChatContainer");

      render(<ChatContainer />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/token");
        expect(fetchMock).toHaveBeenCalledWith("/api/chat/conversations");
      });

      expect(screen.getByText("Ask anything.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Draft memo" })).toBeInTheDocument();
      expect(screen.queryByTestId("conversation-sidebar")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "History", exact: true })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Verification", exact: true }),
      ).not.toBeInTheDocument();
    },
    CHAT_CONTAINER_TEST_TIMEOUT_MS,
  );

  it(
    "restores verification context when reopening a saved conversation",
    async () => {
      window.history.replaceState(
        {},
        "",
        `/chat?conversationId=${RESTORED_SUMMARY_CONVERSATION_ID}`,
      );
      const { ChatContainer } = await import("@/components/chat/ChatContainer");

      render(<ChatContainer />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/chat/conversations/${RESTORED_SUMMARY_CONVERSATION_ID}`,
        );
      });

      expect(await screen.findByText(/Saved thread/)).toBeInTheDocument();
      expect(screen.getByText(/finance/)).toBeInTheDocument();
      expect(screen.getByTestId("conversation-sidebar")).toHaveAttribute(
        "data-active-conversation-id",
        RESTORED_SUMMARY_CONVERSATION_ID,
      );
      expect(screen.getByTestId("message-list")).toHaveAttribute(
        "data-conversation-id",
        RESTORED_SUMMARY_CONVERSATION_ID,
      );
      expect(screen.queryByRole("heading", { name: "Execution inspector" })).not.toBeInTheDocument();
    },
    CHAT_CONTAINER_TEST_TIMEOUT_MS,
  );

  it(
    "ignores the ephemeral agent-run conversation placeholder in the URL",
    async () => {
      window.history.replaceState({}, "", "/chat?conversationId=agent-run");
      const { ChatContainer } = await import("@/components/chat/ChatContainer");

      render(<ChatContainer />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/token");
        expect(fetchMock).toHaveBeenCalledWith("/api/chat/conversations");
      });

      const fetchedUrls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(fetchedUrls).not.toContain("/api/chat/conversations/agent-run");
      expect(window.location.search).toBe("");
      expect(screen.getByText("Ask anything.")).toBeInTheDocument();
    },
    CHAT_CONTAINER_TEST_TIMEOUT_MS,
  );
});

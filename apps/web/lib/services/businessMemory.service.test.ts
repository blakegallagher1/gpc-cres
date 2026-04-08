import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteKnowledgeMock,
  ingestKnowledgeMock,
  searchKnowledgeBaseMock,
} = vi.hoisted(() => ({
  deleteKnowledgeMock: vi.fn(),
  ingestKnowledgeMock: vi.fn(),
  searchKnowledgeBaseMock: vi.fn(),
}));

vi.mock("./knowledgeBase.service", () => ({
  deleteKnowledge: deleteKnowledgeMock,
  ingestKnowledge: ingestKnowledgeMock,
  searchKnowledgeBase: searchKnowledgeBaseMock,
}));

vi.mock("@gpc/server/search/knowledge-base.service", () => ({
  deleteKnowledge: deleteKnowledgeMock,
  ingestKnowledge: ingestKnowledgeMock,
  searchKnowledgeBase: searchKnowledgeBaseMock,
}));

import {
  buildBusinessMemoryContext,
  captureBusinessChatMemory,
  sanitizeBusinessMemoryText,
} from "./businessMemory.service";

describe("businessMemory.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteKnowledgeMock.mockResolvedValue(0);
    ingestKnowledgeMock.mockResolvedValue(["knowledge-1"]);
    searchKnowledgeBaseMock.mockResolvedValue([]);
  });

  it("sanitizes map context and ingests chat captures with typed metadata", async () => {
    const result = await captureBusinessChatMemory({
      orgId: "org-1",
      userId: "user-1",
      messageId: "msg-1",
      conversationId: "conv-1",
      dealId: "deal-1",
      createdAt: new Date("2026-03-16T18:00:00.000Z"),
      messageText:
        "[Map Context]\ncenter=30.1,-91.1\n[/Map Context]\n\nI want this app to help with acquisitions and capital planning.",
    });

    expect(result).toMatchObject({
      captured: true,
      sourceId: "chat-message:msg-1",
      sanitizedText: "I want this app to help with acquisitions and capital planning.",
      captureKind: "goal",
      businessDomains: expect.arrayContaining(["acquisition", "capital"]),
    });
    expect(deleteKnowledgeMock).toHaveBeenCalledWith("org-1", "chat-message:msg-1");
    expect(ingestKnowledgeMock).toHaveBeenCalledWith(
      "org-1",
      "chat_capture",
      "chat-message:msg-1",
      "I want this app to help with acquisitions and capital planning.",
      expect.objectContaining({
        sourceType: "chat_message",
        sourceMessageId: "msg-1",
        userId: "user-1",
        conversationId: "conv-1",
        dealId: "deal-1",
        captureKind: "goal",
        businessDomains: expect.arrayContaining(["acquisition", "capital"]),
        isUserAuthored: true,
      }),
    );
  });

  it("builds a labeled historical context block from prior chat captures", async () => {
    searchKnowledgeBaseMock.mockResolvedValueOnce([
      {
        id: "knowledge-1",
        contentType: "chat_capture",
        sourceId: "chat-message:msg-9",
        contentText:
          "We should treat the app as a business-wide operating system instead of an entitlement-only tool.",
        metadata: {
          captureKind: "preference",
          businessDomains: ["strategy", "operations"],
          capturedAt: "2026-03-16T18:00:00.000Z",
          conversationId: "conv-older",
        },
        similarity: 0.92,
        createdAt: "2026-03-16T18:00:00.000Z",
      },
    ]);

    const result = await buildBusinessMemoryContext({
      orgId: "org-1",
      userId: "user-1",
      conversationId: "conv-1",
      userMessage:
        "How should the product evolve into a stronger operating system for the business?",
    });

    expect(result.retrievalMode).toBe("semantic");
    expect(result.results).toHaveLength(1);
    expect(result.contextBlock).toContain("[Historical business memory from prior user chats]");
    expect(result.contextBlock).toContain("kind=preference");
    expect(result.contextBlock).toContain("domains=strategy,operations");
    expect(result.contextBlock).toContain("business-wide operating system");
  });

  it("falls back to exact search when semantic retrieval is unavailable", async () => {
    searchKnowledgeBaseMock
      .mockRejectedValueOnce(new Error("Qdrant unavailable"))
      .mockResolvedValueOnce([
        {
          id: "knowledge-2",
          contentType: "chat_capture",
          sourceId: "chat-message:msg-12",
          contentText: "Focus on buyer development and capital relationships.",
          metadata: {
            captureKind: "fact",
            businessDomains: ["buyers", "capital", "relationships"],
            capturedAt: "2026-03-15T10:00:00.000Z",
          },
          similarity: 1,
          createdAt: "2026-03-15T10:00:00.000Z",
        },
      ]);

    const result = await buildBusinessMemoryContext({
      orgId: "org-1",
      userId: "user-1",
      userMessage: "How should we expand buyer development and capital relationships?",
    });

    expect(result.retrievalMode).toBe("exact");
    expect(searchKnowledgeBaseMock).toHaveBeenNthCalledWith(
      1,
      "org-1",
      "How should we expand buyer development and capital relationships?",
      ["chat_capture"],
      8,
      "semantic",
    );
    expect(searchKnowledgeBaseMock).toHaveBeenNthCalledWith(
      2,
      "org-1",
      "How should we expand buyer development and capital relationships?",
      ["chat_capture"],
      8,
      "exact",
    );
    expect(result.contextBlock).toContain("buyer development and capital relationships");
  });

  it("removes map context prefixes from captured text", () => {
    expect(
      sanitizeBusinessMemoryText(
        "[Map Context]\nselectedParcelIds=parcel-1\n[/Map Context]\n\nRemember this for later.",
      ),
    ).toBe("Remember this for later.");
  });
});

import { describe, expect, it } from "vitest";

import type { ConversationSummary } from "../types";
import { filterConversations } from "../../../components/chat/ConversationSidebar";

describe("ConversationSidebar filter reducer", () => {
  const conversations: ConversationSummary[] = [
    {
      id: "conversation-1",
      title: "Zoning request",
      dealId: "deal-1",
      updatedAt: "2026-02-15T10:00:00.000Z",
      messageCount: 1,
    },
    {
      id: "conversation-2",
      title: "Market comps",
      dealId: null,
      updatedAt: "2026-02-15T09:00:00.000Z",
      messageCount: 3,
    },
    {
      id: "conversation-3",
      title: "Due diligence",
      dealId: "deal-3",
      updatedAt: "2026-02-14T14:00:00.000Z",
      messageCount: 2,
    },
  ];

  it("filters by search and deal scope", () => {
    const result = filterConversations({
      conversations,
      search: "zoning",
      filter: "all",
      onlyRecent: false,
      recentConversationIds: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("conversation-1");
  });

  it("supports exact filter modes without search", () => {
    const onlyDeals = filterConversations({
      conversations,
      search: "",
      filter: "deals",
      onlyRecent: false,
      recentConversationIds: [],
    });

    expect(onlyDeals).toHaveLength(2);
    expect(onlyDeals.map((item) => item.id)).toEqual(["conversation-1", "conversation-3"]);

    const noDeal = filterConversations({
      conversations,
      search: "",
      filter: "no-deal",
      onlyRecent: false,
      recentConversationIds: [],
    });

    expect(noDeal).toHaveLength(1);
    expect(noDeal[0].id).toBe("conversation-2");
  });

  it("prioritizes recent list when onlyRecent is enabled", () => {
    const result = filterConversations({
      conversations,
      search: "",
      filter: "all",
      onlyRecent: true,
      recentConversationIds: ["conversation-2", "conversation-1", "conversation-3"],
    });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("conversation-2");
    expect(result[1].id).toBe("conversation-1");
    expect(result[2].id).toBe("conversation-3");
  });

  it("returns at most 5 recents even when source has more", () => {
    const manyConversationIds = Array.from({ length: 8 }, (_, idx) => `c-${idx}`);
    const many: ConversationSummary[] = manyConversationIds.map((id, index) => ({
      id,
      title: `Conversation ${index + 1}`,
      dealId: index % 2 === 0 ? "deal-x" : null,
      updatedAt: `2026-02-15T0${index}:00:00.000Z`,
      messageCount: index,
    }));

    const result = filterConversations({
      conversations: many,
      search: "",
      filter: "all",
      onlyRecent: true,
      recentConversationIds: manyConversationIds,
    });

    expect(result).toHaveLength(5);
    expect(result.map((item) => item.id)).toEqual([
      "c-0",
      "c-1",
      "c-2",
      "c-3",
      "c-4",
    ]);
  });
});

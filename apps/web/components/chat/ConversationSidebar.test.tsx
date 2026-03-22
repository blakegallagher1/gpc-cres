import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConversationSummary } from "@/lib/chat/types";
import { ConversationSidebar } from "./ConversationSidebar";

const CONVERSATIONS: ConversationSummary[] = [
  {
    id: "conversation-1",
    title: "Saved underwriting run",
    dealId: null,
    updatedAt: "2026-03-21T14:05:00.000Z",
    messageCount: 3,
  },
];

describe("ConversationSidebar", () => {
  it("closes the mobile drawer when starting a new chat from the header", () => {
    const onConversationSelect = vi.fn();
    const onToggle = vi.fn();

    render(
      <ConversationSidebar
        conversations={CONVERSATIONS}
        activeConversationId="conversation-1"
        onConversationSelect={onConversationSelect}
        open
        onToggle={onToggle}
        mobile
        showCollapsedTrigger
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start new chat" }));

    expect(onConversationSelect).toHaveBeenCalledWith(null);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps a collapsed mobile history trigger available for active threads", () => {
    render(
      <ConversationSidebar
        conversations={CONVERSATIONS}
        activeConversationId="conversation-1"
        onConversationSelect={vi.fn()}
        open={false}
        onToggle={vi.fn()}
        mobile
        showCollapsedTrigger
      />,
    );

    expect(screen.getByRole("button", { name: "Open history" })).toBeInTheDocument();
  });
});

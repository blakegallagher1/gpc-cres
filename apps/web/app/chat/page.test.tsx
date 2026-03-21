import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chat/ChatContainer", () => ({
  ChatContainer: () => <div>Chat Workspace</div>,
}));

import ChatPage from "./page";

describe("ChatPage", () => {
  it("renders the dedicated chat workspace route", () => {
    render(<ChatPage />);

    expect(screen.getByText("Chat Workspace")).toBeInTheDocument();
  });
});

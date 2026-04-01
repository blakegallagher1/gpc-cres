import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "@/components/chat/ChatInput";

describe("ChatInput", () => {
  it("submits the live textarea value when React state has not flushed yet", () => {
    const onSend = vi.fn();

    render(
      <ChatInput
        onSend={onSend}
        isStreaming={false}
        onStop={() => {}}
      />,
    );

    const textarea = screen.getByPlaceholderText("Ask something complex...") as HTMLTextAreaElement;
    textarea.value = "Store this memory now";

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("Store this memory now", undefined);
  });

  it("submits the typed value through the normal controlled path", () => {
    const onSend = vi.fn();

    render(
      <ChatInput
        onSend={onSend}
        isStreaming={false}
        onStop={() => {}}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Ask something complex..."), {
      target: { value: "Screen this property" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("Screen this property", undefined);
  });

  it("appends externally injected prompts into the composer", () => {
    const onSend = vi.fn();

    const { rerender } = render(
      <ChatInput
        onSend={onSend}
        isStreaming={false}
        onStop={() => {}}
      />,
    );

    rerender(
      <ChatInput
        onSend={onSend}
        isStreaming={false}
        onStop={() => {}}
        injectedPrompt={{
          id: "perplexity-web-research",
          text: "Search the web for current context, cite the strongest sources, and fold that into the run.",
        }}
      />,
    );

    expect(screen.getByDisplayValue(/Search the web for current context/)).toBeInTheDocument();
  });
});

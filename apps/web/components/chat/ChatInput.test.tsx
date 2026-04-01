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

    const textarea = screen.getByPlaceholderText(
      /Ask anything about your properties, deals, evidence, or next move/i,
    ) as HTMLTextAreaElement;
    textarea.value = "Store this memory now";

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("Store this memory now", undefined, {
      researchLane: "auto",
    });
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

    fireEvent.change(screen.getByPlaceholderText(/Ask anything about your properties, deals, evidence, or next move/i), {
      target: { value: "Screen this property" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("Screen this property", undefined, {
      researchLane: "auto",
    });
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

  it("lets the operator override the lane before sending", () => {
    const onSend = vi.fn();

    render(
      <ChatInput
        onSend={onSend}
        isStreaming={false}
        onStop={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Advanced controls/i }));
    fireEvent.click(screen.getByRole("button", { name: /Web research/i }));
    fireEvent.change(screen.getByPlaceholderText(/Ask anything about your properties, deals, evidence, or next move/i), {
      target: { value: "Find the latest zoning update and cite sources" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith(
      "Find the latest zoning update and cite sources",
      undefined,
      { researchLane: "public_web" },
    );
  });

  it("keeps advanced routing controls hidden until requested", () => {
    render(
      <ChatInput
        onSend={() => {}}
        isStreaming={false}
        onStop={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /Web research/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Advanced controls/i }));

    expect(screen.getByRole("button", { name: /Web research/i })).toBeInTheDocument();
  });

  it("collapses the composer chrome while a run is streaming", () => {
    render(
      <ChatInput
        onSend={() => {}}
        isStreaming
        onStop={() => {}}
      />,
    );

    expect(screen.getByText("Run in progress")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Advanced controls/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stop run/i })).toBeInTheDocument();
    expect(screen.queryByText(/Start in plain English/i)).not.toBeInTheDocument();
  });
});

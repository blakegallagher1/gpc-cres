"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, ChatStreamEvent } from "./types";
import { parseSSEStream } from "./stream";

export function useChat(options?: { dealId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      try {
        abortRef.current = new AbortController();
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            conversationId,
            dealId: options?.dealId,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) throw new Error("Chat request failed");

        let assistantContent = "";
        let agentName = "";
        const assistantId = crypto.randomUUID();
        const applyAssistantContent = (content: string) => {
          assistantContent = content;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content } : m,
            ),
          );
        };

        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
          },
        ]);

        for await (const event of parseSSEStream(response)) {
          switch (event.type) {
            case "text_delta":
              applyAssistantContent(assistantContent + event.content);
              break;
            case "agent_progress":
              if (event.partialOutput) {
                applyAssistantContent(event.partialOutput);
              }
              if (event.lastAgentName) {
                agentName = event.lastAgentName;
                setCurrentAgent(event.lastAgentName);
              }
              break;
            case "agent_switch":
              agentName = event.agentName;
              setCurrentAgent(event.agentName);
              break;
            case "handoff":
              agentName = event.toAgent ?? event.to;
              setCurrentAgent(agentName);
              break;
            case "tool_start":
            case "tool_end":
              // Stream presenter and chat container render these events.
              break;
            case "tool_call":
              // Could render tool call cards in the future
              break;
            case "done":
              setConversationId(event.conversationId ?? null);
              break;
            case "error":
              console.error("Chat error:", event.message);
              break;
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Chat error:", err);
        }
      } finally {
        setIsStreaming(false);
        setCurrentAgent(null);
      }
    },
    [conversationId, options?.dealId],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    currentAgent,
    conversationId,
    sendMessage,
    stopStreaming,
    setMessages,
    setConversationId,
  };
}

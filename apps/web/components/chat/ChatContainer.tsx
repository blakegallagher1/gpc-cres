'use client';

import { useState, useCallback } from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ConversationSidebar } from './ConversationSidebar';
import { AgentIndicator } from './AgentIndicator';
import { DealSelector } from './DealSelector';
import type { ChatMessage } from './MessageBubble';

export function ChatContainer() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setIsStreaming(false);
    setCurrentAgent(null);
  }, [abortController]);

  const handleSend = useCallback(async (content: string) => {
    // Add user message immediately
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    setAbortController(controller);

    // Prepare assistant message placeholder
    const assistantId = crypto.randomUUID();
    let fullText = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationId,
          dealId: selectedDealId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      // Add empty assistant message to fill in via streaming
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'agent_switch') {
              setCurrentAgent(event.agentName || null);
            } else if (event.type === 'text_delta') {
              fullText += event.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                )
              );
            } else if (event.type === 'done') {
              if (event.conversationId) {
                setConversationId(event.conversationId);
              }
            } else if (event.type === 'error') {
              fullText += `\n\nError: ${event.message}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m
                )
              );
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      // Finalize agent name on the message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, agentName: currentAgent || 'Coordinator' }
            : m
        )
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped streaming
      } else {
        const errMsg = err instanceof Error ? err.message : 'Something went wrong';
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantId),
          {
            id: assistantId,
            role: 'assistant',
            content: `Sorry, I encountered an error: ${errMsg}`,
            createdAt: new Date().toISOString(),
            agentName: 'system',
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setCurrentAgent(null);
      setAbortController(null);
    }
  }, [conversationId, selectedDealId, currentAgent]);

  const handleSuggestion = useCallback((text: string) => {
    handleSend(text);
  }, [handleSend]);

  return (
    <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Conversation Sidebar */}
      <ConversationSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar with deal selector */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <DealSelector
            selectedDealId={selectedDealId}
            onSelect={setSelectedDealId}
          />
        </div>

        {/* Agent Indicator */}
        {currentAgent && <AgentIndicator agentName={currentAgent} />}

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            onSuggestionClick={handleSuggestion}
          />
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={handleStop}
        />
      </div>
    </div>
  );
}

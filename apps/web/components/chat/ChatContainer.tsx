'use client';

import { useState } from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ConversationSidebar } from './ConversationSidebar';
import { AgentIndicator } from './AgentIndicator';
import { DealSelector } from './DealSelector';
import type { ChatMessage } from './MessageBubble';

export function ChatContainer() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  // Temporary mock state until useChat hook is wired
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const currentAgent: string | null = null;

  const handleSend = async (content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Simulate assistant response (placeholder until useChat is connected)
    setIsStreaming(true);
    await new Promise((r) => setTimeout(r, 1200));

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        'This is a placeholder response. The chat API will be connected soon to provide real agent responses.',
      createdAt: new Date().toISOString(),
      agentName: 'coordinator',
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setIsStreaming(false);
  };

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
          <MessageList messages={messages} isStreaming={isStreaming} />
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={() => setIsStreaming(false)}
        />
      </div>
    </div>
  );
}

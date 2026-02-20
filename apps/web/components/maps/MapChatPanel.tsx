"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";
import { Map, ChevronRight, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { parseSSEStream } from "@/lib/chat/stream";
import {
  applyStreamingEvent,
  createStreamPresenterState,
  type StreamPresenterState,
} from "@/lib/chat/streamPresenter";
import type {
  ChatMessage,
  ChatStreamEvent,
} from "@/lib/chat/types";

type FeatureCollection = {
  type: "FeatureCollection";
  features: unknown[];
};

const PANEL_WIDTH = 380;

function tryParseGeoJSON(text: string): FeatureCollection | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      (parsed as { type: string }).type === "FeatureCollection" &&
      "features" in parsed &&
      Array.isArray((parsed as { features: unknown }).features)
    ) {
      return parsed as FeatureCollection;
    }
  } catch {
    // not valid JSON or not a FeatureCollection
  }
  return null;
}

function extractGeoJSONFromToolResult(result: unknown): FeatureCollection | null {
  if (typeof result === "string") return tryParseGeoJSON(result);
  if (result && typeof result === "object" && "type" in result) {
    const obj = result as { type: string; features?: unknown };
    if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
      return obj as FeatureCollection;
    }
  }
  return null;
}

interface MapChatPanelProps {
  onGeoJsonReceived?: (data: { type: "FeatureCollection"; features: unknown[] }) => void;
}

export function MapChatPanel({ onGeoJsonReceived }: MapChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [presenterState, setPresenterState] = useState<StreamPresenterState>(
    createStreamPresenterState()
  );
  const presenterRef = useRef<StreamPresenterState>(createStreamPresenterState());
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventCounterRef = useRef(0);

  const applyEvent = useCallback(
    (event: ChatStreamEvent) => {
      setMessages((current) => {
        const { nextState, nextMessages } = applyStreamingEvent(
          presenterRef.current,
          current,
          event,
          new Date().toISOString(),
          () => `map-chat-${Date.now()}-${++eventCounterRef.current}`
        );
        presenterRef.current = nextState;
        setPresenterState(nextState);
        return nextMessages;
      });

      if (event.type === "tool_result" || event.type === "tool_end") {
        const result =
          event.type === "tool_result"
            ? (event as { result?: unknown }).result
            : (event as { result?: unknown }).result;
        const geo = result ? extractGeoJSONFromToolResult(result) : null;
        if (geo && onGeoJsonReceived) onGeoJsonReceived(geo);
      }

      if (event.type === "agent_progress" && event.partialOutput) {
        const geo = tryParseGeoJSON(event.partialOutput);
        if (geo && onGeoJsonReceived) onGeoJsonReceived(geo);
      }

      if (event.type === "done") {
        setIsStreaming(false);
        const lastContent = presenterRef.current.assistantDraft;
        const geo = lastContent ? tryParseGeoJSON(lastContent) : null;
        if (geo && onGeoJsonReceived) onGeoJsonReceived(geo);
      }
    },
    [onGeoJsonReceived]
  );

  const handleSend = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };

      const reset = createStreamPresenterState();
      presenterRef.current = reset;
      setPresenterState(reset);
      setIsStreaming(true);
      setMessages((prev) => [...prev, userMessage]);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            intent: "market_trajectory",
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        for await (const event of parseSSEStream(res)) {
          applyEvent(event);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `Error: ${msg}`,
            createdAt: new Date().toISOString(),
            eventKind: "error",
          },
        ]);
      } finally {
        setIsStreaming(false);
      }
    },
    [applyEvent]
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="absolute right-0 top-4 z-[1000] flex items-center gap-1.5 rounded-l-lg border border-r-0 border-border bg-background px-3 py-2 text-sm font-medium shadow-md transition-colors hover:bg-muted"
        title={open ? "Close Trajectory Analysis" : "Open Trajectory Analysis"}
      >
        <Map className="h-4 w-4" />
        Trajectory Analysis
        {open ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-0 z-[999] flex h-full flex-col border-l border-border bg-background shadow-xl"
          style={{ width: PANEL_WIDTH }}
        >
          <Card className="flex h-full flex-col rounded-none border-0">
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b px-4 py-2">
                <h3 className="text-sm font-semibold">
                  Market Trajectory Agent
                </h3>
                <p className="text-xs text-muted-foreground">
                  Path of progress, permit heatmaps, gentrification indicators
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <MessageList
                  messages={messages}
                  isStreaming={isStreaming}
                  onSuggestionClick={(s) => handleSend(s)}
                />
              </div>
              <div className="border-t p-3">
                <ChatInput
                  onSend={handleSend}
                  isStreaming={isStreaming}
                  onStop={handleStop}
                />
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

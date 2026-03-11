"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";
import { Map, ChevronRight, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { parseSSEStream } from "@/lib/chat/stream";
import {
  applyStreamingEvent,
  createStreamPresenterState,
  type StreamPresenterState,
} from "@/lib/chat/streamPresenter";
import {
  buildMapContextInput,
  useMapChatDispatch,
  useMapChatState,
} from "@/lib/chat/MapChatContext";
import { mapFeaturesFromActionPayload } from "@/lib/chat/mapFeatureUtils";
import { parseToolResultMapFeatures } from "@/lib/chat/toolResultWrapper";
import type {
  ChatMessage,
  ChatStreamEvent,
} from "@/lib/chat/types";

const PANEL_WIDTH = 420;

interface MapChatPanelProps {
  parcelCount?: number;
  selectedCount?: number;
  viewportLabel?: string;
}

export function MapChatPanel({
  parcelCount,
  selectedCount,
  viewportLabel,
}: MapChatPanelProps) {
  const mapState = useMapChatState();
  const mapDispatch = useMapChatDispatch();
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

      if (event.type === "map_action") {
        mapDispatch({ type: "MAP_ACTION_RECEIVED", payload: event.payload });
        const features = mapFeaturesFromActionPayload(event.payload);
        if (features.length > 0) {
          mapDispatch({ type: "ADD_REFERENCED_FEATURES", features });
        }
      }

      if (
        (event.type === "tool_result" || event.type === "tool_end") &&
        event.result !== undefined
      ) {
        const features = parseToolResultMapFeatures(event.result);
        if (features?.length) {
          mapDispatch({ type: "ADD_REFERENCED_FEATURES", features });
        }
      }

      if (event.type === "done") {
        setIsStreaming(false);
      }
    },
    [mapDispatch]
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
      mapDispatch({ type: "SET_REFERENCED_FEATURES", features: [] });
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
            mapContext: buildMapContextInput(mapState),
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
    [applyEvent, mapDispatch, mapState]
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="absolute right-0 top-4 z-30 flex items-center gap-1.5 rounded-l-lg border border-r-0 border-border bg-background px-3 py-2 text-sm font-medium shadow-md transition-colors hover:bg-muted"
        title={open ? "Close Map Copilot" : "Open Map Copilot"}
      >
        <Map className="h-4 w-4" />
        Map Copilot
        {open ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-0 z-20 flex h-full flex-col map-panel shadow-xl rounded-none"
          style={{ width: PANEL_WIDTH }}
        >
          <Card className="flex h-full flex-col rounded-none border-0 bg-transparent">
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b px-4 py-2">
                <h3 className="text-sm font-semibold map-text-primary">
                  Map Copilot
                </h3>
                <p className="text-xs map-text-secondary">
                  Path of progress, permit heatmaps, gentrification indicators
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-medium">
                    {parcelCount ?? 0} Parcels
                  </span>
                  <span className="inline-flex items-center rounded-full bg-sky-500/20 text-sky-400 px-2 py-0.5 text-[10px] font-medium">
                    {selectedCount ?? 0} Selected
                  </span>
                </div>
                {viewportLabel ? (
                  <p className="text-[10px] map-text-muted mt-1">{viewportLabel}</p>
                ) : null}
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

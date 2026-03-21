"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Map, ChevronRight, ChevronLeft } from "lucide-react";
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
const PANEL_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

interface MapChatPanelProps {
  parcelCount?: number;
  selectedCount?: number;
  viewportLabel?: string;
}

/**
 * Slide-in copilot for map-specific parcel and location analysis.
 */
export function MapChatPanel({
  parcelCount,
  selectedCount,
  viewportLabel,
}: MapChatPanelProps) {
  const reduceMotion = useReducedMotion();
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
        onClick={() => setOpen((value) => !value)}
        className="absolute right-0 top-5 z-30 flex items-center gap-2 rounded-l-2xl border border-r-0 border-map-border bg-map-surface-overlay px-3 py-2 text-sm font-medium text-map-text-primary shadow-xl backdrop-blur-md transition-colors hover:bg-map-surface"
        title={open ? "Close Map Copilot" : "Open Map Copilot"}
      >
        <Map className="h-4 w-4" />
        Map Copilot
        {open ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: PANEL_WIDTH * 0.18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: PANEL_WIDTH * 0.18 }}
            transition={PANEL_TRANSITION}
            className="absolute right-0 top-0 z-20 flex h-full flex-col map-panel rounded-none shadow-2xl"
            style={{ width: PANEL_WIDTH }}
          >
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-map-border px-4 py-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-map-text-muted">
                  Parcel Copilot
                </p>
                <h3 className="mt-1 text-sm font-semibold text-map-text-primary">
                  Ask for zoning pressure, permit heat, and site-selection context.
                </h3>
                <div className="mt-3 flex items-center gap-4 text-[11px] text-map-text-secondary">
                  <span>{parcelCount ?? 0} parcels in view</span>
                  <span>{selectedCount ?? 0} selected</span>
                </div>
                {viewportLabel ? (
                  <p className="mt-2 text-[10px] text-map-text-muted">{viewportLabel}</p>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <MessageList
                  messages={messages}
                  isStreaming={isStreaming}
                  onSuggestionClick={(suggestion) => handleSend(suggestion)}
                  emptyState={{
                    eyebrow: "Map copilot",
                    title: "Ask the map to explain what this geography means.",
                    description:
                      "Use the copilot for parcel clusters, zoning patterns, permit momentum, and site-selection follow-up while you stay in the map.",
                    suggestions: [
                      "Show parcels over 5 acres in this area",
                      "Explain zoning on the selected parcels",
                      "Summarize permit activity nearby",
                      "Flag likely development constraints",
                    ],
                  }}
                />
              </div>
              <ChatInput
                onSend={handleSend}
                isStreaming={isStreaming}
                onStop={handleStop}
                placeholder="Ask the map copilot about this geography..."
                helperText="Use the map context directly. Selected parcels and viewport state are included in the request."
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

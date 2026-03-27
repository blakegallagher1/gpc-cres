"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  onClose?: () => void;
}

/**
 * Slide-in copilot for map-specific parcel and location analysis.
 */
export function MapChatPanel({
  parcelCount,
  selectedCount,
  viewportLabel,
  onClose,
}: MapChatPanelProps) {
  const reduceMotion = useReducedMotion();
  const mapState = useMapChatState();
  const mapDispatch = useMapChatDispatch();
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

  const contextSummary =
    selectedCount && selectedCount > 0
      ? `${selectedCount} selected`
      : mapState.spatialSelection
        ? "polygon active"
      : `${parcelCount ?? 0} in view`;

  const helperText = mapState.spatialSelection
    ? "Selected parcels, viewport bounds, and the active boundary travel with the request."
    : "Selected parcels and the current viewport travel with the request.";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, x: PANEL_WIDTH * 0.18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: PANEL_WIDTH * 0.18 }}
      transition={PANEL_TRANSITION}
      className="absolute right-0 top-0 z-20 flex h-full flex-col map-panel rounded-none shadow-2xl"
      style={{ width: `min(${PANEL_WIDTH}px, calc(100vw - 1rem))` }}
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-map-border px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-map-text-muted">
                Map copilot
              </p>
              <h3 className="text-sm font-semibold text-map-text-primary">
                Continue the run with the live geography already in scope.
              </h3>
              <p className="text-[11px] leading-5 text-map-text-secondary">
                Ask for screening, comparison, zoning pressure, permit momentum, and the next best parcel move without rebuilding context.
              </p>
            </div>
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 shrink-0 text-map-text-muted hover:text-map-text-primary"
                aria-label="Close map copilot"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-map-text-secondary">
            <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
              {parcelCount ?? 0} in view
            </Badge>
            <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
              {selectedCount ?? 0} selected
            </Badge>
            <Badge variant="outline" className="px-2.5 py-1 text-[9px]">
              {contextSummary}
            </Badge>
          </div>
          {viewportLabel ? (
            <p className="mt-2 text-[10px] leading-4 text-map-text-muted">{viewportLabel}</p>
          ) : null}
        </div>
        <Separator className="bg-map-border" />
        <ScrollArea className="min-h-0 flex-1">
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            onSuggestionClick={(suggestion) => handleSend(suggestion)}
            emptyState={{
              eyebrow: "Map copilot",
              title: "Use the active geography as the brief.",
              description:
                "Keep the boundary, selection, and map state in scope while you ask for ranking, screening, comparison, or the next move.",
              suggestions: [
                "Compare zoning on the selected parcels",
                "Rank this boundary by likely entitlement friction",
                "Summarize flood and wetland exposure nearby",
                "Give me the next parcel to underwrite",
              ],
            }}
          />
        </ScrollArea>
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={handleStop}
          placeholder="Ask for screening, comparison, or a next move..."
          helperText={helperText}
        />
      </div>
    </motion.div>
  );
}

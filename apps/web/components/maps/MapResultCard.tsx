"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, ChevronDown, ChevronUp, MapPin, Layers, BarChart3, FileSearch, Pin, PinOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CARD_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapResultCardData {
  /** Unique ID for this card (for dismiss/tracking) */
  id: string;
  /** Card title (e.g., "C2 — General Commercial", "7618 Copperfield Ct") */
  title: string;
  /** Subtitle (e.g., "3,412 parcels | 8,741 total acres") */
  subtitle?: string;
  /** Key-value stats to display prominently */
  stats?: Array<{ label: string; value: string | number }>;
  /** Table rows (for list results) */
  rows?: Array<Record<string, string | number | null>>;
  /** Table column definitions (keys of the row objects to display) */
  columns?: Array<{ key: string; label: string; align?: "left" | "right" }>;
  /** Narrative text from agent */
  narrative?: string;
  /** Actions available on this card */
  actions?: Array<{
    label: string;
    variant?: "primary" | "default";
    onClick: () => void;
  }>;
  /** Card type for icon selection */
  type?: "count" | "detail" | "list" | "comparison";
  /** ISO timestamp when pinned, if pinned */
  pinnedAt?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MapResultCardProps {
  card: MapResultCardData;
  isPinned?: boolean;
  onDismiss: (id: string) => void;
  onPin?: (card: MapResultCardData) => void;
  onContinueInChat?: (card: MapResultCardData) => void;
}

export function MapResultCard({ card, isPinned, onDismiss, onPin, onContinueInChat }: MapResultCardProps) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(true);
  const tableColumns = card.columns ?? [];

  const Icon = card.type === "count" ? BarChart3
    : card.type === "detail" ? FileSearch
    : card.type === "list" ? Layers
    : MapPin;

  const handleContinueInChat = useCallback(() => {
    onContinueInChat?.(card);
  }, [card, onContinueInChat]);

  const handlePin = useCallback(() => {
    onPin?.(card);
  }, [card, onPin]);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.97 }}
      transition={CARD_TRANSITION}
      className={cn(
        "pointer-events-auto w-[440px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border bg-map-surface-overlay shadow-2xl ring-1 backdrop-blur-md",
        isPinned
          ? "border-l-2 border-l-amber-500/60 border-t-map-accent/30 border-r-map-accent/30 border-b-map-accent/30 ring-amber-500/15"
          : "border-map-accent/30 ring-map-accent/20",
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-map-border px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-map-border bg-map-surface/70">
          <Icon className="h-4 w-4 text-map-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-map-text-primary">{card.title}</h3>
            {isPinned && (
              <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[8px] border-amber-500/40 text-amber-300">
                Pinned
              </Badge>
            )}
          </div>
          {card.subtitle && (
            <p className="mt-0.5 text-[11px] text-map-text-muted">{card.subtitle}</p>
          )}
          {isPinned && card.pinnedAt && (
            <p className="mt-0.5 text-[9px] text-map-text-muted">
              Pinned {new Date(card.pinnedAt).toLocaleDateString()} {new Date(card.pinnedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-map-text-muted transition-colors hover:bg-map-surface hover:text-map-text-primary"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {onPin && (
            <button
              type="button"
              onClick={handlePin}
              className={cn(
                "rounded-lg p-1.5 transition-colors hover:bg-map-surface hover:text-map-text-primary",
                isPinned ? "text-amber-400" : "text-map-text-muted",
              )}
              title={isPinned ? "Unpin insight" : "Pin insight"}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
          )}
          {!isPinned && (
            <button
              type="button"
              onClick={() => onDismiss(card.id)}
              className="rounded-lg p-1.5 text-map-text-muted transition-colors hover:bg-map-surface hover:text-map-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={CARD_TRANSITION}
          >
            {/* Stats row */}
            {card.stats && card.stats.length > 0 && (
              <div className="grid grid-cols-3 gap-px border-b border-map-border bg-map-border">
                {card.stats.slice(0, 6).map((stat) => (
                  <div key={stat.label} className="bg-map-surface-overlay px-3 py-2 text-center">
                    <div className="text-xs font-semibold text-map-text-primary">{stat.value}</div>
                    <div className="mt-1 flex justify-center">
                      <Badge variant="outline" className="px-1.5 py-0 text-[8px]">
                        {stat.label}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {card.rows && card.columns && card.rows.length > 0 && (
              <div className="border-b border-map-border">
                <ScrollArea className="max-h-48">
                  <Table className="text-[11px]">
                    <TableHeader className="bg-map-surface/50">
                      <TableRow>
                        {tableColumns.map((column) => (
                          <TableHead
                            key={column.key}
                            className={column.align === "right" ? "text-right" : "text-left"}
                          >
                            {column.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {card.rows.slice(0, 20).map((row, index) => (
                        <TableRow key={index}>
                          {tableColumns.map((column) => (
                            <TableCell
                              key={column.key}
                              className={column.align === "right" ? "text-right" : "text-left"}
                            >
                              {row[column.key] ?? "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {card.rows.length > 20 && (
                  <div className="px-3 py-1.5 text-center text-[10px] text-map-text-muted">
                    Showing 20 of {card.rows.length} results
                  </div>
                )}
              </div>
            )}

            {/* Narrative */}
            {card.narrative && (
              <div className="border-b border-map-border px-4 py-3">
                <Badge variant="outline" className="mb-2 px-2 py-0.5 text-[9px]">
                  Narrative
                </Badge>
                <p className="text-xs leading-relaxed text-map-text-primary">{card.narrative}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              {!isPinned && card.actions?.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  size="sm"
                  variant={action.variant === "primary" ? "default" : "outline"}
                  className={
                    action.variant === "primary"
                      ? "bg-map-accent text-[11px] text-white hover:bg-map-accent/90"
                      : "border-map-border bg-map-surface/50 text-[11px] text-map-text-primary hover:bg-map-surface"
                  }
                >
                  {action.label}
                </Button>
              ))}
              {isPinned && onPin && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handlePin}
                  className="border-amber-500/30 bg-map-surface/50 text-[11px] text-amber-300 hover:bg-map-surface hover:text-amber-200"
                >
                  <PinOff className="mr-1.5 h-3 w-3" />
                  Unpin
                </Button>
              )}
              {onContinueInChat && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleContinueInChat}
                  className="ml-auto border-map-border bg-map-surface/50 text-[11px] text-map-text-muted hover:bg-map-surface hover:text-map-text-primary"
                >
                  Continue in chat
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Container: manages a stack of result cards on the map
// ---------------------------------------------------------------------------

interface MapResultCardStackProps {
  cards: MapResultCardData[];
  pinnedCardIds?: Set<string>;
  onDismiss: (id: string) => void;
  onPin?: (card: MapResultCardData) => void;
  onContinueInChat?: (card: MapResultCardData) => void;
}

export function MapResultCardStack({ cards, pinnedCardIds, onDismiss, onPin, onContinueInChat }: MapResultCardStackProps) {
  const pinned = pinnedCardIds?.size
    ? cards.filter((c) => pinnedCardIds.has(c.id))
    : [];
  const unpinned = pinnedCardIds?.size
    ? cards.filter((c) => !pinnedCardIds.has(c.id))
    : cards;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-40 flex -translate-x-1/2 flex-col gap-3">
      {pinned.length > 0 && (
        <div className="pointer-events-none flex flex-col gap-3">
          <div className="pointer-events-auto flex items-center justify-center">
            <Badge variant="outline" className="px-2 py-0.5 text-[9px] border-amber-500/30 text-amber-300 bg-map-surface-overlay/80 backdrop-blur-sm">
              Pinned Insights
            </Badge>
          </div>
          <AnimatePresence>
            {pinned.map((card) => (
              <MapResultCard
                key={card.id}
                card={card}
                isPinned
                onDismiss={onDismiss}
                onPin={onPin}
                onContinueInChat={onContinueInChat}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
      <AnimatePresence>
        {unpinned.map((card) => (
          <MapResultCard
            key={card.id}
            card={card}
            onDismiss={onDismiss}
            onPin={onPin}
            onContinueInChat={onContinueInChat}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

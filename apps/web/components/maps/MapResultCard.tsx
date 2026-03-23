"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, ChevronDown, ChevronUp, MapPin, Layers, BarChart3, FileSearch } from "lucide-react";

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MapResultCardProps {
  card: MapResultCardData;
  onDismiss: (id: string) => void;
  onContinueInChat?: (card: MapResultCardData) => void;
}

export function MapResultCard({ card, onDismiss, onContinueInChat }: MapResultCardProps) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(true);

  const Icon = card.type === "count" ? BarChart3
    : card.type === "detail" ? FileSearch
    : card.type === "list" ? Layers
    : MapPin;

  const handleContinueInChat = useCallback(() => {
    onContinueInChat?.(card);
  }, [card, onContinueInChat]);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      transition={CARD_TRANSITION}
      className="pointer-events-auto w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-map-border bg-map-surface-overlay shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-map-border px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-map-border bg-map-surface/70">
          <Icon className="h-4 w-4 text-map-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-map-text-primary">{card.title}</h3>
          {card.subtitle && (
            <p className="mt-0.5 text-[11px] text-map-text-muted">{card.subtitle}</p>
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
          <button
            type="button"
            onClick={() => onDismiss(card.id)}
            className="rounded-lg p-1.5 text-map-text-muted transition-colors hover:bg-map-surface hover:text-map-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-map-text-muted">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Table */}
            {card.rows && card.columns && card.rows.length > 0 && (
              <div className="max-h-48 overflow-y-auto border-b border-map-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-map-border bg-map-surface/50">
                      {card.columns.map((col) => (
                        <th
                          key={col.key}
                          className={`px-3 py-1.5 font-medium text-map-text-muted ${
                            col.align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {card.rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-b border-map-border/50 hover:bg-map-surface/30">
                        {card.columns!.map((col) => (
                          <td
                            key={col.key}
                            className={`px-3 py-1.5 text-map-text-primary ${
                              col.align === "right" ? "text-right" : "text-left"
                            }`}
                          >
                            {row[col.key] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <p className="text-xs leading-relaxed text-map-text-primary">{card.narrative}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              {card.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    action.variant === "primary"
                      ? "bg-map-accent text-white hover:bg-map-accent/90"
                      : "border border-map-border bg-map-surface/50 text-map-text-primary hover:bg-map-surface"
                  }`}
                >
                  {action.label}
                </button>
              ))}
              {onContinueInChat && (
                <button
                  type="button"
                  onClick={handleContinueInChat}
                  className="ml-auto rounded-lg border border-map-border bg-map-surface/50 px-3 py-1.5 text-[11px] font-medium text-map-text-muted transition-colors hover:bg-map-surface hover:text-map-text-primary"
                >
                  Continue in chat
                </button>
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
  onDismiss: (id: string) => void;
  onContinueInChat?: (card: MapResultCardData) => void;
}

export function MapResultCardStack({ cards, onDismiss, onContinueInChat }: MapResultCardStackProps) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-30 flex flex-col gap-3">
      <AnimatePresence>
        {cards.map((card) => (
          <MapResultCard
            key={card.id}
            card={card}
            onDismiss={onDismiss}
            onContinueInChat={onContinueInChat}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

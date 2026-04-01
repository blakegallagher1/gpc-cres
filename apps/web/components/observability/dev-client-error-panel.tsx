"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCopy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  clearClientErrorLog,
  exportClientErrorLogJson,
  isClientErrorLogUiEnabled,
  subscribeClientErrorLog,
  type ClientErrorLogEntry,
} from "./client-error-log";

function EntryRow({ entry }: { entry: ClientErrorLogEntry }) {
  const [open, setOpen] = useState(false);
  const meta = entry.metadata;
  const hasMeta = meta && Object.keys(meta).length > 0;

  return (
    <div className="border-border rounded-md border px-2 py-1.5 text-xs">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
          {entry.capturedAt.slice(11, 23)}
        </span>
        <span className="text-destructive shrink-0 font-medium">{entry.source}</span>
        <span className="min-w-0 flex-1 break-words text-foreground">{entry.message}</span>
        {hasMeta || entry.componentStack ? (
          open ? (
            <ChevronUp className="size-4 shrink-0 opacity-60" />
          ) : (
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          )
        ) : null}
      </button>
      {open && entry.componentStack ? (
        <pre className="text-muted-foreground mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">
          {entry.componentStack}
        </pre>
      ) : null}
      {open && hasMeta ? (
        <pre className="text-muted-foreground mt-1 max-h-36 overflow-auto font-mono text-[10px]">
          {JSON.stringify(meta, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function DevClientErrorPanel() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly ClientErrorLogEntry[]>([]);

  useEffect(() => {
    setEnabled(isClientErrorLogUiEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return subscribeClientErrorLog(setEntries);
  }, [enabled]);

  const count = entries.length;

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportClientErrorLogJson());
    } catch {
      // ignore
    }
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-14 right-4 z-[100] flex max-w-[min(100vw-2rem,24rem)] flex-col items-end">
      {open ? (
        <Card className="pointer-events-auto mb-2 w-full border-destructive/30 bg-card/95 shadow-2xl backdrop-blur">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-sm font-semibold text-red-400">Client error log</CardTitle>
            <p className="text-muted-foreground text-[11px] leading-snug">
              Same events as telemetry + Sentry (dev session buffer). Unauthenticated traffic still
              logs here; server ingest needs org context.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={copyAll}>
                <ClipboardCopy className="mr-1 size-3.5" />
                Copy JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => clearClientErrorLog()}
              >
                <Trash2 className="mr-1 size-3.5" />
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[min(50vh,320px)] pr-2">
              <div className="flex flex-col gap-1.5">
                {entries.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-xs">No errors yet.</p>
                ) : (
                  entries.map((e) => <EntryRow key={e.id} entry={e} />)
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}
      <button
        type="button"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-destructive/40 bg-card/90 px-3 py-1.5 text-xs font-medium text-destructive shadow-lg backdrop-blur hover:bg-accent"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="size-2 rounded-full bg-red-500" aria-hidden />
        Errors
        <span className="text-muted-foreground font-mono">{count}</span>
      </button>
    </div>
  );
}

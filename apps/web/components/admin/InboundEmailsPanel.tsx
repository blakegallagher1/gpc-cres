"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface InboundEmail {
  id: string;
  source: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  receivedAt: string;
  parsedAt: string | null;
  parseStatus: "pending" | "parsed" | "failed" | "skipped";
  parseError: string | null;
  parsedDealId: string | null;
  parsedDealName: string | null;
  parsedFields: Record<string, unknown> | null;
}

interface InboundEmailsPanelProps {
  title?: string;
  limit?: number;
  maxHeightClassName?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const STATUS_META: Record<
  InboundEmail["parseStatus"],
  { label: string; className: string; Icon: typeof Clock }
> = {
  pending: {
    label: "PENDING",
    className: "bg-muted text-muted-foreground border-border",
    Icon: Clock,
  },
  parsed: {
    label: "PARSED",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    Icon: CheckCircle2,
  },
  failed: {
    label: "FAILED",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    Icon: XCircle,
  },
  skipped: {
    label: "SKIPPED",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    Icon: Mail,
  },
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatReceived(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type StatusFilter = "all" | InboundEmail["parseStatus"];

export function InboundEmailsPanel({
  title = "Inbound emails",
  limit = 50,
  maxHeightClassName = "max-h-[520px]",
}: InboundEmailsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reparsingId, setReparsingId] = useState<string | null>(null);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    return `/api/admin/inbound-emails?${params.toString()}`;
  }, [limit, statusFilter]);

  const { data, error, isLoading, mutate } = useSWR<{ emails: InboundEmail[] }>(
    url,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const emails = useMemo(() => data?.emails ?? [], [data]);

  const reparse = useCallback(
    async (emailId: string) => {
      setReparsingId(emailId);
      try {
        const res = await fetch(`/api/admin/inbound-emails/${emailId}/reparse`, {
          method: "POST",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        await mutate();
        toast.success("Email re-parsed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reparse");
      } finally {
        setReparsingId(null);
      }
    },
    [mutate],
  );

  const filterButtons: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "parsed", label: "Parsed" },
    { key: "skipped", label: "Skipped" },
    { key: "failed", label: "Failed" },
    { key: "pending", label: "Pending" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm tracking-wide uppercase">
          <span className="flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5" />
            {title}
          </span>
          {emails.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {emails.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-2 overflow-y-auto ${maxHeightClassName}`}>
        <div className="flex flex-wrap gap-1 pb-1">
          {filterButtons.map((btn) => (
            <Button
              key={btn.key}
              variant={statusFilter === btn.key ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setStatusFilter(btn.key)}
            >
              {btn.label}
            </Button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading inbound emails…
          </div>
        )}
        {error && !isLoading && (
          <p className="text-xs text-destructive">Failed to load inbound emails.</p>
        )}
        {!isLoading && emails.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            No inbound emails match this filter.
          </div>
        )}

        {emails.map((email) => {
          const meta = STATUS_META[email.parseStatus];
          const Icon = meta.Icon;
          return (
            <div
              key={email.id}
              className="rounded border border-border bg-card/30 p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-xs font-medium leading-snug">
                      {truncate(email.subject || "(no subject)", 90)}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground leading-snug">
                      {email.fromAddress} · {formatReceived(email.receivedAt)} ·{" "}
                      {email.source}
                    </p>
                    {email.parsedDealId && (
                      <Link
                        href={`/deals/${email.parsedDealId}`}
                        className="text-[10px] text-primary hover:underline"
                      >
                        {email.parsedDealName ?? "Open linked deal"} →
                      </Link>
                    )}
                    {email.parseError && (
                      <p className="text-[10px] text-destructive">
                        {truncate(email.parseError, 160)}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[9px] ${meta.className}`}>
                  {meta.label}
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => reparse(email.id)}
                  disabled={reparsingId === email.id}
                >
                  {reparsingId === email.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-1 h-3 w-3" />
                  )}
                  Reparse
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default InboundEmailsPanel;

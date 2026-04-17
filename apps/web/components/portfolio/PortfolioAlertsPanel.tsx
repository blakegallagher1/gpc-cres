"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  Clock,
  Loader2,
  TrendingDown,
  Flag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface PortfolioAlert {
  id: string;
  dealId: string | null;
  dealName: string | null;
  category: "deadline" | "financial_stale" | "stage_stuck" | "fit_drift" | "approval_pending";
  severity: "info" | "warn" | "urgent";
  title: string;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
}

interface PortfolioAlertsPanelProps {
  title?: string;
  limit?: number;
  maxHeightClassName?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const CATEGORY_ICON: Record<PortfolioAlert["category"], typeof Clock> = {
  deadline: Clock,
  financial_stale: TrendingDown,
  stage_stuck: Flag,
  fit_drift: AlertTriangle,
  approval_pending: Flag,
};

const SEVERITY_META: Record<PortfolioAlert["severity"], { className: string; label: string }> = {
  urgent: {
    className: "bg-destructive/10 text-destructive border-destructive/30",
    label: "URGENT",
  },
  warn: {
    className: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    label: "WARN",
  },
  info: {
    className: "bg-muted text-muted-foreground border-border",
    label: "INFO",
  },
};

export function PortfolioAlertsPanel({
  title = "Portfolio alerts",
  limit = 25,
  maxHeightClassName = "max-h-[520px]",
}: PortfolioAlertsPanelProps) {
  const { data, error, isLoading, mutate } = useSWR<{ alerts: PortfolioAlert[] }>(
    `/api/portfolio/alerts?limit=${limit}`,
    fetcher,
    { refreshInterval: 120_000 },
  );

  const alerts = useMemo(() => data?.alerts ?? [], [data]);

  const acknowledge = useCallback(
    async (alertId: string) => {
      try {
        const res = await fetch(`/api/portfolio/alerts/${alertId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "acknowledge" }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to acknowledge");
      }
    },
    [mutate],
  );

  const snooze = useCallback(
    async (alertId: string, days: number) => {
      try {
        const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const res = await fetch(`/api/portfolio/alerts/${alertId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "snooze", snoozeUntil: until }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to snooze");
      }
    },
    [mutate],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm tracking-wide uppercase">
          <span>{title}</span>
          {alerts.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-2 overflow-y-auto ${maxHeightClassName}`}>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading alerts…
          </div>
        )}
        {error && !isLoading && (
          <p className="text-xs text-destructive">Failed to load alerts.</p>
        )}
        {!isLoading && alerts.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            No active alerts across your portfolio.
          </div>
        )}

        {alerts.map((alert) => {
          const Icon = CATEGORY_ICON[alert.category];
          const severity = SEVERITY_META[alert.severity];
          return (
            <div
              key={alert.id}
              className="rounded border border-border/60 bg-card/30 p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium leading-snug">{alert.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {alert.summary}
                    </p>
                    {alert.dealId && (
                      <Link
                        href={`/deals/${alert.dealId}`}
                        className="text-[10px] text-primary hover:underline"
                      >
                        {alert.dealName ?? "Open deal"} →
                      </Link>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[9px] ${severity.className}`}>
                  {severity.label}
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => acknowledge(alert.id)}
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Ack
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => snooze(alert.id, 1)}
                  title="Snooze 1 day"
                >
                  <BellOff className="mr-1 h-3 w-3" /> 1d
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => snooze(alert.id, 7)}
                  title="Snooze 7 days"
                >
                  <BellOff className="mr-1 h-3 w-3" /> 7d
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default PortfolioAlertsPanel;

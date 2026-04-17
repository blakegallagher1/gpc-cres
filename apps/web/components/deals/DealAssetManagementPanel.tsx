"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface AssetPerformancePeriod {
  id: string;
  periodYear: number;
  periodMonth: number;
  rentBilled: number | null;
  rentCollected: number | null;
  vacancyUnits: number | null;
  totalUnits: number | null;
  operatingExpense: number | null;
  netOperatingIncome: number | null;
  notes: string | null;
  createdAt: string;
}

interface CapExItem {
  id: string;
  category: string;
  description: string;
  estimatedCost: number | null;
  actualCost: number | null;
  plannedFor: string | null;
  completedAt: string | null;
  status: string;
  vendor: string | null;
  notes: string | null;
}

interface TenantChangeEvent {
  id: string;
  tenantId: string | null;
  eventType: string;
  eventDate: string;
  rentDelta: number | null;
  notes: string | null;
}

interface DispositionReadiness {
  ready: boolean;
  score: number;
  factors: string[];
}

interface AssetPerformanceSummary {
  trailing12mRentCollected: number;
  trailing12mRentBilled: number;
  currentVacancyRate: number | null;
  noiTrend: Array<{ periodYear: number; periodMonth: number; noi: number | null }>;
  openCapexEstimatedCost: number;
  completedCapexActualCost: number;
  periodCount: number;
  latestPeriod: { periodYear: number; periodMonth: number } | null;
}

interface DealAssetManagementPanelProps {
  dealId: string;
}

const CAPEX_CATEGORIES = [
  "roof",
  "hvac",
  "paving",
  "plumbing",
  "electrical",
  "landscaping",
  "tenant_improvement",
  "other",
];

const CAPEX_STATUSES = ["planned", "in_progress", "completed", "canceled"];

const TENANT_EVENT_TYPES = [
  "move_in",
  "move_out",
  "renewal",
  "default",
  "eviction",
  "other",
];

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `$${Math.round(value).toLocaleString()}`;
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Performance tab
// ---------------------------------------------------------------------------

function PerformanceSection({ dealId }: { dealId: string }) {
  const periodsSwr = useSWR<{ periods: AssetPerformancePeriod[] }>(
    `/api/deals/${dealId}/performance`,
    fetcher,
  );
  const summarySwr = useSWR<{
    summary: AssetPerformanceSummary;
    readiness: DispositionReadiness;
  }>(`/api/deals/${dealId}/performance/summary`, fetcher);

  const [form, setForm] = useState({
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    rentBilled: "",
    rentCollected: "",
    vacancyUnits: "",
    totalUnits: "",
    operatingExpense: "",
    netOperatingIncome: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const parseNum = (v: string) =>
        v.trim() === "" ? null : Number(v);
      const res = await fetch(`/api/deals/${dealId}/performance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodYear: Number(form.periodYear),
          periodMonth: Number(form.periodMonth),
          rentBilled: parseNum(form.rentBilled),
          rentCollected: parseNum(form.rentCollected),
          vacancyUnits:
            form.vacancyUnits.trim() === "" ? null : Math.round(Number(form.vacancyUnits)),
          totalUnits:
            form.totalUnits.trim() === "" ? null : Math.round(Number(form.totalUnits)),
          operatingExpense: parseNum(form.operatingExpense),
          netOperatingIncome: parseNum(form.netOperatingIncome),
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Failed: ${res.status}`);
      }
      setForm((prev) => ({
        ...prev,
        rentBilled: "",
        rentCollected: "",
        vacancyUnits: "",
        totalUnits: "",
        operatingExpense: "",
        netOperatingIncome: "",
        notes: "",
      }));
      await Promise.all([periodsSwr.mutate(), summarySwr.mutate()]);
      toast.success("Performance recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }, [dealId, form, periodsSwr, summarySwr]);

  const readiness = summarySwr.data?.readiness;
  const summary = summarySwr.data?.summary;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm tracking-wide uppercase">
            Disposition readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summarySwr.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Computing…
            </p>
          )}
          {readiness && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={readiness.ready ? "default" : "secondary"}>
                {readiness.ready ? "Ready to consider disposition" : "Keep holding"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Score: {readiness.score}/100
              </span>
            </div>
          )}
          {readiness && readiness.factors.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
              {readiness.factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          {summary && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4 pt-2 border-t">
              <div>
                <div className="text-muted-foreground">T12 collected</div>
                <div className="font-medium">
                  {formatMoney(summary.trailing12mRentCollected)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">T12 billed</div>
                <div className="font-medium">
                  {formatMoney(summary.trailing12mRentBilled)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Vacancy</div>
                <div className="font-medium">
                  {formatPct(summary.currentVacancyRate)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Open capex</div>
                <div className="font-medium">
                  {formatMoney(summary.openCapexEstimatedCost)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm tracking-wide uppercase">
            Monthly performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {periodsSwr.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {periodsSwr.error && (
            <p className="text-sm text-destructive">Failed to load periods.</p>
          )}
          {!periodsSwr.isLoading && periodsSwr.data?.periods.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No performance recorded yet. Add the latest month below.
            </p>
          )}
          {periodsSwr.data && periodsSwr.data.periods.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-2">Period</th>
                    <th className="py-1 pr-2">Billed</th>
                    <th className="py-1 pr-2">Collected</th>
                    <th className="py-1 pr-2">OpEx</th>
                    <th className="py-1 pr-2">NOI</th>
                    <th className="py-1 pr-2">Vacancy</th>
                  </tr>
                </thead>
                <tbody>
                  {periodsSwr.data.periods.slice(0, 12).map((p) => {
                    const vacancy =
                      p.totalUnits && p.totalUnits > 0 && p.vacancyUnits !== null
                        ? p.vacancyUnits / p.totalUnits
                        : null;
                    return (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="py-1 pr-2 font-mono">
                          {formatMonth(p.periodYear, p.periodMonth)}
                        </td>
                        <td className="py-1 pr-2">{formatMoney(p.rentBilled)}</td>
                        <td className="py-1 pr-2">{formatMoney(p.rentCollected)}</td>
                        <td className="py-1 pr-2">{formatMoney(p.operatingExpense)}</td>
                        <td className="py-1 pr-2">{formatMoney(p.netOperatingIncome)}</td>
                        <td className="py-1 pr-2">{formatPct(vacancy)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">
              Record / update a period
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Input
                type="number"
                placeholder="Year"
                value={form.periodYear}
                onChange={(e) => setForm({ ...form, periodYear: Number(e.target.value) })}
              />
              <Input
                type="number"
                placeholder="Month (1-12)"
                min={1}
                max={12}
                value={form.periodMonth}
                onChange={(e) => setForm({ ...form, periodMonth: Number(e.target.value) })}
              />
              <Input
                type="number"
                placeholder="Rent billed"
                value={form.rentBilled}
                onChange={(e) => setForm({ ...form, rentBilled: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Rent collected"
                value={form.rentCollected}
                onChange={(e) => setForm({ ...form, rentCollected: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Vacancy units"
                value={form.vacancyUnits}
                onChange={(e) => setForm({ ...form, vacancyUnits: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Total units"
                value={form.totalUnits}
                onChange={(e) => setForm({ ...form, totalUnits: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Operating expense"
                value={form.operatingExpense}
                onChange={(e) => setForm({ ...form, operatingExpense: e.target.value })}
              />
              <Input
                type="number"
                placeholder="NOI"
                value={form.netOperatingIncome}
                onChange={(e) =>
                  setForm({ ...form, netOperatingIncome: e.target.value })
                }
              />
            </div>
            <Input
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={submit} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-3 w-3" />
                )}
                Save period
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CapEx tab
// ---------------------------------------------------------------------------

function CapExSection({ dealId }: { dealId: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ items: CapExItem[] }>(
    `/api/deals/${dealId}/capex`,
    fetcher,
  );

  const [form, setForm] = useState({
    category: "other",
    description: "",
    estimatedCost: "",
    actualCost: "",
    plannedFor: "",
    vendor: "",
    status: "planned",
  });
  const [submitting, setSubmitting] = useState(false);

  const createItem = useCallback(async () => {
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/capex`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          description: form.description.trim(),
          estimatedCost:
            form.estimatedCost.trim() === "" ? null : Number(form.estimatedCost),
          actualCost:
            form.actualCost.trim() === "" ? null : Number(form.actualCost),
          plannedFor: form.plannedFor || null,
          vendor: form.vendor.trim() || null,
          status: form.status,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Failed: ${res.status}`);
      }
      setForm({
        category: "other",
        description: "",
        estimatedCost: "",
        actualCost: "",
        plannedFor: "",
        vendor: "",
        status: "planned",
      });
      await mutate();
      toast.success("CapEx item added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }, [dealId, form, mutate]);

  const updateStatus = useCallback(
    async (itemId: string, status: string) => {
      try {
        const res = await fetch(`/api/deals/${dealId}/capex/${itemId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update");
      }
    },
    [dealId, mutate],
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!confirm("Delete this capex item?")) return;
      try {
        const res = await fetch(`/api/deals/${dealId}/capex/${itemId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Failed: ${res.status}`);
        }
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [dealId, mutate],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm tracking-wide uppercase">
          Capital expenditures
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {error && <p className="text-sm text-destructive">Failed to load capex items.</p>}

        {data && data.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No capex items yet.</p>
        )}

        {data && data.items.length > 0 && (
          <div className="space-y-2">
            {data.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-start gap-2 rounded border border-border/60 bg-card/30 p-2"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{item.category}</Badge>
                    <Badge
                      variant={
                        item.status === "completed"
                          ? "default"
                          : item.status === "canceled"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium">{item.description}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Est {formatMoney(item.estimatedCost)} · Actual{" "}
                    {formatMoney(item.actualCost)}
                    {item.vendor ? ` · Vendor ${item.vendor}` : ""}
                    {item.plannedFor ? ` · Planned ${item.plannedFor}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <select
                    value={item.status}
                    onChange={(e) => updateStatus(item.id, e.target.value)}
                    className="h-7 rounded border bg-background px-1 text-xs"
                  >
                    {CAPEX_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => deleteItem(item.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground">Add capex item</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="h-9 rounded border bg-background px-2 text-sm"
            >
              {CAPEX_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="h-9 rounded border bg-background px-2 text-sm"
            >
              {CAPEX_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Input
              type="date"
              placeholder="Planned for"
              value={form.plannedFor}
              onChange={(e) => setForm({ ...form, plannedFor: e.target.value })}
            />
            <Input
              placeholder="Description"
              className="md:col-span-3"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Estimated $"
              value={form.estimatedCost}
              onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Actual $"
              value={form.actualCost}
              onChange={(e) => setForm({ ...form, actualCost: e.target.value })}
            />
            <Input
              placeholder="Vendor (optional)"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={createItem} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3 w-3" />
              )}
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tenant events tab
// ---------------------------------------------------------------------------

function TenantEventsSection({ dealId }: { dealId: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ events: TenantChangeEvent[] }>(
    `/api/deals/${dealId}/tenant-events`,
    fetcher,
  );

  const [form, setForm] = useState({
    eventType: "move_in",
    eventDate: new Date().toISOString().slice(0, 10),
    rentDelta: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const createEvent = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/tenant-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventType: form.eventType,
          eventDate: form.eventDate,
          rentDelta: form.rentDelta.trim() === "" ? null : Number(form.rentDelta),
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Failed: ${res.status}`);
      }
      setForm({
        eventType: "move_in",
        eventDate: new Date().toISOString().slice(0, 10),
        rentDelta: "",
        notes: "",
      });
      await mutate();
      toast.success("Event recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }, [dealId, form, mutate]);

  const events = useMemo(() => data?.events ?? [], [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm tracking-wide uppercase">Tenant events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {error && <p className="text-sm text-destructive">Failed to load events.</p>}

        {!isLoading && events.length === 0 && (
          <p className="text-sm text-muted-foreground">No tenant events recorded.</p>
        )}

        {events.length > 0 && (
          <ol className="space-y-2 border-l-2 border-border/60 pl-3">
            {events.map((ev) => (
              <li key={ev.id} className="text-sm">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline">{ev.eventType}</Badge>
                  <span className="font-mono text-muted-foreground">{ev.eventDate}</span>
                  {ev.rentDelta !== null && (
                    <span
                      className={
                        ev.rentDelta >= 0 ? "text-emerald-600" : "text-destructive"
                      }
                    >
                      {ev.rentDelta >= 0 ? "+" : ""}
                      {formatMoney(ev.rentDelta)}/mo
                    </span>
                  )}
                </div>
                {ev.notes && <p className="mt-0.5 whitespace-pre-wrap">{ev.notes}</p>}
              </li>
            ))}
          </ol>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground">Add event</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <select
              value={form.eventType}
              onChange={(e) => setForm({ ...form, eventType: e.target.value })}
              className="h-9 rounded border bg-background px-2 text-sm"
            >
              {TENANT_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Rent delta $/mo (optional)"
              value={form.rentDelta}
              onChange={(e) => setForm({ ...form, rentDelta: e.target.value })}
            />
          </div>
          <Input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={createEvent} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3 w-3" />
              )}
              Add event
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Outer panel
// ---------------------------------------------------------------------------

export function DealAssetManagementPanel({ dealId }: DealAssetManagementPanelProps) {
  return (
    <Tabs defaultValue="performance" className="w-full">
      <TabsList>
        <TabsTrigger value="performance" className="text-xs tracking-[0.08em]">
          Performance
        </TabsTrigger>
        <TabsTrigger value="capex" className="text-xs tracking-[0.08em]">
          CapEx
        </TabsTrigger>
        <TabsTrigger value="tenants" className="text-xs tracking-[0.08em]">
          Tenant events
        </TabsTrigger>
      </TabsList>
      <TabsContent value="performance">
        <PerformanceSection dealId={dealId} />
      </TabsContent>
      <TabsContent value="capex">
        <CapExSection dealId={dealId} />
      </TabsContent>
      <TabsContent value="tenants">
        <TenantEventsSection dealId={dealId} />
      </TabsContent>
    </Tabs>
  );
}

export default DealAssetManagementPanel;

"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ContingencyCategory =
  | "title"
  | "survey"
  | "environmental"
  | "appraisal"
  | "financing"
  | "inspection"
  | "hoa"
  | "zoning"
  | "utilities"
  | "other";

type ContingencyStatus =
  | "open"
  | "in_progress"
  | "satisfied"
  | "waived"
  | "failed";

interface Contingency {
  id: string;
  orgId: string;
  dealId: string;
  category: ContingencyCategory;
  title: string;
  description: string | null;
  status: ContingencyStatus;
  deadline: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  satisfiedAt: string | null;
  satisfiedBy: string | null;
  satisfactionNotes: string | null;
  noticeDaysBeforeDeadline: number;
  createdAt: string;
  updatedAt: string;
}

interface DealContingenciesPanelProps {
  dealId: string;
  currentUserId?: string | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

const CATEGORIES: ContingencyCategory[] = [
  "title",
  "survey",
  "environmental",
  "appraisal",
  "financing",
  "inspection",
  "hoa",
  "zoning",
  "utilities",
  "other",
];

const STATUSES: ContingencyStatus[] = [
  "open",
  "in_progress",
  "satisfied",
  "waived",
  "failed",
];

const STATUS_ORDER: Record<ContingencyStatus, number> = {
  open: 0,
  in_progress: 1,
  failed: 2,
  waived: 3,
  satisfied: 4,
};

const STATUS_BADGE_CLASS: Record<ContingencyStatus, string> = {
  open: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  satisfied: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  waived: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
};

const CATEGORY_LABEL: Record<ContingencyCategory, string> = {
  title: "Title",
  survey: "Survey",
  environmental: "Environmental",
  appraisal: "Appraisal",
  financing: "Financing",
  inspection: "Inspection",
  hoa: "HOA",
  zoning: "Zoning",
  utilities: "Utilities",
  other: "Other",
};

function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatRelativeDeadline(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "due today";
  if (diffDays === 1) return "due tomorrow";
  return `in ${diffDays}d`;
}

function isPastDue(deadlineIso: string | null, status: ContingencyStatus): boolean {
  if (!deadlineIso) return false;
  if (status === "satisfied" || status === "waived") return false;
  return new Date(deadlineIso).getTime() < Date.now();
}

function groupByStatus(rows: Contingency[]): Contingency[] {
  // Already sorted by deadline asc from server. Re-sort across statuses so
  // open/in_progress surface first, satisfied/waived sink to the bottom.
  return [...rows].sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    if (a.deadline && b.deadline) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function DealContingenciesPanel({
  dealId,
  currentUserId,
}: DealContingenciesPanelProps) {
  const { data, error, isLoading, mutate } = useSWR<{
    contingencies: Contingency[];
  }>(`/api/deals/${dealId}/contingencies`, fetcher);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState<ContingencyCategory>("title");
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newNoticeDays, setNewNoticeDays] = useState<number>(7);
  const [newOwnerUserId, setNewOwnerUserId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const sorted = useMemo(
    () => groupByStatus(data?.contingencies ?? []),
    [data],
  );

  const resetForm = useCallback(() => {
    setNewCategory("title");
    setNewTitle("");
    setNewDeadline("");
    setNewNoticeDays(7);
    setNewOwnerUserId("");
  }, []);

  const submitCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (title.length === 0) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      const deadlineIso = newDeadline ? new Date(newDeadline).toISOString() : null;
      const res = await fetch(`/api/deals/${dealId}/contingencies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          title,
          deadline: deadlineIso,
          noticeDaysBeforeDeadline: newNoticeDays,
          ownerUserId: newOwnerUserId || null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Failed: ${res.status}`);
      }
      resetForm();
      setShowAddForm(false);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create contingency");
    } finally {
      setSubmitting(false);
    }
  }, [
    dealId,
    mutate,
    newCategory,
    newDeadline,
    newNoticeDays,
    newOwnerUserId,
    newTitle,
    resetForm,
  ]);

  const updateStatus = useCallback(
    async (contingencyId: string, status: ContingencyStatus) => {
      try {
        let satisfactionNotes: string | undefined;
        if (status === "satisfied") {
          const input = window.prompt(
            "Satisfaction notes (how was this contingency cleared?)",
          );
          if (input === null) return; // cancelled
          satisfactionNotes = input.trim() || undefined;
        }
        const res = await fetch(
          `/api/deals/${dealId}/contingencies/${contingencyId}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              status,
              ...(satisfactionNotes !== undefined
                ? { satisfactionNotes }
                : {}),
            }),
          },
        );
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

  const deleteRow = useCallback(
    async (contingencyId: string) => {
      if (!confirm("Delete this contingency? This cannot be undone.")) return;
      try {
        const res = await fetch(
          `/api/deals/${dealId}/contingencies/${contingencyId}`,
          { method: "DELETE" },
        );
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
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm tracking-wide uppercase flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Contingencies
        </CardTitle>
        <Button
          size="sm"
          variant={showAddForm ? "secondary" : "default"}
          onClick={() => setShowAddForm((v) => !v)}
        >
          <Plus className="mr-1 h-3 w-3" /> {showAddForm ? "Cancel" : "Add"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAddForm && (
          <div className="rounded border border-border bg-muted p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Category</span>
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as ContingencyCategory)
                  }
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Title</span>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Phase I ESA"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Deadline</span>
                <Input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Notice days</span>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={newNoticeDays}
                  onChange={(e) =>
                    setNewNoticeDays(Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground">
                  Owner (user id) — leave blank for unassigned
                </span>
                <Input
                  value={newOwnerUserId}
                  onChange={(e) => setNewOwnerUserId(e.target.value.trim())}
                  placeholder={currentUserId ?? ""}
                />
                {currentUserId && (
                  <button
                    type="button"
                    onClick={() => setNewOwnerUserId(currentUserId)}
                    className="self-start text-[10px] text-primary underline"
                  >
                    Assign to me
                  </button>
                )}
              </label>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={submitCreate} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-3 w-3" />
                )}
                Create
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading contingencies…
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">Failed to load contingencies.</p>
        )}

        {!isLoading && sorted.length === 0 && !showAddForm && (
          <p className="text-sm text-muted-foreground">
            No contingencies tracked yet. Add title, survey, environmental, or other
            diligence items with deadlines to get alerts before they slip.
          </p>
        )}

        {sorted.map((row) => {
          const overdue = isPastDue(row.deadline, row.status);
          return (
            <div
              key={row.id}
              className="rounded border border-border bg-card/30 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="uppercase tracking-wide text-[10px]">
                    {CATEGORY_LABEL[row.category]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase ${STATUS_BADGE_CLASS[row.status]}`}
                  >
                    {row.status.replace("_", " ")}
                  </Badge>
                  <span className="text-sm font-medium">{row.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => deleteRow(row.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div>
                  <span className="block text-[10px] uppercase tracking-wide">
                    Deadline
                  </span>
                  {row.deadline ? (
                    <span
                      className={
                        overdue ? "text-destructive font-medium" : undefined
                      }
                    >
                      {formatRelativeDeadline(row.deadline)} ·{" "}
                      {formatAbsoluteDate(row.deadline)}
                    </span>
                  ) : (
                    <span>None</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wide">
                    Owner
                  </span>
                  <span>
                    {row.ownerEmail ??
                      (row.ownerUserId
                        ? row.ownerUserId.slice(0, 8)
                        : "Unassigned")}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wide">
                    Notice window
                  </span>
                  <span>{row.noticeDaysBeforeDeadline}d before</span>
                </div>
              </div>

              {row.satisfactionNotes && (
                <p className="rounded bg-emerald-500/5 border border-emerald-500/20 p-2 text-xs">
                  <span className="block text-[10px] uppercase tracking-wide text-emerald-500">
                    Satisfied
                  </span>
                  {row.satisfactionNotes}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <select
                    value={row.status}
                    onChange={(e) =>
                      updateStatus(row.id, e.target.value as ContingencyStatus)
                    }
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                {row.status !== "satisfied" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => updateStatus(row.id, "satisfied")}
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Mark satisfied
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default DealContingenciesPanel;

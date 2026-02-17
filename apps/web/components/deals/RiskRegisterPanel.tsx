"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type RiskSeverity = "low" | "medium" | "high" | "critical";
type RiskStatus = "open" | "monitoring" | "mitigating" | "accepted" | "closed";

type RiskItem = {
  id: string;
  orgId: string;
  dealId: string;
  category: string | null;
  title: string | null;
  description: string | null;
  severity: RiskSeverity | null;
  status: RiskStatus | null;
  owner: string | null;
  source: string | null;
  score: number | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type RiskResponse = {
  risks: RiskItem[];
};

type RiskPayload = {
  category?: string;
  title?: string;
  description?: string;
  severity?: RiskSeverity;
  status?: RiskStatus;
  owner?: string;
  source?: string;
  score?: number;
  notes?: string;
};

type RiskFormState = {
  category: string;
  title: string;
  description: string;
  severity: RiskSeverity | "";
  status: RiskStatus | "";
  owner: string;
  source: string;
  score: string;
  notes: string;
};

const emptyForm: RiskFormState = {
  category: "",
  title: "",
  description: "",
  severity: "",
  status: "",
  owner: "",
  source: "",
  score: "",
  notes: "",
};

const severities: RiskSeverity[] = ["low", "medium", "high", "critical"];
const statuses: RiskStatus[] = ["open", "monitoring", "mitigating", "accepted", "closed"];

function formatScore(value: number | null): string {
  if (value === null) return "—";
  return `${value}/100`;
}

function trimOrUndefined(value: string): string | undefined {
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

function parseScore(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  if (parsed < 0 || parsed > 100) {
    return undefined;
  }
  return parsed;
}

export function RiskRegisterPanel({ dealId }: { dealId: string }) {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RiskFormState>(emptyForm);

  const fetchRisks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/risks`);
      const data = (await res.json()) as RiskResponse;
      setRisks(data.risks ?? []);
    } catch (error) {
      console.error("Failed to load risks", error);
      toast.error("Failed to load risks");
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (!dealId) return;
    void fetchRisks();
  }, [dealId, fetchRisks]);

  const list = useMemo(() => risks, [risks]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  const fillFromRecord = useCallback((risk: RiskItem) => {
    setEditingId(risk.id);
    setForm({
      category: risk.category ?? "",
      title: risk.title ?? "",
      description: risk.description ?? "",
      severity: risk.severity ?? "",
      status: risk.status ?? "",
      owner: risk.owner ?? "",
      source: risk.source ?? "",
      score: risk.score === null ? "" : String(risk.score),
      notes: risk.notes ?? "",
    });
  }, []);

  const buildPayload = useCallback((): RiskPayload => {
    const payload: RiskPayload = {};
    const score = parseScore(form.score);
    const category = trimOrUndefined(form.category);
    const title = trimOrUndefined(form.title);
    const description = trimOrUndefined(form.description);
    const owner = trimOrUndefined(form.owner);
    const source = trimOrUndefined(form.source);
    const notes = trimOrUndefined(form.notes);

    if (category) payload.category = category;
    if (title) payload.title = title;
    if (description) payload.description = description;
    if (form.severity) payload.severity = form.severity;
    if (form.status) payload.status = form.status;
    if (owner) payload.owner = owner;
    if (source) payload.source = source;
    if (score !== undefined) payload.score = score;
    if (notes) payload.notes = notes;

    return payload;
  }, [form]);

  const submit = useCallback(async () => {
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      toast.error("Provide at least one risk field");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/deals/${dealId}/risks`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = (await res.json()) as { risk?: RiskItem; error?: string };
      if (!res.ok || !data.risk) {
        throw new Error("Failed to save");
      }
      const saved = data.risk;
      setRisks((prev) =>
        editingId ? prev.map((risk) => (risk.id === saved.id ? saved : risk)) : [saved, ...prev],
      );
      resetForm();
      toast.success(editingId ? "Risk updated" : "Risk added");
    } catch (error) {
      console.error("Error saving risk", error);
      toast.error("Failed to save risk");
    } finally {
      setSaving(false);
    }
  }, [buildPayload, dealId, editingId, resetForm]);

  const remove = useCallback(async (riskId: string) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/risks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: riskId }),
      });
      if (!res.ok) {
        throw new Error("Failed to delete");
      }
      setRisks((prev) => prev.filter((risk) => risk.id !== riskId));
      if (editingId === riskId) {
        resetForm();
      }
      toast.success("Risk deleted");
    } catch (error) {
      console.error("Error deleting risk", error);
      toast.error("Failed to delete risk");
    }
  }, [dealId, editingId, resetForm]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Risk Register</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Regulatory / Environmental / Financial"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Triage disqualifier / Risk event"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={2}
                placeholder="Describe the risk and context."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <Select
                value={form.severity || undefined}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, severity: value as RiskSeverity }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {severities.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {severity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status || undefined}
                onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as RiskStatus }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Owner</Label>
              <Input
                value={form.owner}
                onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
                placeholder="Name or role"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Input
                value={form.source}
                onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                placeholder="Triage / Internal"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Risk Score (0-100)</Label>
              <Input
                value={form.score}
                onChange={(event) => setForm((prev) => ({ ...prev, score: event.target.value }))}
                placeholder="0-100"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={2}
                placeholder="Mitigation, assumptions, follow-up actions."
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-1.5" onClick={submit} disabled={saving}>
              {saving ? (
                "Saving..."
              ) : editingId ? (
                <>
                  <Save className="h-4 w-4" />
                  Update Risk
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Risk
                </>
              )}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={resetForm}
                disabled={saving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            ) : null}
          </div>
        </Card>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading risks…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">No risks tracked yet.</p>
        ) : (
          <div className="space-y-2">
            {list.map((risk) => (
              <div key={risk.id} className="rounded border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {risk.title ?? "Untitled risk"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {risk.category ?? "Uncategorized"}
                      {risk.severity ? ` · ${risk.severity}` : ""}
                      {risk.score !== null ? ` · ${formatScore(risk.score)}` : ""}
                    </p>
                    {risk.description ? (
                      <p className="text-xs text-muted-foreground">{risk.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fillFromRecord(risk)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void remove(risk.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {risk.status ? <span>Status: {risk.status}</span> : null}
                  {risk.owner ? <span>Owner: {risk.owner}</span> : null}
                  {risk.source ? <span>Source: {risk.source}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

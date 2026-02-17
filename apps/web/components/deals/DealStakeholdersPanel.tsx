"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type StakeholderRole =
  | "SPONSOR"
  | "EQUITY_PARTNER"
  | "LENDER"
  | "BROKER"
  | "LAWYER"
  | "TITLE_COMPANY"
  | "CONTRACTOR"
  | "OTHER";

type StakeholderItem = {
  id: string;
  orgId: string;
  dealId: string;
  role: StakeholderRole;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  equityOwnership: string | null;
  decisionRights: string[] | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type StakeholdersResponse = {
  stakeholders: StakeholderItem[];
};

type StakeholderPayload = {
  name?: string;
  role?: StakeholderRole;
  company?: string;
  email?: string;
  phone?: string;
  equityOwnership?: number;
  decisionRights?: string[];
  notes?: string;
};

type FormState = {
  name: string;
  role: StakeholderRole | "";
  company: string;
  email: string;
  phone: string;
  equityOwnership: string;
  decisionRights: string;
  notes: string;
};

const STAKEHOLDER_ROLES: StakeholderRole[] = [
  "SPONSOR",
  "EQUITY_PARTNER",
  "LENDER",
  "BROKER",
  "LAWYER",
  "TITLE_COMPANY",
  "CONTRACTOR",
  "OTHER",
];

const EMPTY_FORM: FormState = {
  name: "",
  role: "",
  company: "",
  email: "",
  phone: "",
  equityOwnership: "",
  decisionRights: "",
  notes: "",
};

function parseEquity(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatValue(value: string | null): string {
  if (value === null) {
    return "—";
  }
  return value;
}

function buildPayload(form: FormState): StakeholderPayload {
  const payload: StakeholderPayload = {};
  if (form.name.trim()) {
    payload.name = form.name.trim();
  }
  if (form.role !== "") {
    payload.role = form.role;
  }
  if (form.company.trim()) {
    payload.company = form.company.trim();
  }
  if (form.email.trim()) {
    payload.email = form.email.trim();
  }
  if (form.phone.trim()) {
    payload.phone = form.phone.trim();
  }
  const ownership = parseEquity(form.equityOwnership);
  if (ownership !== undefined) {
    payload.equityOwnership = ownership;
  }
  const decisionRights = form.decisionRights
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (decisionRights.length > 0) {
    payload.decisionRights = decisionRights;
  }
  if (form.notes.trim()) {
    payload.notes = form.notes.trim();
  }
  return payload;
}

export function DealStakeholdersPanel({ dealId }: { dealId: string }) {
  const [stakeholders, setStakeholders] = useState<StakeholderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchStakeholders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/stakeholders`);
      const data = (await res.json()) as StakeholdersResponse;
      setStakeholders(data.stakeholders ?? []);
    } catch (error) {
      console.error("Failed to load stakeholders", error);
      toast.error("Failed to load stakeholders");
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (!dealId) return;
    void fetchStakeholders();
  }, [dealId, fetchStakeholders]);

  const list = useMemo(() => stakeholders, [stakeholders]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const fillFromStakeholder = useCallback((item: StakeholderItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      role: item.role,
      company: item.company ?? "",
      email: item.email ?? "",
      phone: item.phone ?? "",
      equityOwnership: item.equityOwnership ?? "",
      decisionRights: item.decisionRights ? item.decisionRights.join(", ") : "",
      notes: item.notes ?? "",
    });
  }, []);

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const submit = useCallback(async () => {
    const payload = buildPayload(form);
    if (editingId ? Object.keys(payload).length === 0 : (!payload.name || !payload.role)) {
      toast.error("Stakeholder requires at least a name and role.");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/deals/${dealId}/stakeholders`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = (await res.json()) as { stakeholder?: StakeholderItem };
      if (!res.ok || !data.stakeholder) {
        throw new Error("Failed to save stakeholder");
      }
      const savedStakeholder = data.stakeholder;
      setStakeholders((prev) =>
        editingId
          ? prev.map((item) => (item.id === savedStakeholder.id ? savedStakeholder : item))
          : [savedStakeholder, ...prev],
      );
      resetForm();
      toast.success(editingId ? "Stakeholder updated" : "Stakeholder added");
    } catch (error) {
      console.error("Error saving stakeholder", error);
      toast.error("Failed to save stakeholder");
    } finally {
      setSaving(false);
    }
  }, [dealId, editingId, form, resetForm]);

  const remove = useCallback(
    async (stakeholderId: string) => {
      try {
        const res = await fetch(`/api/deals/${dealId}/stakeholders`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: stakeholderId }),
        });
        if (!res.ok) {
          throw new Error("Failed to delete");
        }
        setStakeholders((prev) => prev.filter((item) => item.id !== stakeholderId));
        if (editingId === stakeholderId) {
          resetForm();
        }
        toast.success("Stakeholder deleted");
      } catch (error) {
        console.error("Error deleting stakeholder", error);
        toast.error("Failed to delete stakeholder");
      }
    },
    [dealId, editingId, resetForm],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Deal Stakeholders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Stakeholder name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <select
                value={form.role}
                onChange={(event) => updateField("role", event.target.value as StakeholderRole | "")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select role</option>
                {STAKEHOLDER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Company</Label>
              <Input
                value={form.company}
                onChange={(event) => updateField("company", event.target.value)}
                placeholder="Company"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="Email"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="Phone"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Equity Ownership (%)</Label>
              <Input
                value={form.equityOwnership}
                onChange={(event) => updateField("equityOwnership", event.target.value)}
                placeholder="12.5"
                type="number"
                step="0.01"
                min="0"
                max="100"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Decision Rights (comma-separated)</Label>
              <Input
                value={form.decisionRights}
                onChange={(event) => updateField("decisionRights", event.target.value)}
                placeholder="approve_changes, veto_terms, sign_documents"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={2}
                placeholder="Additional context"
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
                  Update Stakeholder
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Stakeholder
                </>
              )}
            </Button>
            {editingId ? (
              <Button variant="outline" onClick={resetForm} disabled={saving} className="gap-1.5">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            ) : null}
          </div>
        </Card>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading stakeholders...</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">No stakeholders added yet.</p>
        ) : (
          <div className="space-y-2">
            {list.map((item) => (
              <Card key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Role: {item.role}</p>
                    {item.company ? (
                      <p className="text-xs text-muted-foreground">Company: {item.company}</p>
                    ) : null}
                    {item.email ? (
                      <p className="text-xs text-muted-foreground">Email: {item.email}</p>
                    ) : null}
                    {item.phone ? (
                      <p className="text-xs text-muted-foreground">Phone: {item.phone}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Equity ownership: {formatValue(item.equityOwnership)}%
                    </p>
                    {item.decisionRights && item.decisionRights.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Decision rights: {item.decisionRights.join(", ")}
                      </p>
                    ) : null}
                    {item.notes ? <p className="text-xs">{item.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => fillFromStakeholder(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

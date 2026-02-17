"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

type DealFinancingItem = {
  id: string;
  orgId: string;
  dealId: string;
  lenderName: string | null;
  facilityName: string | null;
  loanType: string | null;
  loanAmount: string | null;
  commitmentDate: string | null;
  fundedDate: string | null;
  interestRate: string | null;
  loanTermMonths: number | null;
  amortizationYears: number | null;
  ltvPercent: string | null;
  dscrRequirement: string | null;
  originationFeePercent: string | null;
  sourceUploadId: string | null;
  status: string | null;
  notes: string | null;
};

type FinancesResponse = {
  financings: DealFinancingItem[];
};

type DealFinancingPayload = {
  lenderName?: string;
  facilityName?: string;
  loanType?: string;
  loanAmount?: number;
  commitmentDate?: string;
  fundedDate?: string;
  interestRate?: number;
  loanTermMonths?: number;
  amortizationYears?: number;
  ltvPercent?: number;
  dscrRequirement?: number;
  originationFeePercent?: number;
  sourceUploadId?: string | null;
  status?: string;
  notes?: string;
};

type FormState = {
  lenderName: string;
  facilityName: string;
  loanType: string;
  loanAmount: string;
  commitmentDate: string;
  fundedDate: string;
  interestRate: string;
  loanTermMonths: string;
  amortizationYears: string;
  ltvPercent: string;
  dscrRequirement: string;
  originationFeePercent: string;
  sourceUploadId: string;
  status: string;
  notes: string;
};

const emptyForm: FormState = {
  lenderName: "",
  facilityName: "",
  loanType: "",
  loanAmount: "",
  commitmentDate: "",
  fundedDate: "",
  interestRate: "",
  loanTermMonths: "",
  amortizationYears: "",
  ltvPercent: "",
  dscrRequirement: "",
  originationFeePercent: "",
  sourceUploadId: "",
  status: "",
  notes: "",
};

function parsePositiveInt(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toPayload(value: string): number | undefined {
  return parseNumber(value);
}

export function DealFinancingPanel({ dealId }: { dealId: string }) {
  const [financings, setFinancings] = useState<DealFinancingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetchFinancings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/financings`);
      const data = (await res.json()) as FinancesResponse;
      setFinancings(data.financings ?? []);
    } catch {
      toast.error("Failed to load financings");
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (!dealId) return;
    void fetchFinancings();
  }, [dealId, fetchFinancings]);

  const list = useMemo(() => financings, [financings]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  const fillFromRecord = useCallback((item: DealFinancingItem) => {
    setEditingId(item.id);
    setForm({
      lenderName: item.lenderName ?? "",
      facilityName: item.facilityName ?? "",
      loanType: item.loanType ?? "",
      loanAmount: item.loanAmount ?? "",
      commitmentDate: item.commitmentDate ? item.commitmentDate.slice(0, 10) : "",
      fundedDate: item.fundedDate ? item.fundedDate.slice(0, 10) : "",
      interestRate: item.interestRate ?? "",
      loanTermMonths: item.loanTermMonths?.toString() ?? "",
      amortizationYears: item.amortizationYears?.toString() ?? "",
      ltvPercent: item.ltvPercent ?? "",
      dscrRequirement: item.dscrRequirement ?? "",
      originationFeePercent: item.originationFeePercent ?? "",
      sourceUploadId: item.sourceUploadId ?? "",
      status: item.status ?? "",
      notes: item.notes ?? "",
    });
  }, []);

  const updateField = useCallback(
    (field: keyof FormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const buildPayload = useCallback((): DealFinancingPayload => {
    const payload: DealFinancingPayload = {};
    if (form.lenderName.trim()) payload.lenderName = form.lenderName.trim();
    if (form.facilityName.trim()) payload.facilityName = form.facilityName.trim();
    if (form.loanType.trim()) payload.loanType = form.loanType.trim();
    const loanAmount = toPayload(form.loanAmount);
    if (loanAmount !== undefined) payload.loanAmount = loanAmount;
    if (form.commitmentDate.trim()) payload.commitmentDate = form.commitmentDate.trim();
    if (form.fundedDate.trim()) payload.fundedDate = form.fundedDate.trim();
    const interestRate = toPayload(form.interestRate);
    if (interestRate !== undefined) payload.interestRate = interestRate;
    const loanTermMonths = parsePositiveInt(form.loanTermMonths);
    if (loanTermMonths !== undefined) payload.loanTermMonths = loanTermMonths;
    const amortizationYears = parsePositiveInt(form.amortizationYears);
    if (amortizationYears !== undefined) payload.amortizationYears = amortizationYears;
    const ltvPercent = toPayload(form.ltvPercent);
    if (ltvPercent !== undefined) payload.ltvPercent = ltvPercent;
    const dscrRequirement = toPayload(form.dscrRequirement);
    if (dscrRequirement !== undefined) payload.dscrRequirement = dscrRequirement;
    const originationFeePercent = toPayload(form.originationFeePercent);
    if (originationFeePercent !== undefined) payload.originationFeePercent = originationFeePercent;
    if (form.sourceUploadId.trim()) payload.sourceUploadId = form.sourceUploadId.trim();
    if (form.status.trim()) payload.status = form.status.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();
    return payload;
  }, [form]);

  const submit = useCallback(async () => {
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      toast.error("Provide at least one value");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/deals/${dealId}/financings`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = (await res.json()) as { financing?: DealFinancingItem };
      if (!res.ok || !data.financing) {
        throw new Error("Failed to save");
      }
      const saved = data.financing;
      setFinancings((prev) => {
        if (editingId) {
          return prev.map((item) => (item.id === saved.id ? saved : item));
        }
        return [saved, ...prev];
      });
      resetForm();
      toast.success(editingId ? "Financing updated" : "Financing added");
    } catch (error) {
      console.error("Error saving financing", error);
      toast.error("Failed to save financing");
    } finally {
      setSaving(false);
    }
  }, [buildPayload, dealId, editingId, resetForm]);

  const remove = useCallback(async (financingId: string) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/financings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: financingId }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setFinancings((prev) => prev.filter((item) => item.id !== financingId));
      if (editingId === financingId) {
        resetForm();
      }
      toast.success("Financing deleted");
    } catch (error) {
      console.error("Error deleting financing", error);
      toast.error("Failed to delete financing");
    }
  }, [dealId, editingId, resetForm]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Deal Financings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Lender</Label>
              <Input
                value={form.lenderName}
                onChange={(e) => updateField("lenderName", e.target.value)}
                placeholder="First National Bank"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Facility</Label>
              <Input
                value={form.facilityName}
                onChange={(e) => updateField("facilityName", e.target.value)}
                placeholder="Acquisition facility"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Loan Type</Label>
              <Input
                value={form.loanType}
                onChange={(e) => updateField("loanType", e.target.value)}
                placeholder="CMBS / construction / bridge"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Loan Amount</Label>
              <Input
                value={form.loanAmount}
                onChange={(e) => updateField("loanAmount", e.target.value)}
                placeholder="2500000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Interest Rate (%)</Label>
              <Input
                value={form.interestRate}
                onChange={(e) => updateField("interestRate", e.target.value)}
                placeholder="7.25"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Loan Term (months)</Label>
              <Input
                value={form.loanTermMonths}
                onChange={(e) => updateField("loanTermMonths", e.target.value)}
                placeholder="360"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amortization (years)</Label>
              <Input
                value={form.amortizationYears}
                onChange={(e) => updateField("amortizationYears", e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Commitment Date</Label>
              <Input
                type="date"
                value={form.commitmentDate}
                onChange={(e) => updateField("commitmentDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Funded Date</Label>
              <Input
                type="date"
                value={form.fundedDate}
                onChange={(e) => updateField("fundedDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">LTV</Label>
              <Input
                value={form.ltvPercent}
                onChange={(e) => updateField("ltvPercent", e.target.value)}
                placeholder="0.65"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">DSCR Req</Label>
              <Input
                value={form.dscrRequirement}
                onChange={(e) => updateField("dscrRequirement", e.target.value)}
                placeholder="1.25"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Origination Fee (%)</Label>
              <Input
                value={form.originationFeePercent}
                onChange={(e) => updateField("originationFeePercent", e.target.value)}
                placeholder="1.5"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Input
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                placeholder="In review / Approved"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source Upload ID</Label>
              <Input
                value={form.sourceUploadId}
                onChange={(e) => updateField("sourceUploadId", e.target.value)}
                placeholder="Upload UUID"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={2}
                placeholder="Rate terms, covenants, milestones"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-1.5" onClick={submit} disabled={saving}>
              {saving ? (
                <>Saving...</>
              ) : editingId ? (
                <>
                  <Save className="h-4 w-4" />
                  Update Financing
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Financing
                </>
              )}
            </Button>
            {editingId && (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={resetForm}
                disabled={saving}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </Card>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading financings…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No financings for this deal yet.
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((financing) => (
              <Card key={financing.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {financing.lenderName ?? "Unnamed lender"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Facility: {financing.facilityName ?? "—"} | {financing.loanType ?? "—"}
                    </p>
                    <p className="text-xs mt-2">
                      Amount: {financing.loanAmount ?? "—"} | Rate: {financing.interestRate ?? "—"}%
                    </p>
                    <p className="text-xs">
                      Loan term: {financing.loanTermMonths ?? "—"} months | Amortization: {financing.amortizationYears ?? "—"} yrs
                    </p>
                    <p className="text-xs">
                      Status: {financing.status ?? "—"} | LTV: {financing.ltvPercent ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7"
                      onClick={() => fillFromRecord(financing)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-destructive"
                      onClick={() => remove(financing.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
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

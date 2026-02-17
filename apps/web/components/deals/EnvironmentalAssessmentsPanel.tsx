"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

type EnvironmentalAssessmentItem = {
  id: string;
  orgId: string;
  dealId: string;
  reportType: string | null;
  reportDate: string | null;
  consultantName: string | null;
  reportTitle: string | null;
  recs: string[];
  deMinimisConditions: string[];
  phaseIiRecommended: boolean | null;
  phaseIiScope: string | null;
  estimatedRemediationCost: string | null;
  sourceUploadId: string | null;
  notes: string | null;
};

type EnvironmentalAssessmentResponse = {
  environmentalAssessments: EnvironmentalAssessmentItem[];
};

type EnvironmentalAssessmentPayload = {
  reportType?: string;
  reportDate?: string;
  consultantName?: string;
  reportTitle?: string;
  recs?: string[];
  deMinimisConditions?: string[];
  phaseIiRecommended?: boolean;
  phaseIiScope?: string;
  estimatedRemediationCost?: number;
  sourceUploadId?: string | null;
  notes?: string;
};

type FormState = {
  reportType: string;
  reportDate: string;
  consultantName: string;
  reportTitle: string;
  recs: string;
  deMinimisConditions: string;
  phaseIiRecommended: boolean;
  phaseIiScope: string;
  estimatedRemediationCost: string;
  sourceUploadId: string;
  notes: string;
};

const emptyForm: FormState = {
  reportType: "",
  reportDate: "",
  consultantName: "",
  reportTitle: "",
  recs: "",
  deMinimisConditions: "",
  phaseIiRecommended: false,
  phaseIiScope: "",
  estimatedRemediationCost: "",
  sourceUploadId: "",
  notes: "",
};

function splitLines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeCurrency(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function EnvironmentalAssessmentsPanel({ dealId }: { dealId: string }) {
  const [assessments, setAssessments] = useState<EnvironmentalAssessmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetchAssessments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/environmental-assessments`);
      const data = (await res.json()) as EnvironmentalAssessmentResponse;
      setAssessments(data.environmentalAssessments ?? []);
    } catch {
      toast.error("Failed to load environmental assessments");
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (!dealId) return;
    void fetchAssessments();
  }, [dealId, fetchAssessments]);

  const list = useMemo(() => assessments, [assessments]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  const fillFromRecord = useCallback((item: EnvironmentalAssessmentItem) => {
    setEditingId(item.id);
    setForm({
      reportType: item.reportType ?? "",
      reportDate: item.reportDate ? item.reportDate.slice(0, 10) : "",
      consultantName: item.consultantName ?? "",
      reportTitle: item.reportTitle ?? "",
      recs: item.recs.join("\n"),
      deMinimisConditions: item.deMinimisConditions.join("\n"),
      phaseIiRecommended: item.phaseIiRecommended ?? false,
      phaseIiScope: item.phaseIiScope ?? "",
      estimatedRemediationCost: item.estimatedRemediationCost ?? "",
      sourceUploadId: item.sourceUploadId ?? "",
      notes: item.notes ?? "",
    });
  }, []);

  const updateField = useCallback(
    (field: keyof FormState, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const buildPayload = useCallback((): EnvironmentalAssessmentPayload => {
    const payload: EnvironmentalAssessmentPayload = {};
    if (form.reportType.trim()) payload.reportType = form.reportType.trim();
    if (form.reportDate.trim()) payload.reportDate = form.reportDate.trim();
    if (form.consultantName.trim()) payload.consultantName = form.consultantName.trim();
    if (form.reportTitle.trim()) payload.reportTitle = form.reportTitle.trim();
    const recs = splitLines(form.recs);
    if (recs.length > 0) payload.recs = recs;
    const deMinimisConditions = splitLines(form.deMinimisConditions);
    if (deMinimisConditions.length > 0) payload.deMinimisConditions = deMinimisConditions;
    if (form.phaseIiRecommended) payload.phaseIiRecommended = true;
    if (form.phaseIiScope.trim()) payload.phaseIiScope = form.phaseIiScope.trim();
    const parsedCost = normalizeCurrency(form.estimatedRemediationCost);
    if (parsedCost !== undefined) payload.estimatedRemediationCost = parsedCost;
    if (form.sourceUploadId.trim()) payload.sourceUploadId = form.sourceUploadId.trim();
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
      const res = await fetch(`/api/deals/${dealId}/environmental-assessments`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = (await res.json()) as { environmentalAssessment?: EnvironmentalAssessmentItem };
      if (!res.ok || !data.environmentalAssessment) {
        throw new Error("Failed to save");
      }
      const saved = data.environmentalAssessment;
      setAssessments((prev) => {
        if (editingId) {
          return prev.map((item) => (item.id === saved.id ? saved : item));
        }
        return [saved, ...prev];
      });
      resetForm();
      toast.success(editingId ? "Assessment updated" : "Assessment created");
    } catch (error) {
      console.error("Error saving environmental assessment", error);
      toast.error("Failed to save environmental assessment");
    } finally {
      setSaving(false);
    }
  }, [buildPayload, dealId, editingId, resetForm]);

  const remove = useCallback(async (assessmentId: string) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/environmental-assessments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assessmentId }),
      });
      if (!res.ok) {
        throw new Error("Failed to delete");
      }
      setAssessments((prev) => prev.filter((item) => item.id !== assessmentId));
      if (editingId === assessmentId) {
        resetForm();
      }
      toast.success("Assessment deleted");
    } catch (error) {
      console.error("Error deleting environmental assessment", error);
      toast.error("Failed to delete environmental assessment");
    }
  }, [dealId, editingId, resetForm]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Environmental Assessments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Report Type</Label>
              <Input
                value={form.reportType}
                onChange={(e) => updateField("reportType", e.target.value)}
                placeholder="Phase I ESA"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Report Date</Label>
              <Input
                type="date"
                value={form.reportDate}
                onChange={(e) => updateField("reportDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Consultant</Label>
              <Input
                value={form.consultantName}
                onChange={(e) => updateField("consultantName", e.target.value)}
                placeholder="Consultant"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Report Title</Label>
              <Input
                value={form.reportTitle}
                onChange={(e) => updateField("reportTitle", e.target.value)}
                placeholder="Environmental Assessment"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">RECs (comma or newline separated)</Label>
              <Textarea
                value={form.recs}
                onChange={(e) => updateField("recs", e.target.value)}
                rows={3}
                placeholder="List identified RECs"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">De minimis conditions</Label>
              <Textarea
                value={form.deMinimisConditions}
                onChange={(e) => updateField("deMinimisConditions", e.target.value)}
                rows={2}
                placeholder="Minor items not requiring remediation"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phase II Recommended</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.phaseIiRecommended}
                  onChange={(e) => updateField("phaseIiRecommended", e.target.checked)}
                />
                <span>Recommend Phase II investigation</span>
              </label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phase II Scope</Label>
              <Input
                value={form.phaseIiScope}
                onChange={(e) => updateField("phaseIiScope", e.target.value)}
                placeholder="Soil borings near former use site"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estimated Remediation Cost</Label>
              <Input
                value={form.estimatedRemediationCost}
                onChange={(e) => updateField("estimatedRemediationCost", e.target.value)}
                placeholder="e.g. 125000"
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
                placeholder="Additional observations"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-1.5"
              onClick={submit}
              disabled={saving}
            >
              {saving ? (
                <>Saving...</>
              ) : editingId ? (
                <>
                  <Save className="h-4 w-4" />
                  Update Assessment
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Assessment
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
          <p className="text-xs text-muted-foreground">Loading environmental assessments…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No environmental assessments for this deal yet.
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((assessment) => (
              <Card key={assessment.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {assessment.reportType ?? "Environmental Assessment"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {assessment.reportDate ? `Report date: ${assessment.reportDate}` : "No date"}
                    </p>
                    <p className="text-xs mt-2">
                      Consultant: {assessment.consultantName ?? "—"}
                    </p>
                    <p className="text-xs">
                      Phase II recommended: {assessment.phaseIiRecommended ? "Yes" : "No"}
                      {assessment.phaseIiScope ? ` (${assessment.phaseIiScope})` : ""}
                    </p>
                    {assessment.estimatedRemediationCost ? (
                      <p className="text-xs">
                        Estimated remediation: ${assessment.estimatedRemediationCost}
                      </p>
                    ) : null}
                    {assessment.recs.length > 0 ? (
                      <p className="text-xs mt-1">
                        RECs: {assessment.recs.join(", ")}
                      </p>
                    ) : null}
                    {assessment.deMinimisConditions.length > 0 ? (
                      <p className="text-xs mt-1">
                        De-minimis: {assessment.deMinimisConditions.join(", ")}
                      </p>
                    ) : null}
                    {assessment.notes ? (
                      <p className="text-xs mt-1">{assessment.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7"
                      onClick={() => fillFromRecord(assessment)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-destructive"
                      onClick={() => remove(assessment.id)}
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

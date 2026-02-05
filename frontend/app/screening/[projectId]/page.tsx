"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RefreshCcw, Save, AlertTriangle } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

type ScreeningDetail = {
  project: {
    id: string;
    name: string;
    address?: string | null;
    status?: string | null;
  };
  latest_run?: {
    id: string;
    status?: string | null;
    needs_review?: boolean | null;
    low_confidence_keys?: string[] | null;
    created_at?: string | null;
    completed_at?: string | null;
  } | null;
  score?: {
    overall_score?: number | null;
    financial_score?: number | null;
    qualitative_score?: number | null;
    is_provisional?: boolean | null;
    hard_filter_failed?: boolean | null;
    hard_filter_reasons?: string[] | null;
    missing_keys?: string[] | null;
  } | null;
  final_scores?: {
    overall_score?: number | null;
    financial_score?: number | null;
    qualitative_score?: number | null;
  } | null;
  field_values?: Array<{
    field_key?: string | null;
    value_number?: number | null;
    value_text?: string | null;
    confidence?: number | null;
    extraction_method?: string | null;
    source_document_id?: string | null;
    citation_ids?: string[] | null;
  }>;
  overrides?: Array<{
    id?: string;
    scope?: string | null;
    field_key?: string | null;
    value_number?: number | null;
    value_text?: string | null;
    notes?: string | null;
    created_at?: string | null;
  }>;
  computation?: {
    metrics?: {
      cap_rate_used?: number | null;
      yield_on_cost?: number | null;
      cash_on_cash?: number | null;
      dscr?: number | null;
    };
    scores?: {
      overall_score?: number | null;
      financial_score?: number | null;
      qualitative_score?: number | null;
      is_provisional?: boolean | null;
    };
  } | null;
  documents?: Array<{
    id: string;
    file_name?: string | null;
    document_type?: string | null;
  }>;
  history?: Array<{
    run?: {
      id?: string;
      status?: string | null;
      created_at?: string | null;
      completed_at?: string | null;
    };
    score?: {
      overall_score?: number | null;
      financial_score?: number | null;
      qualitative_score?: number | null;
    } | null;
  }>;
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const isDefinedNumber = (value: number | null | undefined) =>
  value !== null && value !== undefined;

export default function ScreeningDetailPage() {
  const params = useParams();
  const projectId = typeof params.projectId === "string" ? params.projectId : "";
  const [detail, setDetail] = useState<ScreeningDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fieldKey, setFieldKey] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [fieldConfidence, setFieldConfidence] = useState("");
  const [overrideScope, setOverrideScope] = useState("score");
  const [overrideKey, setOverrideKey] = useState("overall_score");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const loadDetail = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/screening/deals/${projectId}`);
      if (!response.ok) {
        throw new Error("Failed to load screening detail");
      }
      const payload = (await response.json()) as ScreeningDetail;
      setDetail(payload);
    } catch (error) {
      console.error("Failed to load screening detail:", error);
      toast.error("Failed to load screening detail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [projectId]);

  const metrics = detail?.computation?.metrics || {};
  const overallScore = detail?.final_scores?.overall_score;

  const sortedFields = useMemo(() => {
    const values = detail?.field_values ?? [];
    return [...values].sort((a, b) =>
      String(a.field_key || "").localeCompare(String(b.field_key || ""))
    );
  }, [detail]);

  const handleRerun = async () => {
    if (!projectId) return;
    const response = await fetch(`${backendUrl}/screening/deals/${projectId}/rerun`, {
      method: "POST",
    });
    if (!response.ok) {
      toast.error("Failed to enqueue re-run");
      return;
    }
    toast.success("Re-screening queued");
    await loadDetail();
  };

  const handleFieldUpdate = async () => {
    if (!projectId || !fieldKey.trim() || !fieldValue.trim()) {
      toast.error("Field key and value are required");
      return;
    }
    const numericValue = Number(fieldValue);
    const isNumeric = !Number.isNaN(numericValue) && fieldValue.trim() !== "";
    const confidenceValue = fieldConfidence ? Number(fieldConfidence) : undefined;

    const response = await fetch(`${backendUrl}/screening/deals/${projectId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_key: fieldKey.trim(),
        value_number: isNumeric ? numericValue : undefined,
        value_text: isNumeric ? undefined : fieldValue.trim(),
        confidence: confidenceValue,
        source: "manual",
      }),
    });
    if (!response.ok) {
      toast.error("Failed to update field");
      return;
    }
    toast.success("Field update queued");
    setFieldKey("");
    setFieldValue("");
    setFieldConfidence("");
    await loadDetail();
  };

  const handleOverride = async () => {
    if (!projectId || !overrideKey.trim() || !overrideValue.trim()) {
      toast.error("Override key and value are required");
      return;
    }
    const numericValue = Number(overrideValue);
    const isNumeric = !Number.isNaN(numericValue) && overrideValue.trim() !== "";

    const response = await fetch(
      `${backendUrl}/screening/deals/${projectId}/overrides`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: overrideScope,
          field_key: overrideKey.trim(),
          value_number: isNumeric ? numericValue : undefined,
          value_text: isNumeric ? undefined : overrideValue.trim(),
          reason: overrideReason.trim() || undefined,
          created_by: "admin",
        }),
      }
    );
    if (!response.ok) {
      toast.error("Failed to apply override");
      return;
    }
    toast.success("Override saved");
    setOverrideValue("");
    setOverrideReason("");
    await loadDetail();
  };

  if (!projectId) {
    return (
      <DashboardShell>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Missing project ID.
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  if (loading || !detail) {
    return (
      <DashboardShell>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading screening detail...
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{detail.project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.project.address || "No address provided"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail.latest_run?.needs_review && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Needs review
              </Badge>
            )}
            <Badge variant="secondary">{detail.latest_run?.status ?? "queued"}</Badge>
            <Button variant="secondary" className="gap-2" onClick={handleRerun}>
              <RefreshCcw className="h-4 w-4" />
              Re-run
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scores & Metrics</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Overall</p>
                  <p className="text-2xl font-semibold">
                    {overallScore !== null && overallScore !== undefined
                      ? overallScore.toFixed(2)
                      : "--"}
                  </p>
                  {detail.score?.is_provisional && (
                    <Badge variant="outline">Provisional</Badge>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Financial</p>
                  <p className="text-lg font-medium">
                    {detail.final_scores?.financial_score?.toFixed(2) ?? "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Qualitative</p>
                  <p className="text-lg font-medium">
                    {detail.final_scores?.qualitative_score?.toFixed(2) ?? "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-medium">
                    {detail.latest_run?.status ?? "queued"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cap Rate</p>
                  <p className="text-sm font-medium">
                    {isDefinedNumber(metrics.cap_rate_used)
                      ? `${(metrics.cap_rate_used * 100).toFixed(2)}%`
                      : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Yield on Cost</p>
                  <p className="text-sm font-medium">
                    {isDefinedNumber(metrics.yield_on_cost)
                      ? `${(metrics.yield_on_cost * 100).toFixed(2)}%`
                      : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">DSCR</p>
                  <p className="text-sm font-medium">
                    {isDefinedNumber(metrics.dscr) ? metrics.dscr.toFixed(2) : "--"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cash-on-Cash</p>
                  <p className="text-sm font-medium">
                    {isDefinedNumber(metrics.cash_on_cash)
                      ? `${(metrics.cash_on_cash * 100).toFixed(2)}%`
                      : "--"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Field Values</CardTitle>
                <Badge variant="outline">
                  {detail.latest_run?.low_confidence_keys?.length || 0} flagged
                </Badge>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFields.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                          No extracted values yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedFields.map((field) => (
                        <TableRow key={field.field_key}>
                          <TableCell className="font-medium">{field.field_key}</TableCell>
                          <TableCell>
                            {field.value_number !== null && field.value_number !== undefined
                              ? field.value_number
                              : field.value_text || "--"}
                          </TableCell>
                          <TableCell>
                            {field.confidence !== null && field.confidence !== undefined
                              ? Number(field.confidence).toFixed(2)
                              : "--"}
                          </TableCell>
                          <TableCell>{field.extraction_method || "--"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Run History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(detail.history || []).map((entry) => (
                  <div
                    key={entry.run?.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{entry.run?.status ?? "queued"}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.run?.completed_at
                          ? formatDate(entry.run.completed_at)
                          : entry.run?.created_at
                          ? formatDate(entry.run.created_at)
                          : "--"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Overall</p>
                      <p className="font-semibold">
                        {entry.score?.overall_score?.toFixed(2) ?? "--"}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Manual Field Update</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Field Key</Label>
                  <Input
                    value={fieldKey}
                    onChange={(event) => setFieldKey(event.target.value)}
                    placeholder="noi_stabilized"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Value</Label>
                  <Input
                    value={fieldValue}
                    onChange={(event) => setFieldValue(event.target.value)}
                    placeholder="1250000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confidence (0-1)</Label>
                  <Input
                    value={fieldConfidence}
                    onChange={(event) => setFieldConfidence(event.target.value)}
                    placeholder="0.9"
                  />
                </div>
                <Button className="gap-2" onClick={handleFieldUpdate}>
                  <Save className="h-4 w-4" />
                  Queue Update
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overrides</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select value={overrideScope} onValueChange={setOverrideScope}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score">Score override</SelectItem>
                      <SelectItem value="field">Field override</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Key</Label>
                  {overrideScope === "score" ? (
                    <Select value={overrideKey} onValueChange={setOverrideKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select score" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="overall_score">Overall</SelectItem>
                        <SelectItem value="financial_score">Financial</SelectItem>
                        <SelectItem value="qualitative_score">Qualitative</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={overrideKey}
                      onChange={(event) => setOverrideKey(event.target.value)}
                      placeholder="noi_in_place"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Value</Label>
                  <Input
                    value={overrideValue}
                    onChange={(event) => setOverrideValue(event.target.value)}
                    placeholder="3.75"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    placeholder="Manual adjustment after broker call"
                  />
                </div>
                <Button className="gap-2" onClick={handleOverride}>
                  <Save className="h-4 w-4" />
                  Save Override
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(detail.documents || []).length === 0 ? (
                  <p className="text-muted-foreground">No documents uploaded.</p>
                ) : (
                  detail.documents?.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">{doc.file_name || "Document"}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.document_type || "unknown"}
                        </p>
                      </div>
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/deal-room/${detail.project.id}`}>
                          View
                        </Link>
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

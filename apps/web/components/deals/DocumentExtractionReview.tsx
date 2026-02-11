"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Check,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FIELD_LABELS,
  DOC_TYPE_LABELS,
} from "@/lib/schemas/extractionSchemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractionUpload {
  id: string;
  filename: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

interface Extraction {
  id: string;
  uploadId: string;
  dealId: string;
  docType: string;
  extractedData: Record<string, unknown>;
  confidence: number;
  extractedAt: string;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  upload: ExtractionUpload;
}

interface Props {
  dealId: string;
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(Number(confidence) * 100);
  const variant = pct >= 85 ? "default" : pct >= 50 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="text-xs font-mono">
      {pct}%
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Field value renderer
// ---------------------------------------------------------------------------

function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    // Format as currency if large
    if (value >= 1000) return "$" + value.toLocaleString();
    return String(value);
  }
  if (typeof value === "string") return value || "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value
      .map((v) => {
        if (typeof v === "object" && v !== null && "label" in v && "value" in v) {
          return `${v.label}: ${v.value}`;
        }
        return String(v);
      })
      .join("; ");
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${v ?? "—"}`)
      .join(", ");
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Inline field editor
// ---------------------------------------------------------------------------

function FieldEditor({
  fieldKey,
  value,
  onSave,
}: {
  fieldKey: string;
  value: unknown;
  onSave: (key: string, newValue: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEditing = () => {
    if (Array.isArray(value)) {
      setDraft(value.join("\n"));
    } else if (typeof value === "object" && value !== null) {
      setDraft(JSON.stringify(value, null, 2));
    } else {
      setDraft(value === null || value === undefined ? "" : String(value));
    }
    setEditing(true);
  };

  const save = () => {
    let parsed: unknown = draft;

    // Try to parse back to the original type
    if (typeof value === "number" || (value === null && /^\d/.test(draft))) {
      const n = Number(draft);
      if (!isNaN(n)) parsed = n;
    } else if (typeof value === "boolean") {
      parsed = draft.toLowerCase() === "true" || draft === "1" || draft.toLowerCase() === "yes";
    } else if (Array.isArray(value)) {
      parsed = draft.split("\n").map((s) => s.trim()).filter(Boolean);
    } else if (typeof value === "object" && value !== null) {
      try {
        parsed = JSON.parse(draft);
      } catch {
        // Keep as string if JSON parse fails
      }
    } else if (draft === "") {
      parsed = null;
    }

    onSave(fieldKey, parsed);
    setEditing(false);
  };

  if (editing) {
    const isMultiline = Array.isArray(value) || (typeof value === "object" && value !== null);
    return (
      <div className="flex items-start gap-1">
        {isMultiline ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm min-h-[60px]"
            rows={3}
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm h-7"
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={save}>
          <Check className="h-3.5 w-3.5 text-green-600" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditing(false)}>
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1 group">
      <span className="text-sm flex-1 min-w-0 break-words">{renderFieldValue(value)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={startEditing}
      >
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single extraction card
// ---------------------------------------------------------------------------

function ExtractionCard({
  extraction,
  dealId,
  onReviewed,
}: {
  extraction: Extraction;
  dealId: string;
  onReviewed: () => void;
}) {
  const [expanded, setExpanded] = useState(!extraction.reviewed);
  const [editedData, setEditedData] = useState<Record<string, unknown>>(
    extraction.extractedData as Record<string, unknown>
  );
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const docLabel = DOC_TYPE_LABELS[extraction.docType] || extraction.docType;
  const fields = FIELD_LABELS[extraction.docType] || {};

  const handleFieldChange = (key: string, newValue: unknown) => {
    setEditedData((prev) => ({ ...prev, [key]: newValue }));
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/uploads/${extraction.uploadId}`);
      if (!res.ok) throw new Error("Failed to get download URL");
      const data = await res.json();
      window.open(data.url, "_blank");
    } catch {
      toast.error("Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(
        `/api/deals/${dealId}/extractions/${extraction.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewed: true,
            extractedData: editedData,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to confirm extraction");
      toast.success(`Extraction for "${extraction.upload.filename}" confirmed`);
      onReviewed();
    } catch {
      toast.error("Failed to confirm extraction");
    } finally {
      setConfirming(false);
    }
  };

  // Determine which fields to show — use the schema field list, falling back to all keys
  const fieldKeys = Object.keys(fields).length > 0
    ? Object.keys(fields)
    : Object.keys(editedData);

  return (
    <div className="border rounded-lg">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0">
          {extraction.reviewed ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {extraction.upload.filename}
            </span>
            <Badge variant="outline" className="text-xs shrink-0">
              {docLabel}
            </Badge>
            <ConfidenceBadge confidence={extraction.confidence} />
            {extraction.reviewed && (
              <Badge variant="secondary" className="text-xs shrink-0">
                Reviewed
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Extracted {new Date(extraction.extractedAt).toLocaleDateString()}
            {extraction.reviewed && extraction.reviewedAt && (
              <> · Reviewed {new Date(extraction.reviewedAt).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <div className="shrink-0">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t p-3 space-y-3">
          {/* Actions bar */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              View Original
            </Button>
            {!extraction.reviewed && (
              <Button
                size="sm"
                className="gap-1.5 ml-auto"
                onClick={handleConfirm}
                disabled={confirming}
              >
                {confirming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Confirm & Apply
              </Button>
            )}
          </div>

          {/* Field table */}
          <div className="rounded border divide-y">
            {fieldKeys.map((key) => {
              const label = fields[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
              const value = editedData[key];
              return (
                <div key={key} className="flex gap-3 px-3 py-2">
                  <div className="w-40 shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {label}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {extraction.reviewed ? (
                      <span className="text-sm">{renderFieldValue(value)}</span>
                    ) : (
                      <FieldEditor
                        fieldKey={key}
                        value={value}
                        onSave={handleFieldChange}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show extra keys from LLM not in schema */}
          {Object.keys(editedData).filter((k) => !fieldKeys.includes(k)).length > 0 && (
            <div className="rounded border divide-y">
              <div className="px-3 py-1.5 bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground">Additional Fields</span>
              </div>
              {Object.keys(editedData)
                .filter((k) => !fieldKeys.includes(k))
                .map((key) => (
                  <div key={key} className="flex gap-3 px-3 py-2">
                    <div className="w-40 shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">
                        {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{renderFieldValue(editedData[key])}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DocumentExtractionReview({ dealId }: Props) {
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [unreviewedCount, setUnreviewedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadExtractions = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${dealId}/extractions`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setExtractions(data.extractions ?? []);
      setUnreviewedCount(data.unreviewedCount ?? 0);
    } catch {
      console.error("Failed to load extractions");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    loadExtractions();
  }, [loadExtractions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (extractions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileSearch className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No document extractions yet. Upload PDF documents above to automatically extract structured data.
        </p>
      </div>
    );
  }

  const pending = extractions.filter((e) => !e.reviewed);
  const reviewed = extractions.filter((e) => e.reviewed);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">{extractions.length} extraction{extractions.length !== 1 ? "s" : ""}</span>
        {unreviewedCount > 0 && (
          <Badge variant="secondary" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {unreviewedCount} pending review
          </Badge>
        )}
      </div>

      {/* Pending review */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pending Review
          </h3>
          {pending.map((extraction) => (
            <ExtractionCard
              key={extraction.id}
              extraction={extraction}
              dealId={dealId}
              onReviewed={loadExtractions}
            />
          ))}
        </div>
      )}

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Reviewed
          </h3>
          {reviewed.map((extraction) => (
            <ExtractionCard
              key={extraction.id}
              extraction={extraction}
              dealId={dealId}
              onReviewed={loadExtractions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Badge component for the deal page Documents tab trigger.
 * Shows count of unreviewed extractions.
 */
export function ExtractionPendingBadge({ dealId }: { dealId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch(`/api/deals/${dealId}/extractions`)
      .then((res) => res.json())
      .then((data) => setCount(data.unreviewedCount ?? 0))
      .catch(() => {});
  }, [dealId]);

  if (count === 0) return null;

  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold h-4 min-w-[16px] px-1">
      {count}
    </span>
  );
}

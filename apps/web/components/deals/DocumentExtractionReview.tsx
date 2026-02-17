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
  rawText: string | null;
  confidence: number;
  sourceProvenance?: Record<string, unknown> | null;
  fieldProvenance?: Record<string, unknown> | null;
  flags?: string[] | null;
  reviewFlags?: string[] | null;
  extractedAt: string;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  upload: ExtractionUpload;
}

interface Props {
  dealId: string;
}

type ExtractionStatus = "none" | "pending_review" | "review_complete";

type ExtractionSummary = {
  totalCount: number;
  pendingCount: number;
  reviewedCount: number;
  status: ExtractionStatus;
};

type ExtractionCountUpdatedDetail = {
  dealId: string;
  totalCount: number;
  unreviewedCount: number;
  pendingCount: number;
  reviewedCount: number;
  status: ExtractionStatus;
};

export const EXTRACTION_REVIEW_COUNT_EVENT =
  "document-extraction-review-count-updated";

const EMPTY_EXTRACTION_SUMMARY: ExtractionSummary = {
  totalCount: 0,
  pendingCount: 0,
  reviewedCount: 0,
  status: "none",
};

function asCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  return Math.floor(value);
}

function deriveExtractionStatus(
  totalCount: number,
  pendingCount: number
): ExtractionStatus {
  if (totalCount === 0) return "none";
  if (pendingCount > 0) return "pending_review";
  return "review_complete";
}

function resolveExtractionSummary(
  payload: unknown,
  extractions: Extraction[]
): ExtractionSummary {
  const data = asRecord(payload);
  const totalFromPayload = asCount(data.totalCount);
  const pendingFromPayload =
    asCount(data.pendingCount) ?? asCount(data.unreviewedCount);
  const reviewedFromPayload = asCount(data.reviewedCount);

  const fallbackTotal = extractions.length;
  const fallbackPending = extractions.filter((extraction) => !extraction.reviewed).length;
  const totalCount = totalFromPayload ?? fallbackTotal;
  const pendingCount = Math.max(
    0,
    Math.min(pendingFromPayload ?? fallbackPending, totalCount)
  );
  const reviewedCount = Math.max(
    0,
    Math.min(
      reviewedFromPayload ?? Math.max(0, totalCount - pendingCount),
      totalCount
    )
  );

  const statusFromPayload = asString(data.extractionStatus);
  const status =
    statusFromPayload === "none" ||
    statusFromPayload === "pending_review" ||
    statusFromPayload === "review_complete"
      ? statusFromPayload
      : deriveExtractionStatus(totalCount, pendingCount);

  return { totalCount, pendingCount, reviewedCount, status };
}

function formatExtractionStatus(status: ExtractionStatus): string {
  if (status === "pending_review") return "Pending Review";
  if (status === "review_complete") return "Review Complete";
  return "No Extractions";
}

function statusBadgeVariant(
  status: ExtractionStatus
): "secondary" | "default" | "outline" {
  if (status === "pending_review") return "secondary";
  if (status === "review_complete") return "default";
  return "outline";
}

function emitExtractionCountUpdated(
  dealId: string,
  summary: ExtractionSummary
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ExtractionCountUpdatedDetail>(
      EXTRACTION_REVIEW_COUNT_EVENT,
      {
        detail: {
          dealId,
          totalCount: summary.totalCount,
          unreviewedCount: summary.pendingCount,
          pendingCount: summary.pendingCount,
          reviewedCount: summary.reviewedCount,
          status: summary.status,
        },
      }
    )
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toSearchTerms(value: unknown, terms: string[] = []): string[] {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    if (normalized.length >= 3) {
      terms.push(normalized);
    }
    return terms;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    terms.push(String(value));
    return terms;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      toSearchTerms(item, terms);
    });
    return terms;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((nestedValue) => {
      toSearchTerms(nestedValue, terms);
    });
  }

  return terms;
}

function extractSnippet(rawText: string, index: number, matchedLength: number): string {
  const radius = 90;
  const start = Math.max(0, index - radius);
  const end = Math.min(rawText.length, index + matchedLength + radius);
  const snippet = normalizeWhitespace(rawText.slice(start, end));
  const prefix = start > 0 ? "…" : "";
  const suffix = end < rawText.length ? "…" : "";
  return `${prefix}${snippet}${suffix}`;
}

function findSourceContext(
  rawText: string | null,
  fieldKey: string,
  fieldLabel: string,
  fieldValue: unknown
): string | null {
  if (!rawText) return null;

  const labelTerms = [fieldLabel, fieldKey.replace(/_/g, " ")];
  const terms = Array.from(
    new Set([
      ...toSearchTerms(fieldValue),
      ...labelTerms,
    ])
  )
    .map((term) => normalizeWhitespace(term))
    .filter((term) => term.length >= 3)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) return null;

  const normalizedRawText = rawText.toLowerCase();
  for (const term of terms) {
    const index = normalizedRawText.indexOf(term.toLowerCase());
    if (index !== -1) {
      return extractSnippet(rawText, index, term.length);
    }
  }

  return null;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeys(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of entries) {
      result[key] = sortObjectKeys(nestedValue);
    }
    return result;
  }

  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function toConfidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}

function getConfidenceLevel(pct: number): "high" | "medium" | "low" {
  if (pct >= 85) return "high";
  if (pct >= 50) return "medium";
  return "low";
}

type FieldProvenance = {
  snippet: string | null;
  status: "matched" | "provided" | "missing";
  sourceLabel: string | null;
  pageLabel: string | null;
  flags: string[];
};

function getProvenanceMap(extraction: Extraction): Record<string, unknown> {
  return {
    ...asRecord(extraction.sourceProvenance),
    ...asRecord(extraction.fieldProvenance),
  };
}

function normalizePageLabel(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `Page ${value}`;
  }
  const text = asString(value);
  if (!text) return null;
  return /^page\s+/i.test(text) ? text : `Page ${text}`;
}

function parseProvidedProvenance(value: unknown): Omit<FieldProvenance, "status"> {
  if (typeof value === "string") {
    return {
      snippet: asString(value),
      sourceLabel: null,
      pageLabel: null,
      flags: [],
    };
  }

  const record = asRecord(value);
  const snippet =
    asString(record.snippet) ??
    asString(record.context) ??
    asString(record.quote) ??
    asString(record.text);
  const sourceLabel =
    asString(record.source) ??
    asString(record.filename) ??
    asString(record.document);
  const pageLabel =
    normalizePageLabel(record.page) ??
    normalizePageLabel(record.pageNumber) ??
    normalizePageLabel(record.page_label);
  const flags =
    asStringArray(record.flags).length > 0
      ? asStringArray(record.flags)
      : asStringArray(record.alerts);

  return { snippet, sourceLabel, pageLabel, flags };
}

function getFieldProvenance(
  extraction: Extraction,
  fieldKey: string,
  fieldLabel: string,
  fieldValue: unknown
): FieldProvenance {
  const map = getProvenanceMap(extraction);
  const provided = parseProvidedProvenance(map[fieldKey]);
  if (provided.snippet) {
    return {
      ...provided,
      status: "provided",
    };
  }

  const matchedSnippet = findSourceContext(
    extraction.rawText,
    fieldKey,
    fieldLabel,
    fieldValue
  );
  if (matchedSnippet) {
    return {
      ...provided,
      snippet: matchedSnippet,
      status: "matched",
    };
  }

  return {
    ...provided,
    snippet: null,
    status: "missing",
  };
}

function getExtractionFlags(
  extraction: Extraction,
  confidenceLevel: "high" | "medium" | "low",
  missingProvenanceCount: number
): string[] {
  const baseFlags = [
    ...asStringArray(extraction.flags),
    ...asStringArray(extraction.reviewFlags),
  ];
  if (confidenceLevel === "low") {
    baseFlags.unshift("Low confidence extraction");
  } else if (confidenceLevel === "medium") {
    baseFlags.unshift("Medium confidence extraction");
  }
  if (missingProvenanceCount > 0) {
    baseFlags.push(
      `${missingProvenanceCount} field${missingProvenanceCount === 1 ? "" : "s"} missing source provenance`
    );
  }
  return Array.from(new Set(baseFlags));
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = toConfidencePercent(confidence);
  const level = getConfidenceLevel(pct);
  const variant =
    level === "high" ? "default" : level === "medium" ? "secondary" : "destructive";
  const label = level === "high" ? "High" : level === "medium" ? "Medium" : "Low";
  return (
    <Badge variant={variant} className="text-xs font-mono">
      {label} {pct}%
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
          <span className="sr-only">{`Save field ${fieldKey}`}</span>
          <Check className="h-3.5 w-3.5 text-green-600" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditing(false)}>
          <span className="sr-only">{`Cancel editing field ${fieldKey}`}</span>
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
        aria-label={`Edit ${fieldKey}`}
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
    asRecord(extraction.extractedData)
  );
  const [persistedData, setPersistedData] = useState<Record<string, unknown>>(
    asRecord(extraction.extractedData)
  );
  const [confirming, setConfirming] = useState(false);
  const [savingCorrections, setSavingCorrections] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const docLabel = DOC_TYPE_LABELS[extraction.docType] || extraction.docType;
  const fields = FIELD_LABELS[extraction.docType] || {};
  const hasUnsavedChanges =
    stableSerialize(editedData) !== stableSerialize(persistedData);

  useEffect(() => {
    const nextData = asRecord(extraction.extractedData);
    setEditedData(nextData);
    setPersistedData(nextData);
  }, [extraction.extractedData, extraction.id]);

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
      const data = await res.json();
      const nextData = asRecord(
        (data as { extraction?: { extractedData?: unknown } }).extraction
          ?.extractedData
      );
      if (Object.keys(nextData).length > 0) {
        setEditedData(nextData);
        setPersistedData(nextData);
      }
      toast.success(`Extraction for "${extraction.upload.filename}" confirmed`);
      onReviewed();
    } catch {
      toast.error("Failed to confirm extraction");
    } finally {
      setConfirming(false);
    }
  };

  const handleSaveCorrections = async () => {
    setSavingCorrections(true);
    try {
      const res = await fetch(
        `/api/deals/${dealId}/extractions/${extraction.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extractedData: editedData,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to save corrections");

      const data = await res.json();
      const nextData = asRecord(
        (data as { extraction?: { extractedData?: unknown } }).extraction
          ?.extractedData
      );
      if (Object.keys(nextData).length > 0) {
        setEditedData(nextData);
        setPersistedData(nextData);
      } else {
        setPersistedData(editedData);
      }
      toast.success("Corrections saved");
      onReviewed();
    } catch {
      toast.error("Failed to save corrections");
    } finally {
      setSavingCorrections(false);
    }
  };

  // Determine which fields to show — use the schema field list, falling back to all keys
  const fieldKeys = Object.keys(fields).length > 0
    ? Object.keys(fields)
    : Object.keys(editedData);
  const confidenceLevel = getConfidenceLevel(
    toConfidencePercent(extraction.confidence)
  );

  const getFieldLabel = (key: string): string =>
    fields[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const fieldProvenance = fieldKeys.reduce<Record<string, FieldProvenance>>(
    (acc, key) => {
      acc[key] = getFieldProvenance(
        extraction,
        key,
        getFieldLabel(key),
        editedData[key]
      );
      return acc;
    },
    {}
  );
  const missingProvenanceCount = Object.values(fieldProvenance).filter(
    (provenance) => provenance.status === "missing"
  ).length;
  const extractionFlags = getExtractionFlags(
    extraction,
    confidenceLevel,
    missingProvenanceCount
  );

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
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleSaveCorrections}
                disabled={!hasUnsavedChanges || confirming || savingCorrections}
              >
                {savingCorrections ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
                Save Corrections
              </Button>
            )}
            {!extraction.reviewed && (
              <Button
                size="sm"
                className="gap-1.5 ml-auto"
                onClick={handleConfirm}
                disabled={confirming || savingCorrections}
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
          {extractionFlags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {extractionFlags.map((flag) => (
                <Badge
                  key={`${extraction.id}-${flag}`}
                  variant={
                    /low confidence|missing source provenance/i.test(flag)
                      ? "destructive"
                      : "outline"
                  }
                  className="text-[10px]"
                >
                  {flag}
                </Badge>
              ))}
            </div>
          )}

          {/* Field table */}
          <div className="rounded border divide-y">
            {fieldKeys.map((key) => {
              const label = getFieldLabel(key);
              const value = editedData[key];
              const provenance = fieldProvenance[key];
              const provenanceBadgeVariant =
                provenance.status === "missing" ? "destructive" : "secondary";
              const provenanceLabel =
                provenance.status === "provided"
                  ? "Provided"
                  : provenance.status === "matched"
                    ? "Matched"
                    : "Missing";
              return (
                <div
                  key={key}
                  className="grid gap-3 px-3 py-2 md:grid-cols-[10rem_minmax(0,1fr)]"
                >
                  <div className="w-40 shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {label}
                    </span>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
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
                    <div className="rounded border bg-muted/30 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Source Provenance
                        </p>
                        <Badge
                          variant={provenanceBadgeVariant}
                          className="h-4 text-[10px] px-1.5"
                        >
                          {provenanceLabel}
                        </Badge>
                      </div>
                      {(provenance.sourceLabel || provenance.pageLabel) && (
                        <p className="text-[11px] text-muted-foreground">
                          {[provenance.sourceLabel, provenance.pageLabel]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {provenance.snippet ??
                          "No direct source match found in extracted text."}
                      </p>
                      {provenance.flags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {provenance.flags.map((flag) => (
                            <Badge
                              key={`${key}-${flag}`}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
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
  const [summary, setSummary] = useState<ExtractionSummary>(
    EMPTY_EXTRACTION_SUMMARY
  );
  const [loading, setLoading] = useState(true);

  const loadExtractions = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${dealId}/extractions`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const nextExtractions = (data.extractions ?? []) as Extraction[];
      const nextSummary = resolveExtractionSummary(data, nextExtractions);
      setExtractions(nextExtractions);
      setSummary(nextSummary);
      emitExtractionCountUpdated(dealId, nextSummary);
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {summary.totalCount} extraction
          {summary.totalCount !== 1 ? "s" : ""}
        </span>
        <Badge variant={statusBadgeVariant(summary.status)} className="text-xs">
          {formatExtractionStatus(summary.status)}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {summary.reviewedCount} reviewed
        </Badge>
        <Badge
          variant={summary.pendingCount > 0 ? "secondary" : "outline"}
          className="text-xs gap-1"
        >
          {summary.pendingCount > 0 && <AlertTriangle className="h-3 w-3" />}
          {summary.pendingCount} pending
        </Badge>
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
 * Compact status summary for use across multiple deal page surfaces.
 */
export function ExtractionStatusSummary({
  dealId,
  compact = false,
}: {
  dealId: string;
  compact?: boolean;
}) {
  const [summary, setSummary] = useState<ExtractionSummary>(
    EMPTY_EXTRACTION_SUMMARY
  );
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${dealId}/extractions`);
      if (!res.ok) return;
      const data = await res.json();
      const nextSummary = resolveExtractionSummary(
        data,
        ((data as { extractions?: Extraction[] }).extractions ?? []) as Extraction[]
      );
      setSummary(nextSummary);
    } catch {
      // Best-effort status surface.
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void loadSummary();

    const handleUpdatedCount = (event: Event) => {
      const detail = (event as CustomEvent<ExtractionCountUpdatedDetail>).detail;
      if (!detail || detail.dealId !== dealId) return;

      setSummary((previous) => {
        const pendingInput =
          asCount(detail.pendingCount) ??
          asCount(detail.unreviewedCount) ??
          previous.pendingCount;
        const totalCount =
          asCount(detail.totalCount) ?? Math.max(previous.totalCount, pendingInput);
        const pendingCount = Math.max(0, Math.min(pendingInput, totalCount));
        const reviewedInput = asCount(detail.reviewedCount);
        const reviewedCount = Math.max(
          0,
          Math.min(reviewedInput ?? totalCount - pendingCount, totalCount)
        );
        const status =
          detail.status === "none" ||
          detail.status === "pending_review" ||
          detail.status === "review_complete"
            ? detail.status
            : deriveExtractionStatus(totalCount, pendingCount);

        return {
          totalCount,
          pendingCount,
          reviewedCount,
          status,
        };
      });
    };

    window.addEventListener(EXTRACTION_REVIEW_COUNT_EVENT, handleUpdatedCount);
    window.addEventListener("focus", loadSummary);

    return () => {
      window.removeEventListener(EXTRACTION_REVIEW_COUNT_EVENT, handleUpdatedCount);
      window.removeEventListener("focus", loadSummary);
    };
  }, [dealId, loadSummary]);

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-1.5 text-xs"
          : "flex flex-wrap items-center gap-2 text-xs"
      }
      aria-label={`Extraction status ${loading ? "loading" : "loaded"}`}
    >
      <Badge variant={statusBadgeVariant(summary.status)} className="text-[11px]">
        {formatExtractionStatus(summary.status)}
      </Badge>
      <Badge variant="outline" className="text-[11px]">
        {summary.reviewedCount} reviewed
      </Badge>
      <Badge
        variant={summary.pendingCount > 0 ? "secondary" : "outline"}
        className="text-[11px]"
      >
        {summary.pendingCount} pending
      </Badge>
    </div>
  );
}

/**
 * Badge component for the deal page Documents tab trigger.
 * Shows count of unreviewed extractions.
 */
export function ExtractionPendingBadge({ dealId }: { dealId: string }) {
  const [count, setCount] = useState(0);

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${dealId}/extractions`);
      if (!res.ok) return;
      const data = await res.json();
      const summary = resolveExtractionSummary(
        data,
        ((data as { extractions?: Extraction[] }).extractions ?? []) as Extraction[]
      );
      setCount(summary.pendingCount);
    } catch {
      // Best-effort badge update only.
    }
  }, [dealId]);

  useEffect(() => {
    void loadCount();

    const handleUpdatedCount = (event: Event) => {
      const detail = (event as CustomEvent<ExtractionCountUpdatedDetail>).detail;
      if (!detail || detail.dealId !== dealId) return;
      const nextCount = asCount(detail.pendingCount) ?? asCount(detail.unreviewedCount) ?? 0;
      setCount(nextCount);
    };

    window.addEventListener(EXTRACTION_REVIEW_COUNT_EVENT, handleUpdatedCount);
    window.addEventListener("focus", loadCount);

    return () => {
      window.removeEventListener(EXTRACTION_REVIEW_COUNT_EVENT, handleUpdatedCount);
      window.removeEventListener("focus", loadCount);
    };
  }, [dealId, loadCount]);

  if (count === 0) return null;

  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold h-4 min-w-[16px] px-1">
      {count}
    </span>
  );
}

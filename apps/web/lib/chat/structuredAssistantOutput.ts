import type { AgentReport } from "@entitlement-os/shared";

type JsonRecord = Record<string, unknown>;

export type StructuredAssistantReport = AgentReport | JsonRecord;

export type ParsedAssistantOutput = {
  payload: StructuredAssistantReport;
  raw: string;
};

const STRUCTURED_KEYS = new Set([
  "schema_version",
  "task_understanding",
  "execution_plan",
  "agent_outputs",
  "synthesis",
  "next_steps",
  "uncertainty_map",
  "key_assumptions",
  "sources",
]);

const KNOWN_METRIC_KEYS = [
  /noi/i,
  /dscr/i,
  /irr/i,
  /cap/i,
  /rate/i,
  /return/i,
  /equity/i,
  /loan/i,
  /value/i,
  /price/i,
  /purchase/i,
  /debt/i,
  /yield/i,
  /expense/i,
  /revenue/i,
  /cash/i,
  /multiple/i,
  /cost/i,
  /noi/i,
];

export type FinancialKpi = {
  label: string;
  value: number;
  source: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePercentValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (percentMatch?.[1]) {
    return Number(percentMatch[1]);
  }

  const currencyLike = trimmed.replace(/[$,_\s]/g, "").replace(/,/g, "");
  const numericOnly = Number(currencyLike);
  return Number.isFinite(numericOnly) ? numericOnly : null;
}

function extractJsonContent(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\n([\s\S]*?)\n```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function parseScalarAsNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = parsePercentValue(value);
  if (parsed === null) return null;

  if (parsed > 100 || parsed < -100) return parsed;
  return parsed;
}

function looksLikeStructured(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return true;
  }
  return /"schema_version"\s*:/i.test(trimmed);
}

function isStructuredFieldCandidate(value: JsonRecord): boolean {
  for (const key of Object.keys(value)) {
    if (STRUCTURED_KEYS.has(key)) {
      return true;
    }
  }

  return false;
}

function looksLikeLikelyTextReport(value: JsonRecord): boolean {
  if (typeof value.content === "string" && value.content.length > 0) {
    return true;
  }
  if (typeof value.message === "string" && value.message.length > 0) {
    return true;
  }
  return false;
}

function parseCandidatePayload(
  content: string,
): StructuredAssistantReport | null {
  if (!looksLikeStructured(content)) return null;

  const candidate = extractJsonContent(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (!isStructuredFieldCandidate(parsed) && !looksLikeLikelyTextReport(parsed)) return null;

  return parsed;
}

function hasFinancialKey(key: string): boolean {
  return KNOWN_METRIC_KEYS.some((pattern) => pattern.test(key));
}

function safeLabelFromPath(path: string): string {
  return path
    .split(".")
    .slice(-1)[0]
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatMetricLabel(path: string): string {
  const pretty = path.replace(/_/g, " ").trim();
  return pretty
    .split(/\s+/)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

function collectMetricsFromRecord(
  value: JsonRecord,
  path: string,
  out: FinancialKpi[],
  depth: number,
) {
  if (depth > 3 || out.length > 24) return;

  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isRecord(child)) {
      collectMetricsFromRecord(child, nextPath, out, depth + 1);
      continue;
    }

    if (Array.isArray(child)) {
      if (path.length < 1) {
        continue;
      }
      child.forEach((entry, index) => {
        const nextArrayPath = `${nextPath}[${index}]`;
        if (isRecord(entry)) {
          collectMetricsFromRecord(entry, nextArrayPath, out, depth + 1);
        }
      });
      continue;
    }

    if (!hasFinancialKey(key)) continue;

    const parsedValue = parseScalarAsNumber(child);
    if (parsedValue === null) continue;

    out.push({
      label: formatMetricLabel(nextPath),
      value: parsedValue,
      source: safeLabelFromPath(path),
    });
  }
}

export function parseStructuredAssistantPayload(
  content: string,
): ParsedAssistantOutput | null {
  const payload = parseCandidatePayload(content);
  if (!payload) return null;
  return { payload, raw: content };
}

export function extractFinancialKpis(report: unknown, maxCount = 8): FinancialKpi[] {
  if (!isRecord(report)) return [];
  const candidates: FinancialKpi[] = [];
  const candidateMap = new Set<string>();
  const metricsSource = report.metrics;
  if (isRecord(metricsSource)) {
    collectMetricsFromRecord(metricsSource, "metrics", candidates, 0);
  }

  collectMetricsFromRecord(report, "", candidates, 0);

  const filtered = candidates.filter((kpi) => Number.isFinite(kpi.value));
  const unique = filtered.filter((kpi) => {
    const key = `${kpi.label.toLowerCase()}|${kpi.source}`;
    if (candidateMap.has(key)) return false;
    candidateMap.add(key);
    return true;
  });

  return unique.slice(0, maxCount);
}

export function sortExecutionPlanSteps(steps: unknown[]): unknown[] {
  return [...steps].filter((step) => isRecord(step));
}

export function renderableObjectArray(value: unknown): JsonRecord[] | null {
  if (!Array.isArray(value)) return null;

  if (!value.every(isRecord)) {
    return null;
  }

  if (value.length === 0) return null;
  return value;
}

export function formatTableHeaders(row: JsonRecord): string[] {
  return Object.keys(row);
}

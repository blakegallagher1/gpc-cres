import type { TracingExporter } from "@openai/agents";

type TraceMetricSnapshot = {
  bucket: string;
  count: number;
  errors: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

type MetricAccumulator = {
  count: number;
  errors: number;
  durationsMs: number[];
};

const traceMetrics = new Map<string, MetricAccumulator>();

function toDateValue(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationMs(startedAt: unknown, endedAt: unknown): number | null {
  const start = toDateValue(startedAt);
  const end = toDateValue(endedAt);
  if (start === null || end === null || end < start) return null;
  return end - start;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function metricBucketFromSpanData(spanData: Record<string, unknown>): string {
  const spanType =
    typeof spanData.type === "string" && spanData.type.length > 0
      ? spanData.type
      : "unknown";
  const name =
    typeof spanData.name === "string" && spanData.name.length > 0
      ? spanData.name
      : typeof spanData.model === "string" && spanData.model.length > 0
        ? spanData.model
        : "unnamed";
  return `${spanType}:${name}`;
}

function upsertMetric(bucket: string, duration: number | null, errored: boolean): void {
  const current = traceMetrics.get(bucket) ?? {
    count: 0,
    errors: 0,
    durationsMs: [],
  };

  current.count += 1;
  if (errored) current.errors += 1;
  if (typeof duration === "number" && Number.isFinite(duration)) {
    current.durationsMs.push(duration);
  }

  traceMetrics.set(bucket, current);
}

function safeToJson(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (value && typeof (value as { toJSON?: () => unknown }).toJSON === "function") {
    const serialized = (value as { toJSON: () => unknown }).toJSON();
    return isRecord(serialized) ? serialized : null;
  }
  return null;
}

function emitStructuredTraceLog(level: "info" | "warn", payload: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...payload,
  });
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export function resetAgentTraceMetrics(): void {
  traceMetrics.clear();
}

export function getAgentTraceMetrics(): TraceMetricSnapshot[] {
  return [...traceMetrics.entries()]
    .map(([bucket, stats]) => ({
      bucket,
      count: stats.count,
      errors: stats.errors,
      p50Ms: percentile(stats.durationsMs, 0.5),
      p95Ms: percentile(stats.durationsMs, 0.95),
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export class StructuredTraceExporter implements TracingExporter {
  async export(items: unknown[]): Promise<void> {
    for (const item of items) {
      const serialized = safeToJson(item);
      if (!serialized) continue;

      if (serialized.type === "trace.span") {
        const spanData = isRecord(serialized.spanData) ? serialized.spanData : {};
        const bucket = metricBucketFromSpanData(spanData);
        const spanDurationMs = durationMs(serialized.startedAt, serialized.endedAt);
        const error = isRecord(serialized.error) ? serialized.error : null;
        upsertMetric(bucket, spanDurationMs, Boolean(error));

        emitStructuredTraceLog(error ? "warn" : "info", {
          event: "agent_trace_span",
          traceId: serialized.traceId ?? null,
          spanId: serialized.spanId ?? null,
          parentId: serialized.parentId ?? null,
          spanType: spanData.type ?? null,
          spanName:
            (typeof spanData.name === "string" ? spanData.name : null) ??
            (typeof spanData.model === "string" ? spanData.model : null),
          durationMs: spanDurationMs,
          usage:
            isRecord(spanData.usage) || Array.isArray(spanData.usage)
              ? spanData.usage
              : null,
          error: error?.message ?? null,
        });
        continue;
      }

      if (serialized.type === "trace") {
        emitStructuredTraceLog("info", {
          event: "agent_trace",
          traceId: serialized.traceId ?? null,
          name: serialized.name ?? null,
          groupId: serialized.groupId ?? null,
        });
      }
    }
  }
}

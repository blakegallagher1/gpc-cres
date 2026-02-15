/**
 * OpenTelemetry bootstrap for tracing and optional Tempo/Loki observability.
 * This implementation is defensive: it enables instrumentation when dependencies are
 * available and silently degrades to no-op tracing when not present.
 */

import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);

type MaybeNodeSDK = {
  start: () => Promise<void> | void;
  shutdown: () => Promise<void> | void;
};

type Span = {
  setAttributes: (attrs: Record<string, unknown>) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  end: () => void;
};

type Tracer = {
  startActiveSpan: (
    name: string,
    fn: (span: Span) => Promise<unknown> | unknown,
  ) => Promise<unknown>;
};

let tracer: Tracer | null = null;
let sdk: MaybeNodeSDK | null = null;
const fallbackSpanStatus = {
  OK: 1,
  ERROR: 2,
};

/**
 * Starts OpenTelemetry SDK with OTLP exporters.
 * Sets OTEL_EXPORTER_OTLP_TRACES_ENDPOINT and
 * OTEL_EXPORTER_OTLP_LOGS_ENDPOINT (or TEMPO_ENDPOINT / LOKI_ENDPOINT)
 * to wire Tempo and Loki.
 */
export async function setupObservability(): Promise<void> {
  const traceUrl =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    process.env.TEMPO_ENDPOINT ??
    "";
  const lokiUrl =
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ??
    process.env.LOKI_ENDPOINT ??
    "";

  if (!traceUrl) {
    return;
  }

  const sdkNode = safeRequire<any>("@opentelemetry/sdk-node", "NodeSDK");
  if (!sdkNode) return;

  const exporters = safeRequire<any>("@opentelemetry/exporter-trace-otlp-http", "OTLPTraceExporter");
  const api = safeRequire<any>("@opentelemetry/api", "trace");
  const spanStatusFromApi = safeRequire<any>("@opentelemetry/api", "SpanStatusCode");
  const { NodeSDK } = sdkNode;
  const { OTLPTraceExporter } = exporters ?? {};
  if (!NodeSDK || !OTLPTraceExporter || !api?.trace) {
    return;
  }

  const configuredStatusCode = {
    OK: spanStatusFromApi?.OK ?? fallbackSpanStatus.OK,
    ERROR: spanStatusFromApi?.ERROR ?? fallbackSpanStatus.ERROR,
  };

  const traceExporter = new OTLPTraceExporter({
    url: `${traceUrl}/v1/traces`,
  });

  // Logs are intentionally optional because Loki exporters are environment optional.
  // A downstream logger sink (file/centralized log collector) can be attached
  // independently by configuring application logging infrastructure.
  if (lokiUrl) {
    loggerDebug("OpenTelemetry logs endpoint configured", lokiUrl);
  }

  const nodeSdk = new NodeSDK({ traceExporter });
  sdk = nodeSdk;
  await nodeSdk.start();
  tracer = api.trace.getTracer("data-agent-2.0");
  spanStatusCache = configuredStatusCode;
}

/**
 * Executes a traced async block if tracing is configured, otherwise executes directly.
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T> | T,
  attributes: Record<string, unknown> = {},
): Promise<T> {
  if (!tracer) {
    return fn();
  }

  return (await tracer.startActiveSpan(name, async (span: Span) => {
    span.setAttributes(attributes);
    try {
      const value = await fn();
      span.setStatus({ code: spanStatusCache.OK });
      return value as T;
    } catch (error) {
      span.setStatus({
        code: spanStatusCache.ERROR,
        message: String((error as Error).message),
      });
      throw error;
    } finally {
      span.end();
    }
  })) as T;
}

type SpanStatusCache = {
  OK: number;
  ERROR: number;
};

let spanStatusCache: SpanStatusCache = fallbackSpanStatus;

/**
 * Shutdown helper for process hooks and tests.
 */
export async function shutdownObservability(): Promise<void> {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = null;
  tracer = null;
}

function safeRequire<T>(moduleName: string, propertyName?: string): T | null {
  try {
    const moduleExports = requireModule(moduleName);
    if (propertyName) {
      return (moduleExports as Record<string, unknown>)[propertyName] as T;
    }
    return moduleExports as T;
  } catch {
    return null;
  }
}

function loggerDebug(message: string, value: string): void {
  if (process.env.NODE_ENV !== "test") {
    console.debug(`[data-agent-observability] ${message}: ${value}`);
  }
}

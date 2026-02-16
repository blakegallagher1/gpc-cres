/**
 * OpenTelemetry bootstrap for tracing and optional Tempo/Loki observability.
 * This implementation is defensive: it enables instrumentation when dependencies are
 * available and silently degrades to no-op tracing when not present.
 */
/**
 * Starts OpenTelemetry SDK with OTLP exporters.
 * Sets OTEL_EXPORTER_OTLP_TRACES_ENDPOINT and
 * OTEL_EXPORTER_OTLP_LOGS_ENDPOINT (or TEMPO_ENDPOINT / LOKI_ENDPOINT)
 * to wire Tempo and Loki.
 */
export declare function setupObservability(): Promise<void>;
/**
 * Executes a traced async block if tracing is configured, otherwise executes directly.
 */
export declare function withSpan<T>(name: string, fn: () => Promise<T> | T, attributes?: Record<string, unknown>): Promise<T>;
/**
 * Shutdown helper for process hooks and tests.
 */
export declare function shutdownObservability(): Promise<void>;
//# sourceMappingURL=setup.d.ts.map
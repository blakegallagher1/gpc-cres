"use strict";
/**
 * OpenTelemetry bootstrap for tracing and optional Tempo/Loki observability.
 * This implementation is defensive: it enables instrumentation when dependencies are
 * available and silently degrades to no-op tracing when not present.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupObservability = setupObservability;
exports.withSpan = withSpan;
exports.shutdownObservability = shutdownObservability;
const node_module_1 = require("node:module");
const requireModule = (0, node_module_1.createRequire)(import.meta.url);
let tracer = null;
let sdk = null;
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
async function setupObservability() {
    const traceUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        process.env.TEMPO_ENDPOINT ??
        "";
    const lokiUrl = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ??
        process.env.LOKI_ENDPOINT ??
        "";
    if (!traceUrl) {
        return;
    }
    const sdkNode = safeRequire("@opentelemetry/sdk-node", "NodeSDK");
    if (!sdkNode)
        return;
    const exporters = safeRequire("@opentelemetry/exporter-trace-otlp-http", "OTLPTraceExporter");
    const api = safeRequire("@opentelemetry/api", "trace");
    const spanStatusFromApi = safeRequire("@opentelemetry/api", "SpanStatusCode");
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
async function withSpan(name, fn, attributes = {}) {
    if (!tracer) {
        return fn();
    }
    return (await tracer.startActiveSpan(name, async (span) => {
        span.setAttributes(attributes);
        try {
            const value = await fn();
            span.setStatus({ code: spanStatusCache.OK });
            return value;
        }
        catch (error) {
            span.setStatus({
                code: spanStatusCache.ERROR,
                message: String(error.message),
            });
            throw error;
        }
        finally {
            span.end();
        }
    }));
}
let spanStatusCache = fallbackSpanStatus;
/**
 * Shutdown helper for process hooks and tests.
 */
async function shutdownObservability() {
    if (!sdk)
        return;
    await sdk.shutdown();
    sdk = null;
    tracer = null;
}
function safeRequire(moduleName, propertyName) {
    try {
        const moduleExports = requireModule(moduleName);
        if (propertyName) {
            return moduleExports[propertyName];
        }
        return moduleExports;
    }
    catch {
        return null;
    }
}
function loggerDebug(message, value) {
    if (process.env.NODE_ENV !== "test") {
        console.debug(`[data-agent-observability] ${message}: ${value}`);
    }
}
//# sourceMappingURL=setup.js.map
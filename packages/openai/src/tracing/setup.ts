import {
  addTraceProcessor,
  BatchTraceProcessor,
  getGlobalTraceProvider,
  startTraceExportLoop,
} from "@openai/agents";
import { StructuredTraceExporter } from "./exporter.js";

let tracingConfigured = false;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type AgentTracingSetupOptions = {
  startLoop?: boolean;
};

export function isAgentTracingConfigured(): boolean {
  return tracingConfigured;
}

export function setupAgentTracing(options: AgentTracingSetupOptions = {}): void {
  if (tracingConfigured) return;
  if (process.env.OPENAI_AGENTS_TRACING_DISABLED === "true") return;

  const exporter = new StructuredTraceExporter();
  const processor = new BatchTraceProcessor(exporter, {
    maxQueueSize: envNumber("OPENAI_AGENTS_TRACE_MAX_QUEUE_SIZE", 2048),
    maxBatchSize: envNumber("OPENAI_AGENTS_TRACE_MAX_BATCH_SIZE", 200),
    scheduleDelay: envNumber("OPENAI_AGENTS_TRACE_SCHEDULE_DELAY_MS", 5000),
    exportTriggerRatio: envNumber("OPENAI_AGENTS_TRACE_EXPORT_TRIGGER_RATIO", 0.7),
  });

  getGlobalTraceProvider().setDisabled(false);
  addTraceProcessor(processor);
  if (options.startLoop !== false) {
    startTraceExportLoop();
  }

  tracingConfigured = true;
}

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type EvalMode = "fixture" | "live";
type EvalSeverity = "info" | "warning" | "error";
type CaseStatus = "pass" | "fail" | "skip";

export type AgentEvalCase = {
  id: string;
  title: string;
  prompt: string;
  requiredSignals: string[];
  requiredTools: string[];
  requiredEventTypes: string[];
  maxLatencyMs: number;
};

export type AgentEvalTranscript = {
  text: string;
  events: AgentEvalEvent[];
  durationMs: number;
  httpStatus: number | null;
  error: string | null;
};

export type AgentEvalEvent = {
  type: string;
  toolName?: string | null;
  text?: string | null;
  payload?: unknown;
};

export type AgentEvalCaseResult = {
  id: string;
  title: string;
  status: CaseStatus;
  severity: EvalSeverity;
  durationMs: number;
  score: number;
  checks: AgentEvalCheck[];
  summary: string;
  mode: EvalMode;
};

export type AgentEvalCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type AgentEvalReport = {
  ok: boolean;
  generatedAt: string;
  mode: EvalMode;
  baseUrl: string | null;
  websocketTransport: boolean;
  durationMs: number;
  caseCount: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  results: AgentEvalCaseResult[];
};

type RuntimeConfig = {
  mode: EvalMode;
  baseUrl: string | null;
  outputDir: string;
  authBearer: string | null;
  sessionCookie: string | null;
  websocketTransport: boolean;
};

const DEFAULT_OUTPUT_DIR = "output/agent-evals";
const JSON_LINE_PREFIXES = ["data:", "event:"];

export const GOLDEN_OPERATOR_EVAL_CASES: AgentEvalCase[] = [
  {
    id: "ebr-parish-count",
    title: "East Baton Rouge property count uses property DB evidence",
    prompt:
      "How many properties in East Baton Rouge do we have in the property database? Use database evidence and cite the query route.",
    requiredSignals: ["east baton rouge", "property", "database", "evidence"],
    requiredTools: ["query_property_db_sql"],
    requiredEventTypes: ["tool_start", "tool_end"],
    maxLatencyMs: 90_000,
  },
  {
    id: "parcel-screening-evidence",
    title: "Parcel screening cites parcel data and produces action path",
    prompt:
      "Screen an East Baton Rouge commercial parcel for acquisition fit. Include parcel facts, risk flags, evidence, and the next operator action.",
    requiredSignals: ["parcel", "risk", "evidence", "action"],
    requiredTools: ["query_property_db_sql"],
    requiredEventTypes: ["tool_start", "done"],
    maxLatencyMs: 120_000,
  },
  {
    id: "memory-conflict-discipline",
    title: "Memory lookup rejects unsupported stale facts",
    prompt:
      "Use memory only if it is supported by durable evidence. If a property fact conflicts with current parcel evidence, call out the conflict instead of trusting memory.",
    requiredSignals: ["memory", "evidence", "conflict"],
    requiredTools: ["get_entity_memory"],
    requiredEventTypes: ["tool_start", "done"],
    maxLatencyMs: 120_000,
  },
];

function runtimeConfig(): RuntimeConfig {
  const baseUrl = optionalEnv("AGENT_EVAL_BASE_URL", process.env.OPS_SENTINEL_BASE_URL ?? null);
  const authBearer = optionalEnv("AGENT_EVAL_AUTH_BEARER", process.env.OPS_SENTINEL_AUTH_BEARER ?? process.env.AUTH_BEARER ?? null);
  const sessionCookie = optionalEnv("AGENT_EVAL_SESSION_COOKIE", process.env.OPS_SENTINEL_SESSION_COOKIE ?? process.env.SESSION_COOKIE ?? null);
  const explicitMode = process.env.AGENT_EVAL_MODE;
  const liveReady = Boolean(baseUrl && (authBearer || sessionCookie));
  return {
    mode: explicitMode === "live" ? "live" : explicitMode === "fixture" ? "fixture" : liveReady ? "live" : "fixture",
    baseUrl: baseUrl ? baseUrl.replace(/\/$/, "") : null,
    outputDir: path.resolve(optionalEnv("AGENT_EVAL_OUTPUT_DIR", DEFAULT_OUTPUT_DIR) ?? DEFAULT_OUTPUT_DIR),
    authBearer,
    sessionCookie,
    websocketTransport:
      process.env.AGENT_EVAL_WEBSOCKET_TRANSPORT === "true" ||
      process.env.OPENAI_AGENTS_RESPONSES_TRANSPORT === "websocket",
  };
}

function optionalEnv(name: string, fallback: string | null): string | null {
  const value = process.env[name] ?? fallback;
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function scoreAgentEvalCase(
  testCase: AgentEvalCase,
  transcript: AgentEvalTranscript,
  mode: EvalMode,
): AgentEvalCaseResult {
  const lowerText = transcript.text.toLowerCase();
  const tools = new Set(
    transcript.events
      .map((event) => event.toolName)
      .filter((toolName): toolName is string => Boolean(toolName)),
  );
  const eventTypes = new Set(transcript.events.map((event) => event.type));
  const checks: AgentEvalCheck[] = [
    {
      name: "http_ok",
      passed: transcript.httpStatus === null || (transcript.httpStatus >= 200 && transcript.httpStatus < 300),
      detail: transcript.httpStatus === null ? "no HTTP request" : `HTTP ${transcript.httpStatus}`,
    },
    {
      name: "no_runtime_error",
      passed: transcript.error === null,
      detail: transcript.error ?? "ok",
    },
    {
      name: "latency_budget",
      passed: transcript.durationMs <= testCase.maxLatencyMs,
      detail: `${transcript.durationMs}ms <= ${testCase.maxLatencyMs}ms`,
    },
    ...testCase.requiredSignals.map((signal) => ({
      name: `signal:${signal}`,
      passed: lowerText.includes(signal.toLowerCase()),
      detail: signal,
    })),
    ...testCase.requiredTools.map((tool) => ({
      name: `tool:${tool}`,
      passed: tools.has(tool),
      detail: Array.from(tools).join(", ") || "no tools",
    })),
    ...testCase.requiredEventTypes.map((eventType) => ({
      name: `event:${eventType}`,
      passed: eventTypes.has(eventType),
      detail: Array.from(eventTypes).join(", ") || "no events",
    })),
  ];
  const passedCount = checks.filter((check) => check.passed).length;
  const score = Number((passedCount / checks.length).toFixed(4));
  const status: CaseStatus = checks.every((check) => check.passed) ? "pass" : "fail";
  return {
    id: testCase.id,
    title: testCase.title,
    status,
    severity: status === "pass" ? "info" : mode === "fixture" ? "warning" : "error",
    durationMs: transcript.durationMs,
    score,
    checks,
    summary: `${passedCount}/${checks.length} checks passed`,
    mode,
  };
}

export function buildAgentEvalReport(
  results: AgentEvalCaseResult[],
  config: Pick<RuntimeConfig, "mode" | "baseUrl" | "websocketTransport">,
  durationMs: number,
): AgentEvalReport {
  const passCount = results.filter((result) => result.status === "pass").length;
  const failCount = results.filter((result) => result.status === "fail").length;
  const skipCount = results.filter((result) => result.status === "skip").length;
  return {
    ok: failCount === 0,
    generatedAt: new Date().toISOString(),
    mode: config.mode,
    baseUrl: config.baseUrl,
    websocketTransport: config.websocketTransport,
    durationMs,
    caseCount: results.length,
    passCount,
    failCount,
    skipCount,
    results,
  };
}

export function parseAgentStream(raw: string): AgentEvalEvent[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line): AgentEvalEvent[] => {
      const normalized = JSON_LINE_PREFIXES.reduce(
        (current, prefix) => (current.startsWith(prefix) ? current.slice(prefix.length).trim() : current),
        line,
      );
      if (!normalized.startsWith("{")) {
        return [];
      }
      try {
        return [normalizeEvent(JSON.parse(normalized) as Record<string, unknown>)];
      } catch {
        return [];
      }
    });
}

function normalizeEvent(record: Record<string, unknown>): AgentEvalEvent {
  const payload = typeof record.payload === "object" && record.payload !== null ? (record.payload as Record<string, unknown>) : record;
  const toolName =
    stringField(record.toolName) ??
    stringField(record.tool_name) ??
    stringField(payload.toolName) ??
    stringField(payload.tool_name) ??
    stringField(payload.name);
  return {
    type: stringField(record.type) ?? stringField(record.event) ?? "unknown",
    toolName,
    text: stringField(record.text) ?? stringField(record.content) ?? stringField(payload.text) ?? null,
    payload: record,
  };
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function runLiveCase(config: RuntimeConfig, testCase: AgentEvalCase): Promise<AgentEvalTranscript> {
  if (!config.baseUrl) {
    throw new Error("AGENT_EVAL_BASE_URL is required for live mode.");
  }
  const startedAt = Date.now();
  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.authBearer ? { authorization: `Bearer ${config.authBearer}` } : {}),
      ...(config.sessionCookie ? { cookie: config.sessionCookie } : {}),
      ...(config.websocketTransport ? { "x-agent-eval-transport": "responses-websocket" } : {}),
    },
    body: JSON.stringify({
      message: testCase.prompt,
      messages: [{ role: "user", content: testCase.prompt }],
      conversationId: `agent-eval-${testCase.id}-${Date.now()}`,
      stream: true,
    }),
  });
  const raw = await response.text();
  const events = parseAgentStream(raw);
  const text = events.map((event) => event.text).filter(Boolean).join("\n") || raw;
  return {
    text,
    events,
    durationMs: Date.now() - startedAt,
    httpStatus: response.status,
    error: response.ok ? null : raw.slice(0, 1_000),
  };
}

function runFixtureCase(testCase: AgentEvalCase): AgentEvalTranscript {
  return {
    text: [
      `Fixture evaluation for ${testCase.title}.`,
      `The response uses database evidence for East Baton Rouge property parcel risk and action workflows.`,
      `Memory evidence conflicts are called out before promotion.`,
    ].join(" "),
    events: [
      { type: "tool_start", toolName: testCase.requiredTools[0] ?? "query_property_db_sql" },
      { type: "tool_end", toolName: testCase.requiredTools[0] ?? "query_property_db_sql" },
      { type: "done" },
    ],
    durationMs: 25,
    httpStatus: null,
    error: null,
  };
}

async function main(): Promise<void> {
  const config = runtimeConfig();
  const startedAt = Date.now();
  const results: AgentEvalCaseResult[] = [];

  for (const testCase of GOLDEN_OPERATOR_EVAL_CASES) {
    const transcript =
      config.mode === "live" ? await runLiveCase(config, testCase) : runFixtureCase(testCase);
    results.push(scoreAgentEvalCase(testCase, transcript, config.mode));
  }

  const report = buildAgentEvalReport(results, config, Date.now() - startedAt);
  mkdirSync(config.outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(config.outputDir, `agent-evals-${stamp}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(config.outputDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[agent-evals] mode=${report.mode} ok=${report.ok} report=${reportPath}`);
  for (const result of report.results) {
    console.log(`[agent-evals] ${result.id} status=${result.status} score=${result.score} ${result.summary}`);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error("[agent-evals] fatal:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

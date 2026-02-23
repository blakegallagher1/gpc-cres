import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isAgentOsFeatureEnabled } from "../config.js";

type JsonRecord = Record<string, unknown>;

export type PolicyDecision = {
  action: "approve" | "deny" | "escalate";
  reason: string;
  rule?: string;
};

export type PolicyAuditEntry = {
  ts: string;
  toolName: string;
  decision: PolicyDecision;
  inputSummary: string;
};

type DbAccessPolicy = {
  allow_writes: boolean;
  blocked_patterns: string[];
};

type PiiPattern = {
  regex: string;
  label: string;
  action: "block" | "warn";
  redaction: string;
};

type PiiDetectionPolicy = {
  patterns: Record<string, PiiPattern>;
};

const SQL_WRITE_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bCREATE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bTRUNCATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];

function loadYaml<T>(filename: string): T | null {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const filePath = resolve(dir, "..", "policies", filename);
    const raw = readFileSync(filePath, "utf-8");
    return parseSimpleYaml(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Minimal YAML parser for our simple config files.
 * Handles scalars, lists (dash-prefixed), and one-level nested maps.
 */
function parseSimpleYaml(text: string): JsonRecord {
  const result: JsonRecord = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;
  let currentMap: JsonRecord | null = null;
  let mapIndent = 0;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "");
    if (line.trim().length === 0) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      if (currentList !== null && currentKey) {
        currentList.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
        continue;
      }
    }

    if (currentList !== null && currentKey && indent <= 0) {
      result[currentKey] = currentList;
      currentList = null;
      currentKey = null;
    }

    if (currentMap !== null && currentKey && indent <= mapIndent) {
      result[currentKey] = currentMap;
      currentMap = null;
      currentKey = null;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();

    if (currentMap !== null && currentKey && indent > mapIndent) {
      if (val) {
        currentMap[key] = val.replace(/^["']|["']$/g, "");
      }
      continue;
    }

    if (val === "" || val === undefined) {
      if (currentList !== null && currentKey) {
        result[currentKey] = currentList;
      }
      if (currentMap !== null && currentKey) {
        result[currentKey] = currentMap;
      }

      currentKey = key;
      currentList = null;
      currentMap = null;

      const nextLineIdx = text.indexOf("\n", text.indexOf(rawLine) + rawLine.length);
      if (nextLineIdx !== -1) {
        const nextLine = text.slice(nextLineIdx + 1).split("\n")[0] ?? "";
        const nextTrimmed = nextLine.trim();
        if (nextTrimmed.startsWith("- ")) {
          currentList = [];
        } else if (nextTrimmed.includes(":")) {
          currentMap = {};
          mapIndent = indent;
        }
      }
      continue;
    }

    if (val === "true") result[key] = true;
    else if (val === "false") result[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(val)) result[key] = Number(val);
    else result[key] = val.replace(/^["']|["']$/g, "");
  }

  if (currentList !== null && currentKey) result[currentKey] = currentList;
  if (currentMap !== null && currentKey) result[currentKey] = currentMap;

  return result;
}

let _dbPolicy: DbAccessPolicy | null = null;
let _piiPolicy: PiiDetectionPolicy | null = null;

function getDbPolicy(): DbAccessPolicy {
  if (!_dbPolicy) {
    const raw = loadYaml<JsonRecord>("db_access.yaml");
    _dbPolicy = {
      allow_writes: raw?.allow_writes === true || process.env.ALLOW_DB_WRITES === "true",
      blocked_patterns: Array.isArray(raw?.blocked_patterns)
        ? (raw.blocked_patterns as string[])
        : ["DROP TABLE", "DROP DATABASE", "TRUNCATE", "ALTER TABLE"],
    };
  }
  return _dbPolicy;
}

const DEFAULT_PII_PATTERNS: PiiPattern[] = [
  { regex: "\\d{3}-\\d{2}-\\d{4}", label: "SSN", action: "block", redaction: "[REDACTED-SSN]" },
  { regex: "\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}", label: "Credit Card", action: "block", redaction: "[REDACTED-CC]" },
];

function getPiiPatterns(): PiiPattern[] {
  if (!_piiPolicy) {
    _piiPolicy = { patterns: {} };
    try {
      const raw = loadYaml<JsonRecord>("pii_detection.yaml");
      const patterns = (raw?.patterns ?? {}) as Record<string, JsonRecord>;
      const parsed = Object.entries(patterns)
        .map(([key, val]) => ({
          regex: String(val?.regex ?? ""),
          label: String(val?.label ?? key),
          action: (val?.action === "block" ? "block" : "warn") as "block" | "warn",
          redaction: String(val?.redaction ?? `[REDACTED-${key.toUpperCase()}]`),
        }))
        .filter((p) => p.regex.length > 0);

      if (parsed.length > 0) {
        _piiPolicy.patterns = Object.fromEntries(parsed.map((p) => [p.label, p]));
        return parsed;
      }
    } catch {
      /* fall through to defaults */
    }
    _piiPolicy.patterns = Object.fromEntries(DEFAULT_PII_PATTERNS.map((p) => [p.label, p]));
  }
  return Object.values(_piiPolicy.patterns);
}

const auditLog: PolicyAuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 1000;

function audit(entry: PolicyAuditEntry): void {
  if (auditLog.length >= MAX_AUDIT_ENTRIES) auditLog.shift();
  auditLog.push(entry);
}

export function getAuditLog(): readonly PolicyAuditEntry[] {
  return auditLog;
}

function summarizeInput(input: unknown): string {
  if (typeof input === "string") return input.slice(0, 200);
  try {
    const s = JSON.stringify(input);
    return s.slice(0, 200);
  } catch {
    return "[unserializable]";
  }
}

function hasSqlContent(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (typeof input !== "object" || input === null) return null;
  const rec = input as JsonRecord;
  for (const value of Object.values(rec)) {
    if (typeof value === "string" && value.length > 5) {
      if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)\b/i.test(value)) {
        return value;
      }
    }
  }
  return null;
}

export class PolicyEngine {
  private runCostUsd = 0;
  private costCapUsd: number;

  constructor(costCapUsd = 5) {
    this.costCapUsd = costCapUsd;
  }

  addCost(costUsd: number): void {
    this.runCostUsd += costUsd;
  }

  resetCost(): void {
    this.runCostUsd = 0;
  }

  evaluate(
    toolName: string,
    input: unknown,
    context?: { riskLevel?: string },
  ): PolicyDecision {
    if (!isAgentOsFeatureEnabled("policyEngine")) {
      return { action: "approve", reason: "Policy engine disabled" };
    }

    const decision = this._evaluate(toolName, input, context);

    audit({
      ts: new Date().toISOString(),
      toolName,
      decision,
      inputSummary: summarizeInput(input),
    });

    return decision;
  }

  private _evaluate(
    toolName: string,
    input: unknown,
    context?: { riskLevel?: string },
  ): PolicyDecision {
    const costCheck = this.checkCostCap();
    if (costCheck) return costCheck;

    const sqlCheck = this.checkSqlPolicy(input);
    if (sqlCheck) return sqlCheck;

    const piiCheck = this.checkPii(input);
    if (piiCheck) return piiCheck;

    const riskCheck = this.checkRiskLevel(toolName, context);
    if (riskCheck) return riskCheck;

    return { action: "approve", reason: "All policies passed" };
  }

  private checkCostCap(): PolicyDecision | null {
    if (this.runCostUsd >= this.costCapUsd) {
      return {
        action: "deny",
        reason: `Run cost $${this.runCostUsd.toFixed(2)} exceeds cap $${this.costCapUsd.toFixed(2)}`,
        rule: "cost_cap",
      };
    }
    return null;
  }

  private checkSqlPolicy(input: unknown): PolicyDecision | null {
    const sql = hasSqlContent(input);
    if (!sql) return null;

    const dbPolicy = getDbPolicy();

    for (const blocked of dbPolicy.blocked_patterns) {
      if (sql.toUpperCase().includes(blocked.toUpperCase())) {
        return {
          action: "deny",
          reason: `Blocked SQL pattern: ${blocked}`,
          rule: "sql_blocked_pattern",
        };
      }
    }

    if (!dbPolicy.allow_writes) {
      for (const pattern of SQL_WRITE_PATTERNS) {
        if (pattern.test(sql)) {
          return {
            action: "deny",
            reason: "Write operations blocked in read-only mode",
            rule: "sql_read_only",
          };
        }
      }
    }

    return null;
  }

  private checkPii(input: unknown): PolicyDecision | null {
    const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
    const patterns = getPiiPatterns();

    for (const pattern of patterns) {
      if (!pattern.regex) continue;
      try {
        const re = new RegExp(pattern.regex);
        if (re.test(text) && pattern.action === "block") {
          return {
            action: "deny",
            reason: `PII detected: ${pattern.label}`,
            rule: "pii_detection",
          };
        }
      } catch {
        /* invalid regex in config — skip */
      }
    }

    return null;
  }

  private checkRiskLevel(
    _toolName: string,
    context?: { riskLevel?: string },
  ): PolicyDecision | null {
    const risk = context?.riskLevel?.toUpperCase();
    if (risk === "HIGH" || risk === "CRITICAL") {
      return {
        action: "escalate",
        reason: `Tool risk level is ${risk} — requires HITL approval`,
        rule: "risk_level_gate",
      };
    }
    return null;
  }
}

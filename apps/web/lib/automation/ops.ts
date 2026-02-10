/**
 * Ops automation utilities (#12 from Automation Frontier).
 * Migration safety checks, health evaluation, deployment verification.
 */

/**
 * Destructive SQL patterns that should never be auto-run in migrations.
 * Each pattern includes a description for error messages.
 */
const DESTRUCTIVE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  description: string;
}> = [
  { pattern: /\bDROP\s+TABLE\b/i, description: "DROP TABLE" },
  { pattern: /\bDROP\s+SCHEMA\b/i, description: "DROP SCHEMA" },
  { pattern: /\bDROP\s+DATABASE\b/i, description: "DROP DATABASE" },
  { pattern: /\bTRUNCATE\b/i, description: "TRUNCATE" },
  {
    pattern: /\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/i,
    description: "ALTER TABLE DROP COLUMN",
  },
  {
    pattern: /\bALTER\s+TABLE\b[^;]*\bDROP\s+CONSTRAINT\b/i,
    description: "ALTER TABLE DROP CONSTRAINT",
  },
  { pattern: /\bDROP\s+INDEX\b/i, description: "DROP INDEX" },
  { pattern: /\bDELETE\s+FROM\b/i, description: "DELETE FROM" },
  { pattern: /\bDROP\s+TYPE\b/i, description: "DROP TYPE" },
];

export interface MigrationSafetyResult {
  safe: boolean;
  destructiveOperations: string[];
}

/**
 * Check if a SQL migration is safe for automatic execution.
 * Returns { safe: false } if any destructive DDL operations are detected.
 *
 * Additive operations (CREATE TABLE, ADD COLUMN, CREATE INDEX) are safe.
 * Destructive operations (DROP TABLE, TRUNCATE, etc.) require human review.
 */
export function isMigrationSafe(sql: string): MigrationSafetyResult {
  const destructiveOperations: string[] = [];

  for (const { pattern, description } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(sql)) {
      destructiveOperations.push(description);
    }
  }

  return {
    safe: destructiveOperations.length === 0,
    destructiveOperations,
  };
}

export interface HealthCheckResult {
  status: "ok" | "degraded" | "down";
  missingVars: string[];
  timestamp: string;
}

/**
 * Required environment variables for a healthy deployment.
 * Subset of the 42 vars checked in /api/health — these are the critical ones.
 */
const CRITICAL_ENV_VARS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
] as const;

/**
 * Evaluate deployment health based on environment variable presence.
 * Returns "ok" if all critical vars present, "degraded" if some missing,
 * "down" if essential vars (DATABASE_URL, OPENAI_API_KEY) missing.
 */
export function evaluateHealth(): HealthCheckResult {
  const missingVars: string[] = [];

  for (const v of CRITICAL_ENV_VARS) {
    if (!process.env[v]) {
      missingVars.push(v);
    }
  }

  let status: "ok" | "degraded" | "down" = "ok";
  if (missingVars.includes("DATABASE_URL") || missingVars.includes("OPENAI_API_KEY")) {
    status = "down";
  } else if (missingVars.length > 0) {
    status = "degraded";
  }

  return {
    status,
    missingVars,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a consecutive failure count warrants an alert.
 * Returns true if >= threshold (default 3 per Automation Frontier spec).
 */
export function shouldAlertOnFailure(
  consecutiveFailures: number,
  threshold = 3
): boolean {
  return consecutiveFailures >= threshold;
}

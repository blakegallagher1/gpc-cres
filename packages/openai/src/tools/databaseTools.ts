import { tool } from "@openai/agents";
import { prisma } from "@entitlement-os/db";
import { z } from "zod";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_SQL_LENGTH = 8000;

const ALLOWED_TABLES = new Set([
  "orgs",
  "org_memberships",
  "jurisdictions",
  "jurisdiction_seed_sources",
  "deals",
  "parcels",
  "tasks",
  "buyers",
  "outreach",
  "runs",
  "evidence_sources",
  "evidence_snapshots",
  "parish_pack_versions",
  "artifacts",
  "uploads",
  "document_extractions",
  "conversations",
  "messages",
  "entities",
  "entity_deals",
  "tax_events",
  "notifications",
  "notification_preferences",
  "saved_searches",
  "approval_requests",
  "market_data_points",
  "automation_events",
  "opportunity_matches",
  "knowledge_embeddings",
  "entitlement_graph_nodes",
  "entitlement_graph_edges",
  "entitlement_outcome_precedents",
  "entitlement_prediction_snapshots",
  "deal_outcomes",
  "deal_terms",
  "environmental_assessments",
  "entitlement_paths",
  "property_titles",
  "property_surveys",
  "tenants",
  "tenant_leases",
  "development_budgets",
  "capital_sources",
  "equity_waterfalls",
  "capital_deployments",
  "deal_financings",
  "deal_risks",
  "deal_stakeholders",
  "assumption_actuals",
]);

const FORBIDDEN_SQL_TOKENS = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|comment|copy|call|execute|vacuum|analyze|refresh|merge)\b/i;
const TABLE_REF_REGEX = /\b(?:from|join)\s+([a-zA-Z0-9_."]+)/gi;

function normalizeTableIdentifier(raw: string): string {
  const noQuotes = raw.replace(/"/g, "");
  const withoutSchema = noQuotes.includes(".")
    ? noQuotes.split(".").pop() ?? noQuotes
    : noQuotes;
  return withoutSchema.trim().toLowerCase();
}

function extractReferencedTables(sql: string): string[] {
  const tables: string[] = [];
  for (const match of sql.matchAll(TABLE_REF_REGEX)) {
    const table = normalizeTableIdentifier(match[1] ?? "");
    if (table.length > 0) {
      tables.push(table);
    }
  }
  return [...new Set(tables)];
}

function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();
  if (!(normalized.startsWith("select") || normalized.startsWith("with"))) {
    return false;
  }
  if (FORBIDDEN_SQL_TOKENS.test(normalized)) {
    return false;
  }
  if (normalized.includes(";")) {
    return false;
  }
  return true;
}

function enforceAllowedTables(sql: string): string | null {
  const tables = extractReferencedTables(sql);
  const disallowed = tables.filter((table) => !ALLOWED_TABLES.has(table));
  if (disallowed.length > 0) {
    return `Disallowed table(s) referenced: ${disallowed.join(", ")}.`;
  }
  return null;
}

function compileOrgScopedSql(sql: string, orgId: string): string | null {
  if (!sql.includes("{{org_id}}")) {
    return null;
  }
  const escapedOrgId = orgId.replace(/'/g, "''");
  return sql.replaceAll("{{org_id}}", `'${escapedOrgId}'::uuid`);
}

export const query_org_sql = tool({
  name: "query_org_sql",
  description:
    "Run a read-only SQL analytics query against the Entitlement OS Postgres database. " +
    "Use this for counting, grouping, filtering, and joining org-scoped records when a normal lookup tool is insufficient. " +
    "Strict rules: SELECT/CTE only, allowed tables only, and SQL MUST include the {{org_id}} placeholder for org scoping.",
  parameters: z.object({
    orgId: z.string().uuid().describe("Organization ID for mandatory data scoping."),
    sql: z
      .string()
      .min(1)
      .max(MAX_SQL_LENGTH)
      .describe(
        "Read-only SQL. Must start with SELECT or WITH, no semicolons, and must include {{org_id}} where org scope is applied.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .nullable()
      .describe(`Max rows to return after query execution (default ${DEFAULT_LIMIT}).`),
  }),
  execute: async ({ orgId, sql, limit }) => {
    const trimmedSql = sql.trim();
    if (!isReadOnlyQuery(trimmedSql)) {
      return JSON.stringify({
        error:
          "Only single-statement read-only SELECT/CTE queries are allowed. Write operations are blocked.",
      });
    }

    const tablePolicyError = enforceAllowedTables(trimmedSql);
    if (tablePolicyError) {
      return JSON.stringify({ error: tablePolicyError });
    }

    const scopedSql = compileOrgScopedSql(trimmedSql, orgId);
    if (!scopedSql) {
      return JSON.stringify({
        error:
          "SQL must include the {{org_id}} placeholder so org scoping can be enforced.",
      });
    }

    const safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit ?? DEFAULT_LIMIT));
    const boundedSql = `SELECT * FROM (${scopedSql}) AS q LIMIT ${safeLimit}`;

    try {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(boundedSql);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return JSON.stringify({
        ok: true,
        rowCount: rows.length,
        columns,
        rows,
        limitApplied: safeLimit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SQL query failed";
      return JSON.stringify({
        ok: false,
        error: message,
      });
    }
  },
});

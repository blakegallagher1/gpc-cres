#!/usr/bin/env npx tsx
/**
 * Ingest EBR zoning district data into the knowledge base.
 *
 * Reads 45 district JSONs + 3 metadata files from chatgpt-apps/zoning/ebr/
 * and POSTs each to /api/knowledge with action:"ingest".
 *
 * Usage:
 *   npx tsx scripts/ingest-ebr-zoning.ts [--dry-run] [--base-url URL]
 *
 * Requires env vars (from .env.local or shell):
 *   NEXTAUTH_SECRET  — for generating a service token
 *   LOCAL_API_KEY    — used as bearer auth
 */

import * as fs from "fs";
import * as path from "path";

const ZONING_DIR = path.resolve(
  process.env.HOME || "/Users/gallagherpropertycompany",
  "Documents/chatgpt-apps/zoning/ebr"
);
const DISTRICTS_DIR = path.join(ZONING_DIR, "districts");

const BASE_URL =
  process.argv.find((a) => a.startsWith("--base-url="))?.split("=")[1] ||
  "https://gallagherpropco.com";
const DRY_RUN = process.argv.includes("--dry-run");
const API_KEY = process.env.LOCAL_API_KEY;
const SESSION_COOKIE = process.env.SESSION_COOKIE;

if (!API_KEY && !SESSION_COOKIE && !DRY_RUN) {
  console.error("ERROR: LOCAL_API_KEY or SESSION_COOKIE env var required (or use --dry-run)");
  process.exit(1);
}

// --- Formatters ---

interface Standard {
  value: number | null;
  units?: string;
  notes?: string;
  citations?: Array<{ label: string; ref: string }>;
}

interface Use {
  use: string;
  permission: string;
  conditions?: string;
  citations?: Array<{ label: string; ref: string }>;
}

interface District {
  id: string;
  label: string;
  notes?: string;
  category?: string;
  uses?: Use[];
  standards?: Record<string, Standard>;
}

function formatDistrict(d: District): string {
  const lines: string[] = [];
  lines.push(`# ${d.label} (${d.id.toUpperCase()})`);
  lines.push(`Parish: East Baton Rouge`);
  if (d.notes) lines.push(`\nNotes: ${d.notes}`);
  if (d.category) lines.push(`Category: ${d.category}`);

  if (d.standards && Object.keys(d.standards).length > 0) {
    lines.push(`\n## Dimensional Standards`);
    for (const [key, std] of Object.entries(d.standards)) {
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (std.value != null) {
        lines.push(`- ${label}: ${std.value} ${std.units || ""}`);
      } else {
        lines.push(`- ${label}: N/A`);
      }
      if (std.notes) lines.push(`  Note: ${std.notes}`);
      if (std.citations?.length) {
        lines.push(`  Citation: ${std.citations.map((c) => `${c.label} ${c.ref}`).join("; ")}`);
      }
    }
  }

  if (d.uses?.length) {
    lines.push(`\n## Key Uses`);
    for (const u of d.uses) {
      lines.push(`- ${u.use}: ${u.permission}`);
      if (u.conditions) lines.push(`  Conditions: ${u.conditions}`);
      if (u.citations?.length) {
        lines.push(`  Citation: ${u.citations.map((c) => `${c.label} ${c.ref}`).join("; ")}`);
      }
    }
  }

  return lines.join("\n");
}

interface EntitlementPath {
  label: string;
  path: string;
  approval_body: string;
  public_hearing: boolean;
  estimated_timeline_weeks: string;
  estimated_cost_range: string;
  risk: string;
  notes: string;
}

function formatEntitlementPaths(data: {
  label: string;
  notes: string;
  paths: Record<string, EntitlementPath>;
  dimensional_variance: EntitlementPath;
}): string {
  const lines: string[] = [];
  lines.push(`# ${data.label}`);
  lines.push(data.notes);

  for (const [code, p] of Object.entries(data.paths)) {
    lines.push(`\n## ${code} — ${p.label}`);
    lines.push(`- Path: ${p.path}`);
    lines.push(`- Approval Body: ${p.approval_body}`);
    lines.push(`- Public Hearing: ${p.public_hearing ? "Yes" : "No"}`);
    lines.push(`- Timeline: ${p.estimated_timeline_weeks} weeks`);
    lines.push(`- Cost: ${p.estimated_cost_range}`);
    lines.push(`- Risk: ${p.risk}`);
    lines.push(`- ${p.notes}`);
  }

  const v = data.dimensional_variance;
  lines.push(`\n## Dimensional Variance`);
  lines.push(`- Approval Body: ${v.approval_body}`);
  lines.push(`- Public Hearing: ${v.public_hearing ? "Yes" : "No"}`);
  lines.push(`- Timeline: ${v.estimated_timeline_weeks} weeks`);
  lines.push(`- Cost: ${v.estimated_cost_range}`);
  lines.push(`- Risk: ${v.risk}`);
  lines.push(`- ${v.notes}`);

  return lines.join("\n");
}

function formatParkingRules(data: Record<string, unknown>): string {
  return `# EBR Chapter 17 Parking & Loading Requirements\n\n${JSON.stringify(data, null, 2)}`;
}

function formatUseRules(data: { label: string; legend: Record<string, string>; uses: Record<string, unknown> }): string {
  const lines: string[] = [];
  lines.push(`# ${data.label}`);
  lines.push(`\n## Permission Legend`);
  for (const [code, desc] of Object.entries(data.legend)) {
    lines.push(`- ${code}: ${desc}`);
  }
  lines.push(`\n## Use Permission Matrix (${Object.keys(data.uses).length} use types)`);

  for (const [useName, districts] of Object.entries(data.uses)) {
    const label = useName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const perms = districts as Record<string, string>;
    const allowed = Object.entries(perms)
      .filter(([, v]) => v !== "N" && v !== "")
      .map(([d, v]) => `${d.toUpperCase()}=${v}`)
      .join(", ");
    if (allowed) {
      lines.push(`- ${label}: ${allowed}`);
    }
  }

  return lines.join("\n");
}

// --- Ingestion ---

async function ingest(
  sourceId: string,
  contentText: string,
  metadata: Record<string, unknown>
): Promise<{ chunks: number } | { error: string }> {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] ${sourceId} — ${contentText.length} chars`);
    return { chunks: Math.ceil(contentText.length / 2000) };
  }

  const resp = await fetch(`${BASE_URL}/api/knowledge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SESSION_COOKIE
        ? { Cookie: `__Secure-authjs.session-token=${SESSION_COOKIE}` }
        : { Authorization: `Bearer ${API_KEY}` }),
    },
    body: JSON.stringify({
      action: "ingest",
      contentType: "agent_analysis",
      sourceId,
      contentText,
      metadata,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { error: `${resp.status} ${body.slice(0, 200)}` };
  }

  const json = (await resp.json()) as { ids?: string[]; chunks?: number };
  return { chunks: json.chunks ?? json.ids?.length ?? 0 };
}

// --- Main ---

async function main() {
  console.log(`Zoning dir: ${ZONING_DIR}`);
  console.log(`Target: ${BASE_URL}/api/knowledge`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  let totalChunks = 0;
  let errors = 0;

  // 1. District files
  const districtFiles = fs.readdirSync(DISTRICTS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`--- ${districtFiles.length} district files ---`);

  for (const file of districtFiles) {
    const data: District = JSON.parse(fs.readFileSync(path.join(DISTRICTS_DIR, file), "utf-8"));
    const text = formatDistrict(data);
    const sourceId = `ebr_zoning:${data.id}`;
    const result = await ingest(sourceId, text, {
      title: `${data.label} (${data.id.toUpperCase()}) — EBR Zoning District`,
      sourceType: "zoning_district",
      district: data.id,
      parish: "East Baton Rouge",
      tags: ["zoning", "district", data.id, data.label],
      sourceAgent: "zoning_import",
    });

    if ("error" in result) {
      console.log(`  ✗ ${file}: ${result.error}`);
      errors++;
    } else {
      console.log(`  ✓ ${file} → ${result.chunks} chunks`);
      totalChunks += result.chunks;
    }
  }

  // 2. Use rules
  console.log(`\n--- use_rules.json ---`);
  const useRulesPath = path.join(ZONING_DIR, "use_rules.json");
  if (fs.existsSync(useRulesPath)) {
    const data = JSON.parse(fs.readFileSync(useRulesPath, "utf-8"));
    const text = formatUseRules(data);
    const result = await ingest("ebr_zoning:use_matrix", text, {
      title: "EBR Complete Use Permission Matrix — Chapter 9",
      sourceType: "use_regulations",
      parish: "East Baton Rouge",
      chapter: "Chapter 9 Tables 9.A-9.J",
      tags: ["zoning", "uses", "permissions", "chapter_9"],
      sourceAgent: "zoning_import",
    });
    if ("error" in result) {
      console.log(`  ✗ use_rules.json: ${result.error}`);
      errors++;
    } else {
      console.log(`  ✓ use_rules.json → ${result.chunks} chunks`);
      totalChunks += result.chunks;
    }
  }

  // 3. Entitlement paths
  console.log(`\n--- entitlement_paths.json ---`);
  const entPath = path.join(ZONING_DIR, "entitlement_paths.json");
  if (fs.existsSync(entPath)) {
    const data = JSON.parse(fs.readFileSync(entPath, "utf-8"));
    const text = formatEntitlementPaths(data);
    const result = await ingest("ebr_zoning:entitlement_paths", text, {
      title: "EBR Entitlement Paths — Costs, Timelines, Approval Bodies",
      sourceType: "entitlement_guide",
      parish: "East Baton Rouge",
      tags: ["zoning", "entitlements", "costs", "timelines", "approval"],
      sourceAgent: "zoning_import",
    });
    if ("error" in result) {
      console.log(`  ✗ entitlement_paths.json: ${result.error}`);
      errors++;
    } else {
      console.log(`  ✓ entitlement_paths.json → ${result.chunks} chunks`);
      totalChunks += result.chunks;
    }
  }

  // 4. Parking rules
  console.log(`\n--- parking_rules.json ---`);
  const parkPath = path.join(ZONING_DIR, "parking_rules.json");
  if (fs.existsSync(parkPath)) {
    const data = JSON.parse(fs.readFileSync(parkPath, "utf-8"));
    const text = formatParkingRules(data);
    const result = await ingest("ebr_zoning:parking_rules", text, {
      title: "EBR Chapter 17 Parking & Loading Requirements",
      sourceType: "parking_standards",
      parish: "East Baton Rouge",
      chapter: "Chapter 17",
      tags: ["zoning", "parking", "loading", "chapter_17"],
      sourceAgent: "zoning_import",
    });
    if ("error" in result) {
      console.log(`  ✗ parking_rules.json: ${result.error}`);
      errors++;
    } else {
      console.log(`  ✓ parking_rules.json → ${result.chunks} chunks`);
      totalChunks += result.chunks;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`Errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

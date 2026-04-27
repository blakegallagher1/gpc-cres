import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const API_ROOT = join(APP_ROOT, "app/api");

const PUBLIC_PREFIXES = [
  "auth/",
  "cron/",
  "health/",
  "public/",
] as const;

const PUBLIC_EXACT = new Set([
  "seller-submissions/route.ts",
  "admin/sentinel-alerts/route.ts",
  "map/tiles/[z]/[x]/[y]/route.ts",
  "map/zoning-tiles/[z]/[x]/[y]/route.ts",
  "map/zoning-tiles/metadata/route.ts",
  "map/flu-tiles/[z]/[x]/[y]/route.ts",
  "map/interchanges-tiles/[z]/[x]/[y]/route.ts",
  "map/ports-tiles/[z]/[x]/[y]/route.ts",
  "map/rail-tiles/[z]/[x]/[y]/route.ts",
  "map/truck-routes-tiles/[z]/[x]/[y]/route.ts",
  "email-webhook/route.ts",
  "webhooks/clerk/route.ts",
]);

const USER_SCOPED_EXACT = new Set([
  "notifications/route.ts",
  "notifications/[id]/route.ts",
  "notifications/mark-all-read/route.ts",
  "notifications/unread-count/route.ts",
]);

const GLOBAL_PROTECTED_EXACT = new Set([
  "market/route.ts",
  "market/building-permits/route.ts",
  "places/autocomplete/route.ts",
  "admin/codex/route.ts",
  "actions/catalog/route.ts",
  "map/ownership-clusters/route.ts",
  "map/ownership-clusters/portfolio/route.ts",
  "workflows/templates/route.ts",
]);

const PASS_THROUGH_AUTH_EXACT = new Set([
  "deals/route.ts",
]);

const FORBIDDEN_CLIENT_ORG_PATTERNS = [
  /searchParams\.get\(["']orgId["']\)/,
  /params\.get\(["']orgId["']\)/,
  /headers\.get\(["']x-gpc-org-id["']\)/,
  /headers\.get\(["']x-agent-org-id["']\)/,
];

function getRouteFiles(): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (entry === "route.ts") {
        results.push(relative(API_ROOT, absolute));
      }
    }
  }

  walk(API_ROOT);
  return results.sort();
}

function routeContent(routePath: string): string {
  return readFileSync(join(API_ROOT, routePath), "utf8");
}

function hasAuthHelper(source: string): boolean {
  return source.includes("resolveAuth") || source.includes("authorizeApiRoute");
}

function isPublicOrServiceRoute(routePath: string): boolean {
  return (
    PUBLIC_EXACT.has(routePath) ||
    PUBLIC_PREFIXES.some((prefix) => routePath.startsWith(prefix))
  );
}

function usesServerDerivedOrgScope(source: string): boolean {
  return /\borgId\b/.test(source) || /authorization\.auth/.test(source);
}

describe("API route auth inventory", () => {
  it("classifies every route under an explicit access model", () => {
    const unclassified: string[] = [];

    for (const routePath of getRouteFiles()) {
      const source = routeContent(routePath);

      if (isPublicOrServiceRoute(routePath)) {
        continue;
      }

      if (USER_SCOPED_EXACT.has(routePath) || GLOBAL_PROTECTED_EXACT.has(routePath)) {
        expect(hasAuthHelper(source)).toBe(true);
        continue;
      }

      if (PASS_THROUGH_AUTH_EXACT.has(routePath)) {
        expect(hasAuthHelper(source)).toBe(true);
        expect(source).toMatch(/\blistDeals\(auth\b|\bcreateDeal\(auth\b|\bbulkUpdateDeals\(auth\b/);
        continue;
      }

      if (hasAuthHelper(source) && usesServerDerivedOrgScope(source)) {
        continue;
      }

      unclassified.push(routePath);
    }

    expect(unclassified).toEqual([]);
  });

  it("does not trust client-provided org identifiers in protected routes", () => {
    const offenders: Array<{ route: string; pattern: string }> = [];

    for (const routePath of getRouteFiles()) {
      if (isPublicOrServiceRoute(routePath)) {
        continue;
      }

      const source = routeContent(routePath);
      if (!hasAuthHelper(source)) {
        continue;
      }

      for (const pattern of FORBIDDEN_CLIENT_ORG_PATTERNS) {
        if (pattern.test(source)) {
          offenders.push({ route: routePath, pattern: String(pattern) });
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the inventory expectations easy to review in failures", () => {
    const files = getRouteFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(relative(APP_ROOT, API_ROOT)).toBe("app/api");
  });
});

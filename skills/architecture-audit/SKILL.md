***
name: architecture-audit
version: "2.0"
description: |
  Use when: Changes touch imports, package boundaries, shared schema ownership, API/server layer separation, or infra runtime boundaries.
  Use for: Any PR review, cross-package refactor, or on-demand architecture guardrail check.
  Don't use when: Changes are purely cosmetic (CSS/copy), docs-only, or test-only within a single package.
  Outputs: Structured JSON violation report with severity, location, and merge/block recommendation.
***

# Skill: Architecture Audit — Gallagher-Cres Dependency Layering Guardrail

## Purpose
Detect dependency-layer violations in the `gallagher-cres` TypeScript monorepo before merge.
Architecture correctness is enforced **before** feature correctness. If a CRITICAL or HIGH
violation exists, block the merge until fixed.

## One-time context preload
Before auditing, load:
1. `AGENTS.md` — "Dependency Flow Rules (STRICT)" section (lines ~63-81)
2. `.agents/layer-rules.toml` — machine-readable layer definitions
3. The current PR file list: `git diff --name-only origin/main...HEAD`

## Layer Model (source of truth)

```
L0: packages/shared              — Foundation. ZERO internal package imports.
L1: packages/db                  — Prisma client. Must NOT import L2+ or apps/.
L2: packages/evidence            — Domain libraries.
    packages/artifacts
L3: packages/openai              — Agents, tools, Responses API.
    packages/server              — Server-side services (@gpc/server).
    packages/gateway-client      — CF Worker gateway proxy client.
L4: apps/web                     — Next.js frontend (Vercel).
L5: infra/cloudflare-agent       — CF Workers + Durable Objects.
    infra/gateway-proxy          — CF Worker edge proxy.
    infra/cua-worker             — Node.js + Playwright browser automation.
    infra/local-api              — FastAPI gateway (Python, Windows PC Docker).
    infra/admin-dashboard        — CF Pages admin UI.
--: apps/worker                  — PARKED, not built in CI. Skip.
--: legacy/python/               — PARKED reference code. Skip.
```

**Import direction rule:** Higher layer numbers may import lower. Never the reverse.
`L4 → L3 → L2 → L1 → L0` is valid. `L1 → L3` is a CRITICAL violation.

**L5 is special:** Infrastructure directories are **separate runtimes**. They do NOT
import from `packages/` or `apps/`. They communicate via HTTP, WebSocket, or TCP only.

## Procedure

### Step 1: Scope changed files
```bash
git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx|mts|js|jsx)$' | grep -v -E 'node_modules|\.next|dist|build|coverage'
```
If the diff includes files from PARKED directories (`apps/worker`, `legacy/python`), skip them.

### Step 2: Extract import edges
```bash
rg "^import |from ['\"]|require\(" --include="*.ts" --include="*.tsx" --include="*.js" <changed_files>
```
For dynamic `import()`, flag for manual review — static grep misses runtime imports.

### Step 3: Classify each file by layer

| Path pattern | Layer |
|-------------|-------|
| `packages/shared/*` | L0 |
| `packages/db/*` | L1 |
| `packages/evidence/*`, `packages/artifacts/*` | L2 |
| `packages/openai/*`, `packages/server/*`, `packages/gateway-client/*` | L3 |
| `apps/web/*` | L4 |
| `infra/*` | L5 |
| `scripts/*`, `skills/*` | Utility (exempt from layer rules) |

### Step 4: Detect violations

| Severity | Condition |
|----------|-----------|
| **CRITICAL** | Lower layer imports higher layer (reverse dependency) |
| **CRITICAL** | `packages/db` imports from `packages/openai`, `packages/evidence`, `packages/artifacts`, `packages/server`, or `apps/web` |
| **HIGH** | Circular dependency between any two packages |
| **HIGH** | `infra/` directory imports from `packages/` or `apps/` (runtime boundary violation) |
| **HIGH** | `packages/shared` imports any internal package |
| **MEDIUM** | `packages/db/prisma/migrations/` modified outside migration workflow |
| **MEDIUM** | `apps/web/lib/server/` or `apps/web/lib/auth/` missing `import "server-only"` |
| **LOW** | Zod schema uses `.optional()` instead of `.nullable()` in OpenAI tool params |
| **LOW** | Zod schema uses `.url()` or `.email()` validators (OpenAI rejects `format:` constraints) |

### Step 5: Gallagher-cres specific checks

**Package boundary:**
- [ ] `packages/shared` has ZERO internal package imports
- [ ] `packages/db` does NOT import from `apps/web`, `packages/openai`, `packages/evidence`, `packages/artifacts`, or `packages/server`
- [ ] `packages/openai` does NOT import from `apps/web`
- [ ] No circular dependencies between any `packages/` directories

**Infrastructure boundary:**
- [ ] `infra/local-api/` (Python) communicates with `apps/web` ONLY via HTTP
- [ ] `infra/cua-worker/` (Node.js) communicates with `apps/web` ONLY via HTTP
- [ ] `infra/cloudflare-agent/` communicates with `apps/web` ONLY via WebSocket
- [ ] No `infra/` file imports from `@entitlement-os/*` or `@gpc/*` packages

**Server-only enforcement:**
- [ ] `apps/web/lib/server/*.ts` files include `import "server-only"`
- [ ] `apps/web/lib/auth/resolveAuth.ts` includes `import "server-only"`
- [ ] No `NEXT_PUBLIC_` prefix on server-side secrets

**OpenAI schema constraints:**
- [ ] Zod tool parameter schemas use `.nullable()` not `.optional()`
- [ ] No `.url()` or `.email()` Zod validators in tool schemas
- [ ] Agent tools wired in `createConfiguredCoordinator()`, not on module-level exports

**Environment variable correctness:**
- [ ] `GATEWAY_DATABASE_URL` points to `https://api.gallagherpropco.com` (NOT `gateway.` or `agents.`)
- [ ] No hardcoded API keys, tokens, or secrets in committed code

### Step 6: Build dependency graph (for circular detection)
```bash
# Quick package-level graph from workspace imports
rg "from ['\"]@entitlement-os/|from ['\"]@gpc/" --include="*.ts" --include="*.tsx" -l | \
  while read f; do
    pkg=$(echo "$f" | sed 's|/src/.*||')
    imports=$(rg "from ['\"]@entitlement-os/|from ['\"]@gpc/" "$f" -o | sed "s/from ['\"]//;s/['\"]//")
    echo "$pkg -> $imports"
  done | sort -u
```
If any cycle exists (A→B→A or A→B→C→A), mark HIGH.

## Output contract

```json
{
  "project": "gallagher-cres",
  "status": "PASS | FAIL",
  "auditDate": "2026-03-26",
  "summary": {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "violations": [
    {
      "severity": "CRITICAL",
      "file": "packages/db/src/client.ts",
      "lineHint": 42,
      "fromLayer": "L1",
      "toLayer": "L4",
      "import": "@entitlement-os/openai",
      "reason": "packages/db must not import L3 packages",
      "remediation": "Move shared types to packages/shared, import from there"
    }
  ],
  "decisions": {
    "can_merge": true,
    "gates_passed": ["pnpm lint", "pnpm typecheck", "pnpm test"],
    "gates_required": ["pnpm build"]
  }
}
```

**Merge decision:**
- `CRITICAL` or `HIGH` → `status: FAIL`, `can_merge: false`
- `MEDIUM` only → `status: PASS` with warnings, `can_merge: true`
- `LOW` only → `status: PASS`, `can_merge: true`

## Remediation heuristics

| Problem | Fix |
|---------|-----|
| Reverse dependency (L1→L3) | Move shared types to `packages/shared` (L0) |
| Circular dependency | Extract interface to lower layer, depend on abstraction |
| `infra/` imports `packages/` | Duplicate needed types locally, or call via HTTP |
| Missing `server-only` | Add `import "server-only"` at top of file |
| `.optional()` in tool schema | Change to `.nullable()` |
| `.url()` / `.email()` in tool schema | Change to `.string()` |

## Required verification sequence

Before marking PASS on non-trivial code changes:
1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build` (if touching package exports or build config)

## Output style

- Lead with `PASS` or `FAIL`
- Top 10 most severe violations if volume is high
- Exact file paths and line hints
- Actionable remediation per violation
- No prose filler — structured data first, explanation second

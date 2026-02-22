"""
Entitlement OS Repository Guidelines (v4)

Entitlement OS is an automation-first operating system for a repeatable
entitlement-flip business in the Baton Rouge region.

Authoritative architecture spec:
- docs/SPEC.md

This AGENTS.md governs Codex behavior in this repository.

Design goals:
- Act autonomously within security boundaries.
- Infer intent and execute without unnecessary confirmation.
- Leverage automation at every opportunity.
- Enforce org-scoped data discipline.
- Minimize round-trips with the operator.
"""

# =========================================================

Last reviewed: 2026-02-21

# ✅ PROJECT STATUS SNAPSHOT (2026-02-19)
# =========================================================

Current implementation status against `Entitlement_OS_Meta_Prompt.md`:

- Phases `A` through `G` are completed and integrated.
- Phase `H` verification gate completed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
- Security hardening pass completed across tenant isolation, org scoping, map XSS sanitization, auth consistency, and error normalization.
- Both databases run on local PostgreSQL via Docker Compose. Application DB (`entitlement_os`, port 54323) managed by Prisma. Property DB (`cres_db`) on Windows 11 backend served via FastAPI gateway + Martin tiles.
- Property DB spatial data migrated from Supabase to local PostGIS. Migration tooling preserved in `scripts/migrate_supabase_to_local/`.
- Env initialization paths enforce fail-fast behavior for missing/placeholder credentials.
- Formal compliance evidence is captured in:
  - `docs/ENTITLEMENT_OS_META_AUDIT_2026-02-17.md`
  - `ROADMAP.md` item `EOS-001`

When planning follow-on work, treat A→G baseline as complete and prioritize net-new scope only.

# =========================================================
# 🚨 CAOA BOOTSTRAP — DEPRECATED
# =========================================================

Legacy CAOA SYNC REPORT bootstrap is permanently disabled.
Do not emit sync reports, scan the repo, fingerprint files, or traverse docs/ on session start.
Exception: explicit compliance-audit or CI-audit instructions.

---

# =========================================================
# 1️⃣ EXECUTION MODEL (ACT-FIRST — AUTHORITATIVE)
# =========================================================

Codex operates in **act-first** mode. When the operator's intent is
clear — implement, fix, refactor, deploy, test — proceed immediately.
Do not ask for confirmation unless the action is destructive or ambiguous.

## Intent Inference Rules

| Operator signal | Codex action |
|---|---|
| "Add X" / "Implement Y" / "Fix Z" / "Update W" | Execute mutation → verify → PR → merge |
| "What does X do?" / "Explain Y" / "Review Z" | Read-only analysis |
| Ambiguous or high-risk (drop table, delete data, force-push) | Clarify once, then act |
| ROADMAP item ID provided | Implement that item end-to-end |
| Bug report or error paste | Diagnose → fix → verify → PR → merge |
| Multiple tasks (numbered/comma-separated) | Execute sequentially through full pipeline |

**No separate "analysis mode" or "mutation mode" gates.** Intent is inferred
from the operator's message. If the message implies a change, make the change.

## Execution Constraints (always apply regardless of intent)
- Security invariants (§5) override all other behavior.
- Org-scoping is non-negotiable.
- ROADMAP-first protocol gates new feature work.
- Mandatory Verification Protocol gates every mutation before merge.

## Speed Discipline
- Do not scan the entire repo unless the task requires it.
- Do not read files speculatively — read only what the task demands.
- Do not inspect git state unless needed for the current operation.
- Minimize round-trips: batch related changes, chain dependent steps.
- Default to direct answer for questions; default to direct action for tasks.

---

# =========================================================
# 2️⃣ DECISION AUTHORITY MATRIX
# =========================================================

Three tiers govern what Codex may do without asking.

### Tier 1 — Full Autonomy (act without asking)
- Create / switch / delete `codex/*` feature branches
- Run lint, typecheck, test, build
- Fix lint errors, type errors, and test failures caused by own changes
- Stage, commit, push to `codex/*` branches
- Create PRs against main, enable auto-merge (squash)
- Monitor CI checks, diagnose and fix failures, re-push
- Close stale `codex/*` PRs and delete merged `codex/*` branches
- Select and invoke skills from `.codex/skills/` and `~/.codex/skills/`
- Read any file needed for the current task
- Write / edit files to implement the requested task
- Install / upgrade dependencies when required by the task
- Generate and run database migrations for schema changes (review SQL first)
- Run all `pnpm` commands (install, dev, build, lint, test, typecheck, db:*)
- Create GitHub issues to track follow-up work discovered during implementation
- Rebase `codex/*` branches on main to resolve conflicts
- Re-run failed CI jobs

### Tier 2 — Act then Report (do it, tell the operator afterward)
- Refactor code adjacent to the requested change when it measurably reduces complexity
- Add tests for untested code you modified
- Update `ROADMAP.md` status after completing a roadmap item
- Fix pre-existing lint / type errors in files you touched
- Optimize queries or remove dead code in files you touched
- Create a GitHub issue for a bug or tech debt item discovered during work

### Tier 3 — Clarify First (ask before acting)
- Any operation on `main` branch directly (force-push, reset, rebase)
- Dropping database tables or columns with existing data
- Deleting files not created in the current session
- Changing security invariants, auth middleware, or org-scoping logic
- Modifying branch protection rules or GitHub Actions secrets
- Any destructive or irreversible action not covered by Tier 1 or Tier 2

---

# =========================================================
# 3️⃣ AUTOMATION LEVERAGE PATTERNS
# =========================================================

These patterns are standing orders. Use them proactively,
not only when explicitly asked.

## A) End-to-End Mutation Pipeline

When the task is clear, execute the full pipeline in one shot:

1. Implement the change
2. Run verification (lint → typecheck → test → build)
3. Self-repair any failures from step 2
4. Diff review
5. Branch → commit → push → PR → auto-merge → monitor → confirm merge

Do NOT pause between steps to ask the operator. The pipeline runs
autonomously until either (a) all checks pass and PR merges, or
(b) a Tier 3 decision requires clarification.

## B) Self-Healing Loop

When verification or CI fails:

1. Read the error output.
2. Identify root cause.
3. Fix the code.
4. Re-run the failing step.
5. Repeat up to 3 cycles per step.
6. If still failing after 3 attempts, report the exact error with diagnosis.

Never report a failure without attempting to fix it first.

## C) Batch Operations

When a task touches multiple files or components:

- Identify all affected files upfront.
- Apply changes in a single coherent pass.
- Run verification once at the end, not per-file.
- Commit as a single atomic unit unless changes are logically separable.

## D) Proactive Skill Selection

When a task matches an available skill in `.codex/skills/` or `~/.codex/skills/`:

- Load and follow the skill automatically.
- Do not ask "should I use the X skill?" — just use it.
- If multiple skills apply, compose them.

## E) CI Failure Auto-Fix

When CI checks fail on a `codex/*` PR:

1. Pull failure logs via `gh run view <id> --log-failed`.
2. Diagnose the failure.
3. Push a fix to the same branch.
4. Continue monitoring until green or 3 fix cycles exhausted.

This loop runs autonomously — do not ask the operator to check CI.

## F) Chained Task Execution

When the operator provides multiple tasks:

- Execute them sequentially, each through the full pipeline.
- Carry context forward — later tasks may depend on earlier ones.
- Commit each task separately if logically independent.
- Report aggregate results at the end, not after each individual task.

## G) Proactive Issue Creation

When you discover a bug, tech debt, or missing test coverage while working:

- Fix it if it falls within Tier 1 or Tier 2.
- If out of scope for the current task, create a GitHub issue with:
  - Clear title and reproduction steps
  - Severity estimate
  - Suggested fix approach
- Link the issue in your PR description under a "Discovered Issues" section.

## H) Context Bootstrapping

At session start for a mutation task:

1. Read only the files directly relevant to the task.
2. If the task references a ROADMAP item, read `ROADMAP.md` for that item only.
3. If the task touches an area with a matching skill, load that skill.
4. Do not pre-read docs/, do not scan the repo, do not inspect git history.
5. Begin implementation immediately after reading necessary context.

---

# =========================================================
# 4️⃣ REPO STRUCTURE (AUTHORITATIVE)
# =========================================================

pnpm workspaces monorepo:

- apps/web/ — Next.js App Router (UI + API)
- apps/worker/ — Temporal worker (Node/TS)
- packages/db/ — Prisma schema + client
- packages/shared/ — Zod schemas + validators
- packages/openai/ — Responses API wrapper (strict JSON schema)
- packages/evidence/ — evidence fetch/hash/extract
- packages/artifacts/ — PPTX/PDF generators
- infra/docker/ — Docker Compose: application PostgreSQL (port 54323) + Temporal stack
- scripts/migrate_supabase_to_local/ — Supabase → local PostGIS migration tooling
- legacy/python/ — deprecated reference only

Never modify legacy/python unless explicitly instructed.

---

# =========================================================
# 4½ DATABASE ARCHITECTURE (LOCAL — AUTHORITATIVE)
# =========================================================

Both databases are self-hosted PostgreSQL. No managed database services.

## Application Database (`entitlement_os`)
- **Engine:** pgvector/pgvector:pg16 (Docker Compose, `infra/docker/docker-compose.yml`)
- **Port:** 54323 (host) → 5432 (container)
- **ORM:** Prisma — schema at `packages/db/prisma/schema.prisma`
- **Env:** `DATABASE_URL`, `DIRECT_DATABASE_URL`
- **Contents:** 18 Prisma models — Org, User, Deal, Parcel, Task, Artifact, Buyer, Conversation, etc.
- **Migrations:** Prisma Migrate (`pnpm db:migrate`)
- **Extensions:** pgvector (for future embedding search)

## Property Database (`cres_db`)
- **Engine:** PostGIS 16-3.4 (Docker Compose on Windows 11 backend)
- **Port:** 5432 on backend host
- **Access:** FastAPI gateway (`api.gallagherpropco.com`) + Martin tiles (`tiles.gallagherpropco.com`) via Cloudflare Tunnel
- **Contents:** 560K parcels (5 parishes), EPA facilities, FEMA flood zones, soils, wetlands, traffic counts, LDEQ permits
- **Extensions:** PostGIS, materialized views (`mv_parcel_intelligence`), RPC functions (`get_parcel_mvt`)
- **Auth:** Bearer token (`GATEWAY_API_KEY`) for all gateway endpoints

## Connection Rules
- Application code (Next.js API routes, Prisma) connects to application DB via `DATABASE_URL`.
- Property lookups route through the FastAPI gateway via `LOCAL_API_URL` + `LOCAL_API_KEY` — never direct DB connections from Vercel.
- Both DBs are backed up independently. Application DB via Prisma seed + migrations. Property DB via the migration script in `scripts/migrate_supabase_to_local/`.

---

# =========================================================
# 5️⃣ SECURITY INVARIANTS (NON-NEGOTIABLE)
# =========================================================

All DB rows are scoped by org_id.

Every API route must:
1. Authenticate the user session.
2. Confirm org membership.
3. Scope all queries by org_id.

File storage:
- Private buckets only.
- Access via signed URLs only.

Secrets:
- Never committed.
- Server-side only.
- Never expose database credentials or API keys to client.

OpenAI API key:
- Server-only usage.

Violation of these rules is not allowed.
These invariants are Tier 3 — changes require explicit operator approval.

---

# =========================================================
# 6️⃣ CITATION & EVIDENCE DISCIPLINE
# =========================================================

- All AI outputs affecting business decisions must pass strict schema validation.
- Citation completeness must be enforced server-side.
- Fail closed on schema violations.
- Evidence hashing must remain deterministic.
- Artifact generation must remain idempotent via runs.input_hash.

Never weaken validators for convenience.

---

# =========================================================
# 7️⃣ OPENAI USAGE CONTRACT
# =========================================================

All AI calls must:

- Use packages/openai wrapper.
- Enforce strict JSON Schema outputs.
- Validate with Zod before acceptance.
- Log telemetry where applicable.
- Fail closed on malformed output.
- Never silently parse loose JSON.

Migration toward unified Responses API surface is preferred.

Do not reintroduce legacy chat.completions patterns.

---

# =========================================================
# 8️⃣ TEMPORAL WORKER DISCIPLINE
# =========================================================

Worker flows must:

- Be idempotent.
- Be replay-safe.
- Avoid non-deterministic side effects.
- Enforce org scoping.
- Respect autonomy guardrails.
- Maintain explicit retry ceilings.
- Maintain explicit cost ceilings.

Durable execution must not introduce silent drift.

---

# =========================================================
# 9️⃣ DEVELOPMENT COMMANDS & ROADMAP PROTOCOL
# =========================================================

Run from repo root:

- pnpm install
- pnpm dev
- pnpm build
- pnpm lint
- pnpm typecheck
- pnpm test

Database (local PostgreSQL):

- pnpm db:migrate
- pnpm db:deploy
- pnpm db:seed
- Application DB: `entitlement_os` on port 54323 (`infra/docker/docker-compose.yml`)
- Property DB: `cres_db` on Windows 11 backend (`C:\gpc-cres-backend\docker-compose.yml`)
- `DATABASE_URL` must point to local application PostgreSQL
- `DIRECT_DATABASE_URL` for Prisma migrations (bypasses connection pooler if used)

Local infra:

- docker compose -f infra/docker/docker-compose.yml up -d
- Starts application PostgreSQL (pgvector/pgvector:pg16) + Temporal + Temporal UI

Temporal UI:

- http://localhost:8080

Never run destructive commands without explicit instruction (Tier 3).

## ROADMAP-FIRST IMPLEMENTATION PROTOCOL (MANDATORY)

Before any implementation work in this repository:

1. Read and follow `ROADMAP.md` as the single source of truth.
2. Only implement items with status `Planned` (or an equivalent active status) and valid `ROADMAP item id`.
3. Do not add new implementation items without the pre-add analysis check:
   - Problem to solve
   - Expected outcome + measurable success signal
   - Evidence this is needed
   - Alignment to existing architecture/security constraints
   - Complexity/risk + rollback path
   - Concrete acceptance criteria + test plan
4. If an item is speculative or low-value, mark it as `Deferred` with explicit reason and revisit later; do not implement it silently.
5. When you finish an item, mark it `Done` in `ROADMAP.md` with evidence references (tests, logs, migration IDs, files touched).

Both Codex and CLAUDE sessions treat `ROADMAP.md` as the planning gate.

---

# =========================================================
# 🔟 TESTING RULES
# =========================================================

Unit tests:

- Live alongside packages.
- Must mock external APIs.
- No live network calls.

Required coverage areas:

- Schema validation
- Citation enforcement
- Evidence hashing
- Idempotency
- Change detection

Integration tests must not auto-run unless explicitly invoked.

---

# =========================================================
# 11 TEST COVERAGE MANDATE
# =========================================================

When modifying any API route handler or automation loop:

1. **Existing tests must still pass** — run the relevant test suite before
   and after your change.
2. **New/modified handlers require tests** — if you touch a handler that has
   no tests, write at minimum:
   - Auth rejection (401)
   - Org scope rejection (403)
   - Input validation (bad payload → 400)
   - Happy path (200)
   - Idempotency (if applicable)
3. **Coverage check** — after writing tests, verify they actually run:
   ```
   pnpm test -- --reporter=verbose 2>&1 | grep -E '(PASS|FAIL|✓|✗)'
   ```
4. **No test? No merge.** — the Mandatory Verification Protocol will catch
   untested handlers during the build gate. Do not skip this.

---

# =========================================================
# 12 ERROR HANDLING PATTERN
# =========================================================

All error handling in Entitlement OS follows a consistent pattern:

## API Route Errors
```typescript
import { NextResponse } from "next/server";
import { ZodError } from "zod";

try {
  const validated = InputSchema.parse(body);
  // ... logic
} catch (err) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.flatten().fieldErrors },
      { status: 400 }
    );
  }
  console.error("[route-name]", err);
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
```

## Rules
- Never swallow errors silently
- Always log errors with a route/function identifier prefix
- Zod validation errors return 400 with field-level details
- Auth errors return 401/403 with generic messages (no info leak)
- Unexpected errors return 500 with generic message, log full error server-side
- Never expose stack traces or internal details to the client
- Temporal activities: throw `ApplicationFailure` with a typed error code

---

# =========================================================
# 13 MIGRATION SAFETY RULES
# =========================================================

Database migrations (Prisma) must follow these safety rules:

## Before Creating a Migration
1. **Backup awareness** — confirm the migration is reversible or document why not.
2. **Check for data loss** — dropping columns, tables, or changing types can
   destroy data. Always:
   - Add new columns as nullable first
   - Backfill data
   - Then add NOT NULL constraint in a follow-up migration
3. **Index impact** — adding indexes on large tables can lock the table.
   Use `CREATE INDEX CONCURRENTLY` when possible (via raw SQL migration).

## Migration Workflow
```
# Generate migration (do NOT apply)
pnpm db:migrate --create-only

# Review the generated SQL
cat packages/db/prisma/migrations/<timestamp>_<name>/migration.sql

# Apply after review
pnpm db:migrate

# Verify
pnpm db:generate
pnpm typecheck
```

## Rules
- Never use `prisma db push` in production or against shared databases
- Never use `prisma migrate reset` unless explicitly instructed
- Always review generated SQL before applying
- Two-phase migrations for destructive changes (add nullable → backfill → constrain)
- Test migrations against seed data before pushing

---

# =========================================================
# MANDATORY VERIFICATION PROTOCOL (MVP)
# =========================================================

Every mutation task MUST complete the following verification
gate BEFORE reporting success or moving to the next task.

## Verification Sequence (run in order)

1. **Lint** — `pnpm lint`
   - All ESLint rules must pass with zero errors.
   - Warnings are acceptable only if pre-existing.

2. **Type Check** — `pnpm typecheck`
   - Strict-mode TypeScript must compile with zero errors.
   - Never use `@ts-ignore` or `any` to silence new errors.

3. **Unit Tests** — `pnpm test`
   - All existing tests must pass.
   - If you modified logic covered by tests, confirm the relevant
     suite still passes.
   - If you added new exported functions or tools, write at least
     one test per function and confirm it passes.

4. **Build** — `pnpm build`
   - Full monorepo build must succeed.
   - If build fails on missing env vars (e.g., database URL),
     provide stub env vars for the build step only:
     ```
     DATABASE_URL=postgresql://postgres:postgres@localhost:54323/entitlement_os \
     OPENAI_API_KEY=placeholder \
     pnpm build
     ```
   - Build failures caused by YOUR changes are blockers.
     Fix them before proceeding.
   - Build failures caused by pre-existing env/infra issues
     should be noted but are not blockers.

5. **Diff Review** — `git diff --stat && git diff`
   - Review your own diff before committing.
   - Confirm no unintended file changes, no leftover debug code,
     no secrets, no unrelated refactors.

## Failure Protocol

- If ANY step fails due to your changes: enter the Self-Healing Loop (§3B).
- Do NOT skip verification steps.
- Do NOT report success until all 5 steps pass.
- If you cannot fix a failure after 3 attempts, STOP and report the exact error
  to the operator with your diagnosis.

## Commit Gate (AUTO-EXECUTE — FULL AUTONOMY)

Once all 5 verification steps pass, AUTOMATICALLY execute the
full pipeline below. Do NOT stop and wait for operator confirmation
at ANY step. The task is NOT complete until the PR is merged to main.

### Step 1: Branch + Commit + Push
1. Create a short-lived feature branch from main:
   `git checkout -b codex/<short-descriptive-name>`
2. Stage only the files you intentionally changed.
3. Commit with a clear imperative message.
4. Push the feature branch:
   `git push -u origin codex/<branch-name>`

### Step 2: Create PR + Enable Auto-Merge
5. Create a pull request against main:
   `gh pr create --title "<imperative summary>" --body "<what changed and why>"`
6. Immediately enable auto-merge (squash) on the PR:
   `gh pr merge --auto --squash`

### Step 3: Monitor Checks Until Resolution
7. Poll check status until all checks complete:
   `gh pr checks --watch`
8. If ALL checks pass → auto-merge fires. Confirm merge completed:
   `gh pr view --json state,mergeCommit`
   Report the merge commit hash.
9. If ANY check fails:
   a. Read the failing check logs: `gh run view <run-id> --log-failed`
   b. Diagnose and fix the failure on the same branch.
   c. Re-run verification locally.
   d. Commit the fix, push to the same branch.
   e. Return to step 7.
   f. Repeat until all checks pass and PR merges (max 3 fix cycles).
10. After merge, clean up:
    `git push origin --delete codex/<branch-name>`
    `git checkout main && git pull origin main`

### Completion Criteria
The task is DONE only when:
- The PR has been merged to main (state = MERGED)
- You have reported: PR URL, merge commit hash, files included

Do NOT report success after just creating the PR.
Do NOT stop and ask the operator to check on CI.
Do NOT leave a PR open and unmonitored.
The full cycle — commit → PR → checks pass → merge — is YOUR responsibility.

## Scope

This protocol applies to ALL mutation work including but not limited to:
- Feature implementation
- Bug fixes
- Dependency upgrades
- Migration tasks (CSS, DB, API, etc.)
- Refactors
- Config changes that affect build output

---

# =========================================================
# 🔧 GITHUB OPERATIONS (FULL AUTONOMY)
# =========================================================

Codex has full `gh` CLI access via `GH_TOKEN` and is authorized to
manage all GitHub operations for this repository autonomously.

## Permissions Available
The token has scopes: `repo`, `workflow`, `gist`, `read:org` (and broader).
Codex may use ANY `gh` subcommand without asking for permission.

## Branch Management
- Create feature branches: `codex/<descriptive-name>`
- Push branches to origin
- Delete merged branches: `git push origin --delete <branch>`
- Rebase or update branches as needed to resolve conflicts
- Force-push ONLY to `codex/*` branches, NEVER to `main`

## Pull Requests
- Create PRs: `gh pr create`
- Enable auto-merge: `gh pr merge --auto --squash`
- Add labels: `gh pr edit --add-label <label>`
- Add reviewers if configured: `gh pr edit --add-reviewer <user>`
- Close stale PRs: `gh pr close <number>`
- Monitor checks: `gh pr checks --watch`
- View PR details: `gh pr view`
- Comment on PRs: `gh pr comment`

## Issues
- Create issues: `gh issue create`
- Close issues: `gh issue close <number>`
- Add labels: `gh issue edit --add-label <label>`
- Comment on issues: `gh issue comment`
- List/search issues: `gh issue list`
- Link PRs to issues via commit messages or PR body (`Closes #<number>`)

## CI / Workflow Runs
- List runs: `gh run list`
- View run details: `gh run view <run-id>`
- Read failure logs: `gh run view <run-id> --log-failed`
- Re-run failed jobs: `gh run rerun <run-id> --failed`
- Cancel runs: `gh run cancel <run-id>`
- Watch runs: `gh run watch <run-id>`

## Releases (when instructed)
- Create releases: `gh release create`
- Upload assets: `gh release upload`
- List releases: `gh release list`

## GitHub API (advanced)
- Use `gh api` for anything not covered by dedicated subcommands
- Example: `gh api repos/{owner}/{repo}/actions/workflows`
- Example: `gh api repos/{owner}/{repo}/branches/main/protection`

## Rules
- NEVER force-push to `main`
- NEVER delete `main` or any protected branch
- NEVER modify branch protection rules
- NEVER create or modify GitHub Actions secrets (use env vars from shell)
- All branch operations on `codex/*` branches are fair game
- Always clean up `codex/*` branches after merge
- When fixing CI failures, push fixes to the SAME PR branch — do not create new PRs
- If a PR has merge conflicts with main, rebase the branch:
  `git fetch origin main && git rebase origin/main && git push --force-with-lease`

---

# =========================================================
# 14 LEGACY PYTHON
# =========================================================

legacy/python/ is preserved for reference only.

Do not delete.
Do not refactor.
Do not migrate unless explicitly requested.

---

# =========================================================
# 15 PROD MAP / PARCEL OPERATIONS ADDENDUM (2026-02-19)
# =========================================================

- For map and prospecting incidents, treat these as first-line smoke checks:
  - `GET /api/parcels?hasCoords=true`
  - `GET /api/parcels?hasCoords=true&search=<address>`
  - `POST /api/external/chatgpt-apps/parcel-geometry`
- If parcel points render but polygons do not, verify geometry fallback path executes in this order:
  1. direct geometry lookup
  2. address-normalized lookup
  3. RPC fallback `rpc_get_parcel_geometry`
- Do not expose raw Prisma or infrastructure errors to client responses. Return generic 4xx/5xx payloads and log internal details server-side.
- Server-side parcel DB access routes through local Docker Compose stack via single Cloudflare Tunnel:
  - **Tile operations** (vector tiles): `tiles.gallagherpropco.com` → martin:3000
  - **Data/tools operations** (parcel search, memory): `api.gallagherpropco.com` → gateway:8000
  - Both use `LOCAL_API_URL` + `LOCAL_API_KEY` for service-to-service auth (Bearer token, single GATEWAY_API_KEY)
  - Backend: Docker Compose at `C:\gpc-cres-backend\docker-compose.yml` — PostgreSQL (`cres_db`) + Martin (MVT) + Qdrant (vector search)
  - Tool-safe endpoints follow `/tools/<resource>.<action>` pattern (e.g., `/tools/parcel.bbox`, `/tools/parcel.lookup`)
  - Cloudflare Tunnel ingress rules managed in dashboard (not local config file)
- Production deploys using Vercel CLI should prefer archive mode for this repo size:
  - `vercel --prod --yes --archive=tgz`
- When PR automation is required, use standard PR flow from a fresh execution context if prior context blocks `gh pr create` policy checks.
- Keep `main` as source of truth; after merge, sync local main and remove temporary branches.

---

# =========================================================
# ✅ DEFAULT BEHAVIOR SUMMARY
# =========================================================

If uncertain about **intent**:
- Task implies a change → act on the most likely interpretation, note assumptions in PR.
- Pure question with no implementation ask → read-only analysis.
- Genuinely ambiguous → clarify once, then act.

If uncertain about **scope**:
- Keep changes minimal and focused.
- Fix adjacent issues in files you touched (Tier 2).
- Create GitHub issues for out-of-scope problems you discover (Tier 2).

**Standing priorities (in order):**
1. Security and org-scoping (never compromised)
2. Correctness (verification protocol must pass)
3. Autonomy (minimize operator round-trips)
4. Speed (batch work, chain steps, avoid speculative reads)

The goal is: operator states intent once → Codex delivers a merged PR.

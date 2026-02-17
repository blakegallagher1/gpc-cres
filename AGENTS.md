"""
Entitlement OS Repository Guidelines (v3)

Entitlement OS is an automation-first operating system for a repeatable
entitlement-flip business in the Baton Rouge region.

Authoritative architecture spec:
- docs/SPEC.md

This AGENTS.md governs Codex behavior in this repository.

Design goals:
- Preserve security invariants.
- Enforce org-scoped data discipline.
- Support controlled autonomy.
- Eliminate legacy CAOA bootstrap behavior.
- Maintain speed for interactive usage.
- Enforce mutation rigor only when explicitly required.
"""

# =========================================================
# ✅ PROJECT STATUS SNAPSHOT (2026-02-17)
# =========================================================

Current implementation status against `Entitlement_OS_Meta_Prompt.md`:

- Phases `A` through `G` are completed and integrated.
- Phase `H` verification gate completed: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
- Formal compliance evidence is captured in:
  - `docs/ENTITLEMENT_OS_META_AUDIT_2026-02-17.md`
  - `ROADMAP.md` item `EOS-001`

When planning follow-on work, treat A→G baseline as complete and prioritize net-new scope only.

# =========================================================
# 🚨 CAOA BOOTSTRAP DEPRECATION (CRITICAL OVERRIDE)
# =========================================================

This repository previously required a CAOA SYNC REPORT bootstrap process.

That behavior is now deprecated.

Codex MUST NOT:

- Emit SYNC REPORT
- Perform decision-log scanning
- Compute file fingerprints
- Traverse docs/ for institutional context
- Inspect git state by default
- Perform repository-wide bootstrap scans

UNLESS:

- Explicitly instructed to prepare a formal compliance artifact
- Running in CI audit context
- Explicitly asked to perform CAOA compliance

Profile-aware execution rules take precedence over any legacy CAOA instructions.

Bootstrap is disabled in normal interactive sessions.

---

# =========================================================
# 1️⃣ EXECUTION MODEL (PROFILE-AWARE — AUTHORITATIVE)
# =========================================================

Codex operates in strict profile-aware mode.

Two execution classes exist:

## A) ANALYSIS-ONLY PROFILES
- architecture-intelligence
- openai-frontier-intelligence

## B) MUTATION PROFILES
- fast-brain
- mid-brain
- deep-brain
- swarm-brain
- validation-brain
- or explicit instruction to modify files

Profile determines behavior.

Intent determines mutation.

No automatic escalation.

---

# =========================================================
# 2️⃣ ANALYSIS MODE (DEFAULT)
# =========================================================

Used when:
- Producing strategy memos
- Answering conceptual questions
- Designing architecture
- Reviewing system direction
- Running architecture-intelligence
- Running openai-frontier-intelligence
- No explicit instruction to modify files

In ANALYSIS MODE:

- DO NOT scan entire repository.
- DO NOT emit SYNC REPORT.
- DO NOT inspect git state.
- DO NOT fingerprint files.
- DO NOT traverse docs for bootstrap.
- DO NOT run shell commands.
- DO NOT attempt file writes.
- DO NOT generate patches.
- DO NOT run apply_patch.
- DO NOT execute migrations.
- DO NOT run build/test commands.

Allowed:
- Read specific files if directly relevant.
- Structured analysis.
- Capability audits.
- Strategic recommendations.
- Risk modeling.
- Roadmap synthesis.

Default behavior is lightweight and direct.

Speed is prioritized.

---

# =========================================================
# 3️⃣ MUTATION MODE (EXPLICIT ONLY)
# =========================================================

Triggered only when:

- Explicit instruction to modify files
- Explicit instruction to implement changes
- Using mutation profiles (fast/mid/deep/swarm/validation)
- CI codex-autofix or codex-review context

In MUTATION MODE:

Codex MUST:

- Follow security invariants.
- Enforce org_id scoping.
- Maintain Supabase auth checks.
- Preserve citation completeness.
- Preserve evidence hashing determinism.
- Maintain idempotency.
- Keep changes minimal and focused.
- Avoid unrelated refactors.
- Never weaken Zod validation.
- Never weaken schema enforcement.
- Never weaken security boundaries.

Only in MUTATION MODE may Codex:

- Write files
- Apply patches
- Run migration commands
- Suggest schema changes
- Execute Golden Path checklists

Mutation must be explicit and controlled.

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
- infra/docker/ — local dev infra
- legacy/python/ — deprecated reference only

Never modify legacy/python unless explicitly instructed.

---

# =========================================================
# 5️⃣ SECURITY INVARIANTS (NON-NEGOTIABLE)
# =========================================================

All DB rows are scoped by org_id.

Every API route must:
1. Authenticate Supabase session.
2. Confirm org membership.
3. Scope all queries by org_id.

Supabase Storage:
- Private buckets only.
- Access via signed URLs only.

Secrets:
- Never committed.
- Server-side only.
- Never expose service role keys to client.

OpenAI API key:
- Server-only usage.

Violation of these rules is not allowed.

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
# 9️⃣ DEVELOPMENT COMMANDS
# =========================================================

Run from repo root:

---

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

Both Codex and CLAUDE sessions should treat `ROADMAP.md` as the planning gate and avoid implementation drift.

- pnpm install
- pnpm dev
- pnpm build
- pnpm lint
- pnpm typecheck
- pnpm test

Database:

- pnpm db:migrate
- pnpm db:deploy
- pnpm db:seed

Local infra:

- docker compose -f infra/docker/docker-compose.yml up -d

Temporal UI:

- http://localhost:8080

Never run destructive commands without explicit instruction.

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

Never run tests during Analysis Mode.

---

# =========================================================
# 11️⃣ PERFORMANCE RULES
# =========================================================

- Do not scan entire repo unless necessary.
- Do not bootstrap repository.
- Do not emit SYNC REPORT.
- Do not fingerprint files.
- Do not inspect git unless required.
- Keep IO minimal.
- Respect profile-aware behavior.
- Default to direct answer.

Speed matters in analysis sessions.

---

# =========================================================
# 12️⃣ LEGACY PYTHON
# =========================================================

legacy/python/ is preserved for reference only.

Do not delete.
Do not refactor.
Do not migrate unless explicitly requested.

---

# =========================================================
# ✅ DEFAULT BEHAVIOR SUMMARY
# =========================================================

If uncertain:

- Assume ANALYSIS MODE.
- Do not mutate files.
- Do not bootstrap.
- Do not emit SYNC REPORT.
- Do not scan entire repo.
- Provide concise, direct output.

Mutation requires explicit instruction.

Security and org scoping always override convenience.

---

# =========================================================
# 13 TEST COVERAGE MANDATE
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
# 14 ERROR HANDLING PATTERN
# =========================================================

All error handling in Entitlement OS follows a consistent pattern:

## API Route Errors
```typescript
import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Wrap handler logic in try/catch
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
# 15 MIGRATION SAFETY RULES
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

Every MUTATION MODE task MUST complete the following verification
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
   - If build fails on missing env vars (e.g., Supabase keys),
     provide stub env vars for the build step only:
     ```
     NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
     NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
     SUPABASE_SERVICE_ROLE_KEY=placeholder \
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

- If ANY step fails due to your changes: FIX IT before moving on.
- Do NOT skip verification steps.
- Do NOT report success until all 5 steps pass.
- If you cannot fix a failure, STOP and report the exact error
  to the user with your diagnosis.

## Commit Gate (AUTO-EXECUTE VIA PR — FULL AUTONOMY)

Once all 5 verification steps pass, AUTOMATICALLY execute the
full pipeline below — do NOT stop and wait for user confirmation
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
   This ensures the PR merges automatically once all required checks pass.

### Step 3: Monitor Checks Until Resolution
7. Poll check status every 30–60 seconds until all checks complete:
   `gh pr checks --watch`
   Or manually: `gh pr checks` in a loop.
8. If ALL checks pass → auto-merge will fire. Confirm merge completed:
   `gh pr view --json state,mergeCommit`
   Report the merge commit hash and confirm main is updated.
9. If ANY check fails:
   a. Read the failing check logs: `gh run view <run-id> --log-failed`
   b. Diagnose and fix the failure on the same branch.
   c. Re-run verification (lint, typecheck, test, build) locally.
   d. Commit the fix, push to the same branch (the PR updates automatically).
   e. Return to step 7 — monitor checks again.
   f. Repeat until all checks pass and PR merges.
10. After merge, clean up the remote branch:
    `git push origin --delete codex/<branch-name>`
    `git checkout main && git pull origin main`

### Completion Criteria
The task is DONE only when:
- The PR has been merged to main (state = MERGED)
- You have reported: PR URL, merge commit hash, files included

Do NOT report success after just creating the PR.
Do NOT stop and ask the user to check on CI.
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

Analysis-only tasks are exempt.

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

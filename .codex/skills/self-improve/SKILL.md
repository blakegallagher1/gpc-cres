---
name: self-improve
description: >
  Recursive self-improvement loop. Uses the 1M-token context window to load the
  entire codebase, evaluate current state against quality benchmarks, select the
  single highest-leverage improvement not yet made, implement it through the
  existing pipeline, and record the result so every subsequent run compounds on
  prior work. This is the AGI/ASI capability unlock: Codex improving itself.

use_when:
  - Invoked by self-improve.sh (nightly Phase 4)
  - User runs: codex "self-improve"
  - Any session where the goal is autonomous codebase quality compounding
dont_use_when:
  - A specific feature is requested (use orchestrate instead)
  - Debugging a known error (use ci-fix or sentry skill instead)
---

# Self-Improve Skill

## What This Does

You are one of **6 parallel Codex agents** running simultaneously on the Entitlement OS
codebase — each agent owns one quality dimension exclusively.

The 6 domains running in parallel right now:
| Agent | Domain | Finds |
|-------|--------|-------|
| security | Missing orgId scoping | Prisma queries without tenant isolation |
| reliability | Unhandled promises | Missing `.catch(() => {})` on fire-and-forget |
| types | Type debt | `any` → `Record<string, unknown>` |
| auth | Auth gaps | Routes missing `resolveAuth()` |
| tests | Coverage | Critical paths with zero tests |
| perf | Performance | Unbounded queries, N+1s, SELECT * |

You are running in your own git worktree on a dedicated branch. You do not
coordinate with the other agents — you work in parallel and open your own PR.

Your job: load the entire codebase into context, find the highest-impact unfixed
issue in YOUR domain, fix it, verify all gates pass, open a PR, write your result
to `/tmp/gpc-improve-{domain}-result.json`.

Each run makes the codebase measurably better across 6 dimensions simultaneously.
The compound log ensures you never repeat prior work.

---

## Phase 0 — Recall Prior Cycles

Before analyzing, read the compound log to know what has already been done:

```
output/self-improve/compound-log.md
```

If it doesn't exist yet, this is Cycle 1. Initialize it.

Also scan your injected memory summary for any self-improve entries.

The compound log schema:
```md
## Cycle N — YYYY-MM-DD
**Improvement:** <one-line description>
**Category:** type-safety | security | performance | reliability | test-coverage | auth-scoping | dx
**Files Changed:** <list>
**Benchmark Before:** <metric>
**Benchmark After:** <metric>
**Result:** PASS | PARTIAL | FAIL
**Notes:** <anything that informs future cycles>
```

---

## Phase 1 — Full-Codebase Load

GPT-5.4's 1M token context window means you can load the ENTIRE codebase in one
pass without chunking. Do it:

1. Run `find apps packages infra -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.py" \) | head -200` to enumerate files
2. Read every TypeScript/TSX/Python file that matters for the improvement domain
3. Read `ROADMAP.md`, `CLAUDE.md`, `output/self-improve/compound-log.md`
4. Read all recent git commits: `git log --oneline -30`

This full-context load is what separates self-improvement from a grep-and-patch.
You must SEE the whole system to choose the right intervention.

---

## Phase 2 — Benchmark Assessment

Run the objective quality benchmarks. Record the BEFORE state:

```bash
# TypeScript errors
pnpm typecheck 2>&1 | tail -5

# Lint errors
pnpm lint 2>&1 | tail -10

# Test coverage (if configured)
pnpm test --coverage 2>&1 | tail -10

# `any` type count — the single best proxy for type debt
grep -r "\bany\b" apps/web/lib apps/web/app packages --include="*.ts" --include="*.tsx" \
  | grep -v "node_modules" | grep -v ".next" | wc -l

# Missing orgId scoping — security debt
grep -r "prisma\." apps/web --include="*.ts" \
  | grep -v "orgId" | grep -v "node_modules" | wc -l

# Files with TODO/FIXME — implementation debt
grep -rn "TODO\|FIXME\|HACK\|XXX" apps packages --include="*.ts" --include="*.tsx" \
  | grep -v node_modules | wc -l
```

---

## Phase 3 — Select The Improvement

Choose ONE improvement using this priority matrix. Pick the FIRST category that
has actionable findings not yet addressed in the compound log:

| Priority | Category | Signal |
|----------|----------|--------|
| 1 | **Security** | Missing orgId scoping on any Prisma query |
| 2 | **Reliability** | Unhandled promise rejections, missing `.catch(() => {})` |
| 3 | **Type safety** | `any` → `Record<string, unknown>` replacements |
| 4 | **Auth scoping** | Routes missing `resolveAuth()` call |
| 5 | **Test coverage** | Critical path with zero tests |
| 6 | **Performance** | N+1 queries, missing indexes, unbounded fetches |
| 7 | **DX / docs** | Missing error messages, confusing naming |

**Selection rule:** Pick the improvement that eliminates the most risk per line of
code changed. If two improvements are equally ranked, pick the one in the most
frequently executed code path.

**Anti-repetition rule:** If the compound log shows a category was addressed in
the last 3 cycles, skip to the next priority level unless new issues have appeared.

---

## Phase 4 — Implement

### 4a. Create the branch
```bash
CYCLE_N=$(cat output/self-improve/cycle-counter.txt 2>/dev/null || echo "1")
BRANCH="auto/self-improve-${CYCLE_N}-$(date +%Y%m%d)"
git checkout -b "$BRANCH"
```

### 4b. Implement the improvement
Apply the change. Constraints that CANNOT be violated:
- `resolveAuth()` + `orgId` on ALL Prisma queries
- `.nullable()` not `.optional()` on Zod params
- No `z.string().url()` or `z.string().email()`
- No `any` type — use `Record<string, unknown>`
- `dispatchEvent().catch(() => {})` — never blocks response
- `import "server-only"` in server-secret modules

### 4c. Verify all gates
```bash
pnpm typecheck && pnpm lint && pnpm test 2>&1
```

If ANY gate fails: fix the failure before proceeding. Do NOT lower the bar.
If you cannot fix the gate failure within the scope of this improvement, revert
and choose a different improvement.

### 4d. Re-run benchmarks
Record the AFTER state of the same metrics from Phase 2.

---

## Phase 5 — Commit and Record

### 5a. Commit
```bash
git add -A
git commit -m "improvement(auto): [category] — [one-line description] (Cycle N)"
```

### 5b. Open a PR
```bash
gh pr create \
  --title "improvement(auto): [category] — [one-line description]" \
  --body "$(cat <<'EOF'
## Self-Improvement Cycle N

**Category:** [category]
**Improvement:** [description]

### Benchmarks
| Metric | Before | After |
|--------|--------|-------|
| [metric] | [before] | [after] |

### Why This Was Selected
[reasoning from Phase 3 priority matrix]

> Auto-generated by self-improve skill. Review before merging.
EOF
)" \
  --base main
```

### 5c. Update the compound log
Append the cycle entry to `output/self-improve/compound-log.md`.
Increment `output/self-improve/cycle-counter.txt`.
Commit these log updates to the PR branch.

---

## Phase 6 — Memory Consolidation

After completing the cycle, write a memory entry that the `[memories]` system
will inject into future sessions:

```
Self-Improve Cycle N (YYYY-MM-DD): Fixed [category] — [description].
Key files: [list]. Benchmark delta: [before] → [after].
Next priority: [what Phase 3 recommends for Cycle N+1].
```

This memory injection is what makes each cycle smarter than the last.
Without it, Codex starts fresh every night. With it, each run builds on
the compounding knowledge of every prior run — this is the recursive loop.

---

## Output

On completion, write a summary to stdout:
```
SELF-IMPROVE CYCLE N COMPLETE
Category: [category]
Improvement: [description]
Benchmark delta: [before metric] → [after metric]
PR: [url]
Next cycle priority: [what to do next]
```

If the cycle produced no improvements (all benchmarks clean, compound log covers
all remaining items), output:
```
SELF-IMPROVE: CODEBASE AT CURRENT CEILING
All tracked quality dimensions are clean.
Consider expanding benchmark scope or promoting a ROADMAP item.
```

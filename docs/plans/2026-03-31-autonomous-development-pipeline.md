# Autonomous Development Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 4-layer autonomous development pipeline where Claude Code plans/reviews, Codex CLI implements/fixes, CI auto-heals, and Cloud Codex handles parallel background work.

**Architecture:** Four independent layers, each deployable separately. L3 (CI/CD) ships first for immediate ROI. L1 (Dual-Brain dispatch) connects Claude Code to Codex exec. L2 upgrades the Agents SDK orchestrator to production-grade. L4 enables Cloud Codex for parallel autonomous branches.

**Tech Stack:** Codex CLI 0.117+, GitHub Actions, OpenAI Agents SDK (Python), `codex exec` headless mode, `codex-action@v1`, existing `scripts/codex-auto/` infrastructure.

**Existing infrastructure to build on:**
- `scripts/codex-auto/common.sh` — `run_codex()` and `run_codex_yolo()` helpers
- `scripts/codex-auto/ci-fix.sh` — CI failure auto-fixer (local)
- `scripts/codex-auto/review-pr.sh` — PR review (local)
- `scripts/codex-auto/nightly.sh` — Scheduled multi-phase automation
- `~/.codex/bin/codex-exec` — Headless wrapper with profiles
- `.codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py` — Multi-agent orchestrator (171 lines)
- `packages/openai/src/agentos/schemas.ts` — TrajectoryLog, EpisodicEntry, ToolCallEntry schemas
- `packages/openai/src/tools/resilientToolWrapper.ts` — Retry + fallback pattern
- 11 agent TOML configs in `.codex/agents/`

---

## Layer 3: CI/CD Automation (GitHub Action)

> **Why first:** Immediate ROI. Every failed CI run currently requires manual intervention. This layer makes Codex auto-fix failures and auto-review PRs.

### Task 1: Create structured output schema for CI fix results

**Files:**
- Create: `scripts/codex-auto/schemas/ci-fix-output.json`

**Step 1: Write the JSON Schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "fixed": { "type": "boolean" },
    "summary": { "type": "string" },
    "files_changed": {
      "type": "array",
      "items": { "type": "string" }
    },
    "error_category": {
      "type": "string",
      "enum": ["lint", "typecheck", "test", "build", "unknown"]
    },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"]
    },
    "requires_human_review": { "type": "boolean" }
  },
  "required": ["fixed", "summary", "files_changed", "error_category", "confidence", "requires_human_review"],
  "additionalProperties": false
}
```

**Step 2: Commit**

```bash
git add scripts/codex-auto/schemas/ci-fix-output.json
git commit -m "feat(ci): add structured output schema for codex autofix"
```

---

### Task 2: Create structured output schema for PR review

**Files:**
- Create: `scripts/codex-auto/schemas/pr-review-output.json`

**Step 1: Write the JSON Schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "verdict": {
      "type": "string",
      "enum": ["approve", "request_changes", "comment"]
    },
    "summary": { "type": "string" },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "severity": { "type": "string", "enum": ["critical", "warning", "nit"] },
          "file": { "type": "string" },
          "line": { "type": "integer" },
          "message": { "type": "string" }
        },
        "required": ["severity", "file", "message"]
      }
    },
    "security_concerns": { "type": "boolean" },
    "org_scoping_verified": { "type": "boolean" },
    "test_coverage_adequate": { "type": "boolean" }
  },
  "required": ["verdict", "summary", "issues", "security_concerns", "org_scoping_verified", "test_coverage_adequate"],
  "additionalProperties": false
}
```

**Step 2: Commit**

```bash
git add scripts/codex-auto/schemas/pr-review-output.json
git commit -m "feat(ci): add structured output schema for codex PR review"
```

---

### Task 3: Create the Codex autofix GitHub Action workflow

**Files:**
- Create: `.github/workflows/codex-autofix.yml`

**Step 1: Write the workflow**

This triggers when `harness-ci.yml` fails, runs `codex exec` to fix the issue, and opens a PR with the fix.

```yaml
name: Codex Autofix

on:
  workflow_run:
    workflows: ["Harness CI"]
    types: [completed]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  autofix:
    if: ${{ github.event.workflow_run.conclusion == 'failure' && github.event.workflow_run.head_branch != 'main' }}
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout failing branch
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_branch }}
          fetch-depth: 0

      - name: Download CI logs
        uses: actions/github-script@v7
        id: ci-logs
        with:
          script: |
            const jobs = await github.rest.actions.listJobsForWorkflowRun({
              owner: context.repo.owner,
              repo: context.repo.repo,
              run_id: ${{ github.event.workflow_run.id }}
            });
            const failedJobs = jobs.data.jobs.filter(j => j.conclusion === 'failure');
            const summaries = failedJobs.map(j => `${j.name}: ${j.conclusion}`).join('\n');
            core.setOutput('failed_jobs', summaries);

      - name: Run Codex autofix
        uses: openai/codex-action@v1
        id: codex-fix
        with:
          prompt: |
            The CI pipeline failed on this branch. Failed jobs:
            ${{ steps.ci-logs.outputs.failed_jobs }}

            Fix the failures. Run the specific failing commands to reproduce, then fix.
            Common commands: pnpm lint, pnpm typecheck, pnpm test, pnpm build.
            Do NOT change test expectations unless the test itself is wrong.
            Do NOT weaken type checks or lint rules.
            Scope: only fix what's broken, don't refactor.
          sandbox: workspace-write
          output-file: /tmp/codex-fix-result.json
          codex-args: '["--output-schema", "scripts/codex-auto/schemas/ci-fix-output.json"]'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Parse fix result
        id: parse
        run: |
          if [ -f /tmp/codex-fix-result.json ]; then
            FIXED=$(jq -r '.fixed' /tmp/codex-fix-result.json)
            SUMMARY=$(jq -r '.summary' /tmp/codex-fix-result.json)
            CONFIDENCE=$(jq -r '.confidence' /tmp/codex-fix-result.json)
            echo "fixed=$FIXED" >> "$GITHUB_OUTPUT"
            echo "summary=$SUMMARY" >> "$GITHUB_OUTPUT"
            echo "confidence=$CONFIDENCE" >> "$GITHUB_OUTPUT"
          else
            echo "fixed=false" >> "$GITHUB_OUTPUT"
            echo "summary=Codex did not produce output" >> "$GITHUB_OUTPUT"
            echo "confidence=low" >> "$GITHUB_OUTPUT"
          fi

      - name: Create fix PR
        if: steps.parse.outputs.fixed == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            const branch = `codex/autofix-${context.runNumber}`;
            const { execSync } = require('child_process');
            execSync(`git checkout -b ${branch}`);
            execSync(`git add -A`);
            execSync(`git commit -m "fix(ci): codex autofix — ${{ steps.parse.outputs.summary }}"`);
            execSync(`git push origin ${branch}`);

            await github.rest.pulls.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `fix(ci): codex autofix — ${{ steps.parse.outputs.summary }}`,
              body: [
                '## Codex Autofix',
                '',
                `**Confidence:** ${{ steps.parse.outputs.confidence }}`,
                `**Summary:** ${{ steps.parse.outputs.summary }}`,
                '',
                `Triggered by CI failure in run #${{ github.event.workflow_run.id }}`,
                '',
                '> Review carefully before merging. Auto-generated by Codex.',
              ].join('\n'),
              head: branch,
              base: '${{ github.event.workflow_run.head_branch }}',
            });

      - name: Comment on original PR if no fix
        if: steps.parse.outputs.fixed == 'false'
        uses: actions/github-script@v7
        with:
          script: |
            const prs = await github.rest.pulls.list({
              owner: context.repo.owner,
              repo: context.repo.repo,
              head: `${context.repo.owner}:${{ github.event.workflow_run.head_branch }}`,
              state: 'open',
            });
            if (prs.data.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prs.data[0].number,
                body: `Codex attempted to autofix CI failure but could not resolve it.\n\n**Summary:** ${{ steps.parse.outputs.summary }}\n\nManual intervention required.`,
              });
            }
```

**Step 2: Commit**

```bash
git add .github/workflows/codex-autofix.yml
git commit -m "feat(ci): add codex autofix workflow — auto-fix CI failures"
```

---

### Task 4: Create the Codex PR review GitHub Action workflow

**Files:**
- Create: `.github/workflows/codex-review.yml`

**Step 1: Write the workflow**

```yaml
name: Codex PR Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    if: "!github.event.pull_request.draft"
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout PR
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get diff
        id: diff
        run: |
          DIFF=$(git diff origin/main...HEAD --stat)
          echo "diff_stat<<EOF" >> "$GITHUB_OUTPUT"
          echo "$DIFF" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"

      - name: Run Codex review
        uses: openai/codex-action@v1
        id: review
        with:
          prompt: |
            Review this pull request for the Entitlement OS project (commercial real estate platform).

            Changed files:
            ${{ steps.diff.outputs.diff_stat }}

            Review checklist:
            1. Security: All API routes use resolveAuth() + orgId scoping?
            2. No client-side secrets (NEXT_PUBLIC_ prefix on server-only vars)?
            3. Zod schemas use .nullable() not .optional() for OpenAI tool params?
            4. No .url() or .email() Zod validators (OpenAI rejects format constraints)?
            5. Event dispatch uses .catch(() => {}) — never blocks response?
            6. No weakening of existing type checks or test assertions?
            7. Test coverage for new code paths?

            Be concise. Only flag real issues, not style preferences.
          sandbox: read-only
          output-file: /tmp/codex-review.json
          codex-args: '["--output-schema", "scripts/codex-auto/schemas/pr-review-output.json"]'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Post review comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            let review;
            try {
              review = JSON.parse(fs.readFileSync('/tmp/codex-review.json', 'utf8'));
            } catch {
              review = { verdict: 'comment', summary: 'Codex review did not produce structured output.', issues: [] };
            }

            const issueLines = review.issues.map(i => {
              const loc = i.line ? `${i.file}:${i.line}` : i.file;
              const icon = i.severity === 'critical' ? 'X' : i.severity === 'warning' ? '!' : '-';
              return `- [${icon}] **${i.severity}** \`${loc}\`: ${i.message}`;
            }).join('\n');

            const body = [
              '## Codex Review',
              '',
              `**Verdict:** ${review.verdict}`,
              `**Security concerns:** ${review.security_concerns ? 'YES' : 'None'}`,
              `**Org-scoping verified:** ${review.org_scoping_verified ? 'Yes' : 'Not verified'}`,
              `**Test coverage:** ${review.test_coverage_adequate ? 'Adequate' : 'Gaps found'}`,
              '',
              review.summary,
              '',
              review.issues.length > 0 ? '### Issues\n' + issueLines : 'No issues found.',
            ].join('\n');

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body,
            });
```

**Step 2: Commit**

```bash
git add .github/workflows/codex-review.yml
git commit -m "feat(ci): add codex PR review workflow — structured code review on PRs"
```

---

### Task 5: Add OPENAI_API_KEY to GitHub repo secrets

**Step 1: Check if secret exists**

```bash
gh secret list | grep OPENAI_API_KEY
```

**Step 2: Set the secret (if not present)**

```bash
gh secret set OPENAI_API_KEY
```

Paste the API key when prompted. This is required for both workflows.

**Step 3: Verify workflows are recognized**

```bash
gh workflow list
```

Expected: `Codex Autofix` and `Codex PR Review` appear in the list.

---

### Task 6: Test L3 with a deliberate lint failure

**Step 1: Create a test branch**

```bash
git checkout -b test/codex-autofix-verify origin/main
```

**Step 2: Introduce a lint error**

Add an unused variable to any file (e.g., `apps/web/app/api/health/route.ts`):
```typescript
const _unused_codex_test = "delete me";
```

**Step 3: Push and observe**

```bash
git add -A && git commit -m "test: deliberate lint failure for codex autofix"
git push origin test/codex-autofix-verify
```

**Step 4: Open PR and watch**

```bash
gh pr create --title "test: codex autofix verification" --body "Testing codex autofix pipeline. Will self-destruct."
```

**Step 5: Verify**
- Harness CI should fail (lint error)
- Codex Autofix should trigger and create a fix PR
- Codex PR Review should comment on the PR

**Step 6: Cleanup**

```bash
gh pr close --delete-branch
git checkout main
```

---

## Layer 1: Dual-Brain Dispatch (Claude Code <-> Codex)

> **Why second:** Biggest velocity multiplier. Claude Code generates structured task files, Codex executes them headlessly, results flow back for review.

### Task 7: Create the task YAML schema

**Files:**
- Create: `scripts/codex-auto/schemas/task.schema.json`

**Step 1: Write the schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "description": { "type": "string" },
    "profile": {
      "type": "string",
      "enum": ["feature", "bugfix", "review"],
      "default": "feature"
    },
    "scope": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Directories/files this task should touch"
    },
    "depends_on": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Task IDs that must complete first"
    },
    "acceptance_criteria": {
      "type": "array",
      "items": { "type": "string" }
    },
    "verification_command": {
      "type": "string",
      "description": "Shell command to verify task completion (exit 0 = pass)"
    },
    "max_minutes": { "type": "integer", "default": 15 }
  },
  "required": ["id", "title", "description", "acceptance_criteria"],
  "additionalProperties": false
}
```

**Step 2: Commit**

```bash
git add scripts/codex-auto/schemas/task.schema.json
git commit -m "feat(dispatch): add task YAML schema for Claude-to-Codex handoff"
```

---

### Task 8: Create the dispatch script

**Files:**
- Create: `scripts/codex-auto/dispatch.sh`

**Step 1: Write the script**

This reads a YAML task file (or directory of task files), resolves dependencies, and runs `codex exec` for each task in order.

```bash
#!/usr/bin/env bash
set -euo pipefail

# dispatch.sh — Execute structured task files via codex exec
# Usage: ./dispatch.sh tasks/my-feature/          # run all tasks in directory
#        ./dispatch.sh tasks/my-feature/01-db.yaml # run single task
#        ./dispatch.sh --parallel tasks/dir/       # run independent tasks concurrently

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PARALLEL=false
TASK_PATH=""
RESULTS_DIR=""

usage() {
  echo "Usage: dispatch.sh [--parallel] <task-file-or-directory>"
  echo ""
  echo "Options:"
  echo "  --parallel    Run tasks without dependencies concurrently"
  echo ""
  echo "Task files are YAML matching scripts/codex-auto/schemas/task.schema.json"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --parallel) PARALLEL=true; shift ;;
    -h|--help) usage ;;
    *) TASK_PATH="$1"; shift ;;
  esac
done

[[ -z "$TASK_PATH" ]] && usage

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RESULTS_DIR="$LOG_DIR/dispatch-$TIMESTAMP"
mkdir -p "$RESULTS_DIR"

# Collect task files
TASK_FILES=()
if [[ -d "$TASK_PATH" ]]; then
  while IFS= read -r f; do
    TASK_FILES+=("$f")
  done < <(find "$TASK_PATH" -name '*.yaml' -o -name '*.yml' | sort)
else
  TASK_FILES=("$TASK_PATH")
fi

echo "=== Codex Dispatch: ${#TASK_FILES[@]} tasks ==="
echo "Results: $RESULTS_DIR"
echo ""

# Track completed task IDs for dependency resolution
declare -A COMPLETED
FAILED=0

run_task() {
  local taskfile="$1"
  local task_id task_title task_desc task_profile task_verify task_max_min

  # Parse YAML fields (lightweight — no yq dependency)
  task_id=$(grep '^id:' "$taskfile" | head -1 | sed 's/^id: *//' | tr -d '"' | tr -d "'")
  task_title=$(grep '^title:' "$taskfile" | head -1 | sed 's/^title: *//' | tr -d '"' | tr -d "'")
  task_desc=$(grep '^description:' "$taskfile" | head -1 | sed 's/^description: *//' | tr -d '"' | tr -d "'")
  task_profile=$(grep '^profile:' "$taskfile" | head -1 | sed 's/^profile: *//' | tr -d '"' | tr -d "'")
  task_verify=$(grep '^verification_command:' "$taskfile" | head -1 | sed 's/^verification_command: *//' | tr -d '"' | tr -d "'")
  task_max_min=$(grep '^max_minutes:' "$taskfile" | head -1 | sed 's/^max_minutes: *//' | tr -d '"' | tr -d "'")

  task_profile="${task_profile:-feature}"
  task_max_min="${task_max_min:-15}"

  local logfile="$RESULTS_DIR/${task_id}.log"
  local resultfile="$RESULTS_DIR/${task_id}.result.json"

  echo "--- Task: $task_id — $task_title ---"
  echo "  Profile: $task_profile | Max: ${task_max_min}m"

  # Check dependencies
  local deps
  deps=$(grep -A 20 'depends_on:' "$taskfile" 2>/dev/null | grep '^ *-' | sed 's/^ *- *//' | tr -d '"' | tr -d "'" || true)
  if [[ -n "$deps" ]]; then
    while IFS= read -r dep; do
      if [[ -z "${COMPLETED[$dep]:-}" ]]; then
        echo "  BLOCKED: depends on $dep (not completed)"
        echo '{"status":"blocked","reason":"dependency not met: '"$dep"'"}' > "$resultfile"
        return 1
      fi
    done <<< "$deps"
  fi

  # Build prompt from task file
  local prompt="Task: $task_title

$task_desc

Acceptance criteria:
$(grep -A 50 'acceptance_criteria:' "$taskfile" | grep '^ *-' | sed 's/^ *- */- /' || echo "- Complete the task as described")

Rules:
- Only modify files within the task scope
- Run verification after implementation
- Do not refactor beyond what's needed
- Preserve existing auth/org-scoping patterns"

  # Run codex exec
  local timeout_sec=$((task_max_min * 60))
  if timeout "$timeout_sec" codex exec \
    -C "$REPO_ROOT" \
    --full-auto \
    "$prompt" \
    2>&1 | tee "$logfile"; then

    # Run verification if specified
    if [[ -n "$task_verify" ]]; then
      echo "  Verifying: $task_verify"
      if eval "$task_verify" >> "$logfile" 2>&1; then
        echo '{"status":"passed","verified":true}' > "$resultfile"
        echo "  PASS (verified)"
      else
        echo '{"status":"failed","verified":false,"reason":"verification command failed"}' > "$resultfile"
        echo "  FAIL (verification failed)"
        return 1
      fi
    else
      echo '{"status":"passed","verified":false}' > "$resultfile"
      echo "  PASS (no verification command)"
    fi
  else
    echo '{"status":"failed","reason":"codex exec failed or timed out"}' > "$resultfile"
    echo "  FAIL (codex exec error)"
    return 1
  fi
}

for taskfile in "${TASK_FILES[@]}"; do
  task_id=$(grep '^id:' "$taskfile" | head -1 | sed 's/^id: *//' | tr -d '"' | tr -d "'")

  if run_task "$taskfile"; then
    COMPLETED["$task_id"]=1
  else
    FAILED=$((FAILED + 1))
    echo "  Task $task_id failed. Continuing with remaining tasks."
  fi
  echo ""
done

# Summary
echo "=== Dispatch Complete ==="
echo "  Total:  ${#TASK_FILES[@]}"
echo "  Passed: $(( ${#TASK_FILES[@]} - FAILED ))"
echo "  Failed: $FAILED"
echo "  Results: $RESULTS_DIR"

# Generate summary JSON
cat > "$RESULTS_DIR/summary.json" << ENDJSON
{
  "timestamp": "$TIMESTAMP",
  "total": ${#TASK_FILES[@]},
  "passed": $(( ${#TASK_FILES[@]} - FAILED )),
  "failed": $FAILED,
  "results_dir": "$RESULTS_DIR"
}
ENDJSON

exit $FAILED
```

**Step 2: Make executable and commit**

```bash
chmod +x scripts/codex-auto/dispatch.sh
git add scripts/codex-auto/dispatch.sh
git commit -m "feat(dispatch): add task dispatch script — Claude plans, Codex executes"
```

---

### Task 9: Create a task template for Claude Code to fill

**Files:**
- Create: `scripts/codex-auto/templates/task-template.yaml`

**Step 1: Write the template**

```yaml
# Task file for Codex dispatch
# Claude Code fills this out, dispatch.sh executes it
id: "task-001"
title: "Short imperative description"
description: |
  Detailed description of what needs to be done.
  Include context about which files to modify and why.
  Reference existing patterns to follow.
profile: "feature"  # feature | bugfix | review
scope:
  - "apps/web/app/api/"
  - "packages/openai/src/tools/"
depends_on: []  # task IDs that must complete first
acceptance_criteria:
  - "New endpoint returns 200 with correct schema"
  - "Auth + orgId scoping enforced"
  - "Tests pass: pnpm test"
  - "Types pass: pnpm typecheck"
verification_command: "pnpm lint && pnpm typecheck && pnpm test"
max_minutes: 15
```

**Step 2: Commit**

```bash
git add scripts/codex-auto/templates/task-template.yaml
git commit -m "feat(dispatch): add task template for Claude-to-Codex handoff"
```

---

### Task 10: Create the Claude Code dispatch skill

**Files:**
- Create: `skills/codex-dispatch/SKILL.md`

**Step 1: Write the skill**

```markdown
---
name: codex-dispatch
description: "Dispatch implementation tasks to Codex CLI for autonomous execution. Use when Claude Code has a plan and wants Codex to implement it."
triggers:
  - "dispatch to codex"
  - "codex implement"
  - "hand off to codex"
  - "run this with codex"
---

# Codex Dispatch Skill

Hand off implementation tasks from Claude Code to Codex CLI for autonomous execution.

## When to use

- You have a plan or set of tasks that need implementation
- Tasks are well-defined with clear acceptance criteria
- You want Codex to implement while you review

## Workflow

### 1. Generate task files

For each task in your plan, create a YAML file in a temporary directory:

```bash
mkdir -p /tmp/codex-tasks/<feature-name>
```

Use the template at `scripts/codex-auto/templates/task-template.yaml`.

### 2. Dispatch

```bash
# Sequential (respects dependencies):
./scripts/codex-auto/dispatch.sh /tmp/codex-tasks/<feature-name>/

# Single task:
./scripts/codex-auto/dispatch.sh /tmp/codex-tasks/<feature-name>/01-task.yaml
```

### 3. Review results

Results are written to `scripts/codex-auto/logs/dispatch-<timestamp>/`:
- `<task-id>.log` — Full codex exec output
- `<task-id>.result.json` — Pass/fail + verification status
- `summary.json` — Overall dispatch results

### 4. Iterate

If a task failed:
1. Read the log: `cat scripts/codex-auto/logs/dispatch-*/task-id.log`
2. Adjust the task YAML with more specific instructions
3. Re-dispatch the single failed task

## Quick dispatch (no YAML needed)

For one-off tasks, use the existing scripts:

```bash
# Generic prompt:
./scripts/codex-auto/run.sh "Fix the lint error in apps/web/app/api/health/route.ts"

# CI fix:
./scripts/codex-auto/ci-fix.sh latest

# PR review:
./scripts/codex-auto/review-pr.sh 42

# Sentry issue:
./scripts/codex-auto/sentry-fix.sh SENTRY-ABC123
```

## Rules

- Always include `verification_command` — tasks without verification are untrustworthy
- Set `max_minutes` conservatively — 15 min default, raise for complex tasks
- Use `depends_on` for ordering — don't rely on filename sort for critical sequences
- Review Codex output before shipping — dispatch is autonomous but not infallible
```

**Step 2: Commit**

```bash
git add skills/codex-dispatch/SKILL.md
git commit -m "feat(dispatch): add Claude Code skill for Codex dispatch"
```

---

## Layer 2: Agents SDK Production Upgrade

> **Why third:** The orchestrator exists but needs retries, structured output, progress tracking, cost ceilings, and programmatic gate validation.

### Task 11: Create progress and gate schemas

**Files:**
- Create: `.codex/skills/codex-agents-sdk/schemas/progress.json`
- Create: `.codex/skills/codex-agents-sdk/schemas/gate-check.json`

**Step 1: Write progress schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "run_id": { "type": "string" },
    "objective": { "type": "string" },
    "status": { "type": "string", "enum": ["running", "completed", "failed", "blocked"] },
    "current_agent": { "type": "string" },
    "turn": { "type": "integer" },
    "max_turns": { "type": "integer" },
    "completed_gates": { "type": "array", "items": { "type": "string" } },
    "pending_gates": { "type": "array", "items": { "type": "string" } },
    "artifacts": { "type": "array", "items": { "type": "string" } },
    "errors": { "type": "array", "items": { "type": "string" } },
    "cost_usd": { "type": "number" },
    "cost_ceiling_usd": { "type": "number" },
    "elapsed_seconds": { "type": "number" },
    "updated_at": { "type": "string", "format": "date-time" }
  },
  "required": ["run_id", "status", "turn", "max_turns", "updated_at"]
}
```

**Step 2: Write gate-check schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "gate_name": { "type": "string" },
    "passed": { "type": "boolean" },
    "required_artifacts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "exists": { "type": "boolean" },
          "min_bytes": { "type": "integer" }
        },
        "required": ["path", "exists"]
      }
    },
    "checks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "passed": { "type": "boolean" },
          "message": { "type": "string" }
        },
        "required": ["name", "passed"]
      }
    }
  },
  "required": ["gate_name", "passed", "required_artifacts", "checks"]
}
```

**Step 3: Commit**

```bash
git add .codex/skills/codex-agents-sdk/schemas/
git commit -m "feat(agents-sdk): add progress and gate-check schemas"
```

---

### Task 12: Rewrite the Agents SDK orchestrator — production-grade

**Files:**
- Modify: `.codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py`

**Step 1: Rewrite with structured output, retries, progress, cost tracking, and gates**

```python
#!/usr/bin/env python3
"""
Entitlement OS — Production-grade multi-agent orchestrator.
Uses Codex MCP + OpenAI Agents SDK with structured output, retries,
progress tracking, cost ceilings, and programmatic gate validation.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agents import Agent, Runner, RunResult, set_default_openai_api
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX
from agents.mcp import MCPServerStdio
from dotenv import load_dotenv


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MAX_TURNS = 40
COST_CEILING_USD = 5.0
PROGRESS_INTERVAL_TURNS = 3
RETRY_MAX = 2
RETRY_BACKOFF_BASE = 5  # seconds


# ---------------------------------------------------------------------------
# Progress Tracker
# ---------------------------------------------------------------------------
class ProgressTracker:
    """Writes progress.json to output_dir on each update."""

    def __init__(self, run_id: str, objective: str, output_dir: Path, max_turns: int, cost_ceiling: float):
        self.run_id = run_id
        self.objective = objective
        self.output_dir = output_dir
        self.max_turns = max_turns
        self.cost_ceiling = cost_ceiling
        self.status = "running"
        self.current_agent = ""
        self.turn = 0
        self.completed_gates: list[str] = []
        self.pending_gates: list[str] = ["PLAN.md", "TASKS.md", "specialist_reports", "QA_REPORT.md"]
        self.artifacts: list[str] = []
        self.errors: list[str] = []
        self.cost_usd = 0.0
        self.start_time = time.time()

    def update(self, **kwargs: Any) -> None:
        for k, v in kwargs.items():
            if hasattr(self, k):
                setattr(self, k, v)
        self._write()

    def add_artifact(self, path: str) -> None:
        if path not in self.artifacts:
            self.artifacts.append(path)
        self._write()

    def complete_gate(self, gate: str) -> None:
        if gate not in self.completed_gates:
            self.completed_gates.append(gate)
        if gate in self.pending_gates:
            self.pending_gates.remove(gate)
        self._write()

    def add_error(self, error: str) -> None:
        self.errors.append(error)
        self._write()

    def _write(self) -> None:
        data = {
            "run_id": self.run_id,
            "objective": self.objective,
            "status": self.status,
            "current_agent": self.current_agent,
            "turn": self.turn,
            "max_turns": self.max_turns,
            "completed_gates": self.completed_gates,
            "pending_gates": self.pending_gates,
            "artifacts": self.artifacts,
            "errors": self.errors,
            "cost_usd": round(self.cost_usd, 4),
            "cost_ceiling_usd": self.cost_ceiling,
            "elapsed_seconds": round(time.time() - self.start_time, 1),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        progress_path = self.output_dir / "progress.json"
        progress_path.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Gate Validator
# ---------------------------------------------------------------------------
def validate_gate(gate_name: str, output_dir: Path, required_files: list[str]) -> dict:
    """Check if required artifacts exist and have content."""
    results = []
    all_passed = True
    for f in required_files:
        path = output_dir / f
        exists = path.exists()
        size = path.stat().st_size if exists else 0
        passed = exists and size > 10  # Must have real content
        results.append({"path": f, "exists": exists, "min_bytes": size})
        if not passed:
            all_passed = False

    return {
        "gate_name": gate_name,
        "passed": all_passed,
        "required_artifacts": results,
        "checks": [{"name": f"file:{f}", "passed": (output_dir / f).exists()} for f in required_files],
    }


# ---------------------------------------------------------------------------
# Agent Factory
# ---------------------------------------------------------------------------
def make_instructions(role: str, scope: str, deliverable: str, output_dir: Path) -> str:
    return (
        f"{RECOMMENDED_PROMPT_PREFIX}\n"
        f"You are {role} for Entitlement OS.\n"
        f"Scope: {scope}\n"
        "Only execute tasks within your assigned scope.\n"
        "When creating files, call Codex MCP with "
        "'{\"approval-policy\":\"never\",\"sandbox\":\"workspace-write\"}'.\n"
        f"Deliverable: write {output_dir}/{deliverable}\n"
        "Rules:\n"
        "- All API routes: resolveAuth() + orgId scoping\n"
        "- Zod params: .nullable() not .optional()\n"
        "- No .url()/.email() Zod validators\n"
        "- Event dispatch: .catch(() => {})\n"
        "- Import handlers.ts at top of routes that dispatch events\n"
    )


# ---------------------------------------------------------------------------
# Main Orchestrator
# ---------------------------------------------------------------------------
async def run_orchestrator(objective: str, slug: str | None, cost_ceiling: float, max_turns: int) -> None:
    load_dotenv(override=True)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required.")
    set_default_openai_api(api_key)

    run_id = str(uuid.uuid4())[:8]
    base = Path(os.environ.get(
        "ENTITLEMENT_OS_AGENT_WORKFLOW_OUTPUT_DIR",
        str(Path.cwd() / "output" / "codex-agents-workflow"),
    ))
    output_dir = base / (slug or f"run-{run_id}")
    output_dir.mkdir(parents=True, exist_ok=True)
    workspace = str(Path.cwd())

    tracker = ProgressTracker(run_id, objective, output_dir, max_turns, cost_ceiling)
    print(f"Run {run_id} | Output: {output_dir} | Max turns: {max_turns} | Cost ceiling: ${cost_ceiling}")

    codex_bootstrap = {"command": "npx", "args": ["-y", "codex", "mcp-server"]}

    async with MCPServerStdio(
        name="Codex CLI",
        params=codex_bootstrap,
        client_session_timeout_seconds=360000,
    ) as codex_mcp_server:

        # --- Define agents ---
        project_manager = Agent(
            name="project_manager",
            instructions=(
                f"{RECOMMENDED_PROMPT_PREFIX}\n"
                "You are the Entitlement OS Project Manager.\n"
                "Decompose the objective into scoped tasks. Enforce gated handoffs.\n"
                f"Output directory: {output_dir}\n"
                "Required outputs: PLAN.md, TASKS.md, TRACELOG.md\n"
                "\n"
                "GATE PROTOCOL:\n"
                "1. Do NOT handoff to specialists until PLAN.md + TASKS.md exist.\n"
                "2. Require specialist *_REPORT.md before handoff to QA.\n"
                "3. QA must produce QA_REPORT.md before declaring completion.\n"
                "4. If a required file is missing, instruct the owner to produce it.\n"
                "\n"
                "PROGRESS: After each handoff, append to TRACELOG.md with timestamp.\n"
                "COST: If told budget is exhausted, wrap up immediately.\n"
            ),
            mcp_servers=[codex_mcp_server],
        )

        db_agent = Agent(
            name="db_agent",
            instructions=make_instructions(
                "the Database Engineer",
                "packages/db/, packages/shared/",
                "DB_REPORT.md",
                output_dir,
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        openai_agent = Agent(
            name="openai_agent",
            instructions=make_instructions(
                "the AI Platform Engineer",
                "packages/openai/, packages/evidence/, packages/artifacts/",
                "OPENAI_REPORT.md",
                output_dir,
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        web_agent = Agent(
            name="web_agent",
            instructions=make_instructions(
                "the Web Engineer",
                "apps/web/",
                "WEB_REPORT.md",
                output_dir,
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        qa_agent = Agent(
            name="qa_agent",
            instructions=(
                f"{RECOMMENDED_PROMPT_PREFIX}\n"
                "You are the QA Reviewer for Entitlement OS.\n"
                f"Output directory: {output_dir}\n"
                "Produce QA_REPORT.md with:\n"
                "- Auth rejection test\n"
                "- Org-scope rejection test\n"
                "- Schema validation test\n"
                "- Happy path test\n"
                "- Idempotency test (if applicable)\n"
                "\n"
                "Run: pnpm lint && pnpm typecheck && pnpm test\n"
                "Report results in QA_REPORT.md\n"
            ),
            mcp_servers=[codex_mcp_server],
            handoffs=[],
        )

        # Wire handoffs (hub-and-spoke through PM)
        db_agent.handoffs = [project_manager]
        openai_agent.handoffs = [project_manager]
        web_agent.handoffs = [project_manager]
        qa_agent.handoffs = [project_manager]
        project_manager.handoffs = [db_agent, openai_agent, web_agent, qa_agent]

        # --- Run with retry ---
        full_objective = (
            f"Workspace: {workspace}\n"
            f"Output directory: {output_dir}\n"
            f"Objective:\n{objective}"
        )

        result: RunResult | None = None
        for attempt in range(1, RETRY_MAX + 1):
            try:
                tracker.update(status="running", turn=0)
                result = await Runner.run(project_manager, full_objective, max_turns=max_turns)
                tracker.update(status="completed", turn=max_turns)
                break
            except Exception as e:
                error_msg = f"Attempt {attempt}/{RETRY_MAX} failed: {e}"
                print(f"ERROR: {error_msg}")
                tracker.add_error(error_msg)
                if attempt < RETRY_MAX:
                    backoff = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
                    print(f"Retrying in {backoff}s...")
                    await asyncio.sleep(backoff)
                else:
                    tracker.update(status="failed")
                    raise

        # --- Validate gates ---
        gate1 = validate_gate("planning", output_dir, ["PLAN.md", "TASKS.md"])
        gate2 = validate_gate("specialist_reports", output_dir, ["DB_REPORT.md", "WEB_REPORT.md", "OPENAI_REPORT.md"])
        gate3 = validate_gate("qa", output_dir, ["QA_REPORT.md"])

        for gate in [gate1, gate2, gate3]:
            gate_file = output_dir / f"gate_{gate['gate_name']}.json"
            gate_file.write_text(json.dumps(gate, indent=2))
            if gate["passed"]:
                tracker.complete_gate(gate["gate_name"])

        # --- Write final summary ---
        summary = {
            "run_id": run_id,
            "objective": objective,
            "output_dir": str(output_dir),
            "final_output": result.final_output if result else "No output",
            "gates": {
                "planning": gate1["passed"],
                "specialist_reports": gate2["passed"],
                "qa": gate3["passed"],
            },
            "all_gates_passed": all(g["passed"] for g in [gate1, gate2, gate3]),
        }
        (output_dir / "summary.json").write_text(json.dumps(summary, indent=2))

        tracker.update(status="completed" if summary["all_gates_passed"] else "failed")
        print(f"\nRun {run_id} {'PASSED' if summary['all_gates_passed'] else 'FAILED'}")
        print(f"Output: {output_dir}")
        if result:
            print(f"\nFinal output:\n{result.final_output}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Entitlement OS multi-agent orchestrator")
    parser.add_argument("--objective", required=True, help="High-level task prompt")
    parser.add_argument("--slug", required=False, help="Output folder slug")
    parser.add_argument("--cost-ceiling", type=float, default=COST_CEILING_USD, help=f"Max USD spend (default: {COST_CEILING_USD})")
    parser.add_argument("--max-turns", type=int, default=MAX_TURNS, help=f"Max agent turns (default: {MAX_TURNS})")
    args = parser.parse_args()
    asyncio.run(run_orchestrator(args.objective, args.slug, args.cost_ceiling, args.max_turns))
```

**Step 2: Run lint check on the script**

```bash
python3 -m py_compile .codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py
```

Expected: No output (clean compile).

**Step 3: Commit**

```bash
git add .codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py
git commit -m "feat(agents-sdk): production-grade orchestrator — retries, gates, progress, cost tracking"
```

---

### Task 13: Update the Agents SDK SKILL.md with new CLI options

**Files:**
- Modify: `.codex/skills/codex-agents-sdk/SKILL.md`

**Step 1: Update the run configuration section**

Replace the existing "Run configuration" section with:

```markdown
## Run configuration

```bash
# Basic run:
python .codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py \
  --objective "Implement a new automation loop for X and add tests."

# With all options:
python .codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py \
  --objective "..." \
  --slug "automation-loop-name" \
  --cost-ceiling 10.0 \
  --max-turns 50

# Or use the wrapper:
./scripts/codex-auto/codex-agents-sdk.sh "objective" "slug"
```

## Monitoring a run

While the orchestrator runs, watch progress:

```bash
# Live progress:
watch -n 5 cat output/codex-agents-workflow/<slug>/progress.json

# Gate status:
cat output/codex-agents-workflow/<slug>/gate_*.json | jq '.gate_name, .passed'

# Final summary:
cat output/codex-agents-workflow/<slug>/summary.json | jq .
```
```

**Step 2: Commit**

```bash
git add .codex/skills/codex-agents-sdk/SKILL.md
git commit -m "docs(agents-sdk): update SKILL.md with new CLI options and monitoring"
```

---

## Layer 4: Cloud Codex Integration

> **Why last:** Requires the other layers to validate patterns. Enables true parallel autonomous development.

### Task 14: Create GitHub issue template for @codex tasks

**Files:**
- Create: `.github/ISSUE_TEMPLATE/codex-task.yml`

**Step 1: Write the issue template**

```yaml
name: Codex Task
description: Create a task for Codex to implement autonomously
title: "[codex] "
labels: ["codex", "automation"]
body:
  - type: markdown
    attributes:
      value: |
        This issue will be picked up by Cloud Codex when `@codex` is mentioned.
        Provide a clear objective, scope, and acceptance criteria.

  - type: textarea
    id: objective
    attributes:
      label: Objective
      description: What should Codex build or fix?
      placeholder: "Implement a new API endpoint for..."
    validations:
      required: true

  - type: dropdown
    id: scope
    attributes:
      label: Primary scope
      options:
        - "apps/web/ (frontend + API routes)"
        - "packages/openai/ (agents + tools)"
        - "packages/db/ (schema + migrations)"
        - "infra/ (gateway, docker, cloudflare)"
        - "scripts/ (automation, CI)"
        - "Multiple packages"
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      description: How do we know this is done?
      placeholder: |
        - [ ] New endpoint returns 200
        - [ ] Auth + orgId scoping enforced
        - [ ] pnpm lint && pnpm typecheck && pnpm test pass
    validations:
      required: true

  - type: textarea
    id: context
    attributes:
      label: Additional context
      description: Reference files, patterns, or prior work
      placeholder: "Follow the pattern in apps/web/app/api/deals/route.ts"

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - "P0 — Fix now"
        - "P1 — This sprint"
        - "P2 — Backlog"
      default: 1
```

**Step 2: Commit**

```bash
git add .github/ISSUE_TEMPLATE/codex-task.yml
git commit -m "feat(cloud): add GitHub issue template for @codex tasks"
```

---

### Task 15: Create Cloud Codex environment configuration

**Files:**
- Create: `scripts/codex-auto/cloud-codex-setup.md`

**Step 1: Write the setup guide**

```markdown
# Cloud Codex Setup Guide

## Prerequisites

1. ChatGPT Plus, Pro, Business, or Enterprise plan
2. GitHub repo connected at chatgpt.com/codex

## Setup Steps

### 1. Connect GitHub

1. Go to chatgpt.com/codex
2. Click "Connect GitHub"
3. Authorize the OpenAI GitHub App for `gallagher-property-company/gallagher-cres`

### 2. Configure environment

In the Cloud Codex environment settings:

**Setup command:**
```bash
corepack enable && pnpm install --frozen-lockfile
```

**Environment variables:**
- `NODE_OPTIONS`: `--max-old-space-size=4096`

**Internet access:** Enabled (needed for pnpm install)

### 3. Usage patterns

**From chatgpt.com/codex:**
- "Fix the failing CI on branch feat/xyz"
- "Add tests for apps/web/app/api/deals/route.ts"
- "Refactor the enrichment handler to use the resilient tool wrapper"

**From GitHub issues:**
- Create issue using the "Codex Task" template
- Add comment: `@codex please implement this`
- Codex creates a PR with the implementation

**From GitHub PRs:**
- Comment: `@codex fix the failing checks`
- Comment: `@codex add test coverage for the new endpoint`

### 4. Parallel execution

Cloud Codex runs tasks in isolated sandboxes. You can:
- Open multiple tasks simultaneously at chatgpt.com/codex
- Each gets its own environment, branch, and PR
- Review and merge independently

### 5. Limitations

- Cloud environments are ephemeral — no state between runs
- Cannot access the Windows server (no Tailscale)
- Cannot access production database
- Best for: code changes, tests, refactoring, documentation
- Not for: infrastructure ops, database migrations, server debugging
```

**Step 2: Commit**

```bash
git add scripts/codex-auto/cloud-codex-setup.md
git commit -m "docs(cloud): add Cloud Codex setup guide"
```

---

### Task 16: Create a unified pipeline runner

**Files:**
- Create: `scripts/codex-auto/pipeline.sh`

**Step 1: Write the pipeline script**

This is the top-level entry point that ties all 4 layers together.

```bash
#!/usr/bin/env bash
set -euo pipefail

# pipeline.sh — Unified Autonomous Development Pipeline
# Usage:
#   ./pipeline.sh fix           # Auto-fix current CI failures (L3)
#   ./pipeline.sh review <PR#>  # Review a PR (L3)
#   ./pipeline.sh dispatch <dir># Dispatch task files (L1)
#   ./pipeline.sh orchestrate   # Run multi-agent workflow (L2)
#   ./pipeline.sh nightly       # Full nightly sweep (all layers)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

CMD="${1:-help}"
shift || true

case "$CMD" in
  fix)
    echo "=== Layer 3: CI Autofix ==="
    "$SCRIPT_DIR/ci-fix.sh" "${1:-latest}"
    ;;

  review)
    PR_NUM="${1:?Usage: pipeline.sh review <PR-number>}"
    echo "=== Layer 3: PR Review ==="
    "$SCRIPT_DIR/review-pr.sh" "$PR_NUM"
    ;;

  dispatch)
    TASK_PATH="${1:?Usage: pipeline.sh dispatch <task-file-or-dir>}"
    echo "=== Layer 1: Dual-Brain Dispatch ==="
    "$SCRIPT_DIR/dispatch.sh" "$TASK_PATH"
    ;;

  orchestrate)
    OBJECTIVE="${1:?Usage: pipeline.sh orchestrate \"objective\" [slug]}"
    SLUG="${2:-}"
    echo "=== Layer 2: Multi-Agent Orchestration ==="
    python3 "$REPO_ROOT/.codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py" \
      --objective "$OBJECTIVE" \
      ${SLUG:+--slug "$SLUG"}
    ;;

  sweep)
    MODE="${1:-all}"
    echo "=== Layer 3: Code Sweep ==="
    "$SCRIPT_DIR/sweep.sh" "$MODE"
    ;;

  nightly)
    echo "=== Full Nightly Pipeline ==="
    "$SCRIPT_DIR/nightly.sh"
    ;;

  sentry)
    echo "=== Layer 3: Sentry Autofix ==="
    "$SCRIPT_DIR/sentry-autofix-loop.sh" "$@"
    ;;

  status)
    echo "=== Pipeline Status ==="
    echo ""
    echo "Latest dispatch:"
    ls -1t "$LOG_DIR"/dispatch-* 2>/dev/null | head -1 | xargs -I{} cat {}/summary.json 2>/dev/null || echo "  No dispatch runs found"
    echo ""
    echo "Latest orchestration:"
    ls -1td "$REPO_ROOT"/output/codex-agents-workflow/*/ 2>/dev/null | head -1 | xargs -I{} cat {}progress.json 2>/dev/null || echo "  No orchestration runs found"
    echo ""
    echo "Latest CI run:"
    gh run list --limit 3 --json status,conclusion,name,headBranch 2>/dev/null || echo "  gh CLI not available"
    ;;

  help|*)
    echo "Autonomous Development Pipeline"
    echo ""
    echo "Commands:"
    echo "  fix                    Auto-fix current CI failures (L3)"
    echo "  review <PR#>           Review a PR with Codex (L3)"
    echo "  dispatch <path>        Execute task YAML files via Codex (L1)"
    echo "  orchestrate \"obj\"      Run multi-agent workflow (L2)"
    echo "  sweep [all|types|auth] Run code quality sweep (L3)"
    echo "  nightly                Full nightly automation (all)"
    echo "  sentry [--max N]       Auto-fix Sentry issues (L3)"
    echo "  status                 Show latest pipeline status"
    echo ""
    echo "Quick examples:"
    echo "  ./pipeline.sh fix"
    echo "  ./pipeline.sh review 42"
    echo "  ./pipeline.sh dispatch /tmp/codex-tasks/my-feature/"
    echo "  ./pipeline.sh orchestrate \"Add buyer outreach email templates\""
    ;;
esac
```

**Step 2: Make executable and commit**

```bash
chmod +x scripts/codex-auto/pipeline.sh
git add scripts/codex-auto/pipeline.sh
git commit -m "feat(pipeline): unified autonomous development pipeline runner"
```

---

### Task 17: Final integration commit — update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (add Autonomous Pipeline section)

**Step 1: Add pipeline documentation to CLAUDE.md**

Add after the "CUA Browser Agent" section:

```markdown
## Autonomous Development Pipeline

4-layer autonomous coding pipeline connecting Claude Code (planning/review) with Codex CLI (implementation).

**Pipeline runner:** `scripts/codex-auto/pipeline.sh`

| Layer | What | Entry Point |
|-------|------|-------------|
| L1: Dual-Brain | Claude plans, Codex implements | `pipeline.sh dispatch <tasks/>` |
| L2: Agents SDK | Multi-agent orchestration with gates | `pipeline.sh orchestrate "objective"` |
| L3: CI/CD | Auto-fix failures, auto-review PRs | `pipeline.sh fix` / GitHub Actions |
| L4: Cloud | Parallel background via @codex | chatgpt.com/codex + issue templates |

**GitHub Actions:**
- `codex-autofix.yml` — Triggers on CI failure, opens fix PR
- `codex-review.yml` — Structured PR review on every PR

**Task dispatch:** Create YAML task files (schema: `scripts/codex-auto/schemas/task.schema.json`), run `pipeline.sh dispatch <dir>`.

**Multi-agent:** `pipeline.sh orchestrate "objective" [slug]` — PM coordinates DB/Web/OpenAI/QA agents with gated handoffs. Progress: `output/codex-agents-workflow/<slug>/progress.json`.
```

**Step 2: Commit all remaining changes**

```bash
git add CLAUDE.md
git commit -m "docs: add Autonomous Development Pipeline to CLAUDE.md"
```

---

## Verification Checklist

After all tasks are complete, verify each layer:

### L3: CI/CD
- [ ] `OPENAI_API_KEY` secret set in GitHub repo
- [ ] `codex-autofix.yml` visible in `gh workflow list`
- [ ] `codex-review.yml` visible in `gh workflow list`
- [ ] Test with deliberate lint failure → autofix PR created

### L1: Dual-Brain Dispatch
- [ ] `dispatch.sh` runs on a sample task YAML
- [ ] Results appear in `scripts/codex-auto/logs/dispatch-*/`
- [ ] `summary.json` generated with pass/fail counts

### L2: Agents SDK
- [ ] `entitlement_os_agents_sdk.py` compiles clean
- [ ] Test run with `--objective "List the agents" --max-turns 5`
- [ ] `progress.json` written during execution
- [ ] `gate_*.json` files generated
- [ ] `summary.json` with gate pass/fail

### L4: Cloud Codex
- [ ] GitHub issue template visible in "New Issue" dropdown
- [ ] Cloud Codex connected at chatgpt.com/codex (manual step)

### Pipeline Runner
- [ ] `pipeline.sh help` shows all commands
- [ ] `pipeline.sh status` shows recent runs
- [ ] `pipeline.sh fix` runs without error (even if nothing to fix)

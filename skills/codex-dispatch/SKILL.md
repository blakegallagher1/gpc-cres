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

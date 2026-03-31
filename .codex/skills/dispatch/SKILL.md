---
name: dispatch
description: "Dispatch structured task YAML files to Codex for headless execution. Use when the user says dispatch, hand off, send to codex, task handoff, or wants to break work into structured tasks for Codex to execute."
triggers:
  - "dispatch"
  - "hand off"
  - "send to codex"
  - "task handoff"
  - "dispatch task"
  - "create tasks"
---

# Task Dispatch Skill

Break work into structured YAML tasks and dispatch them to Codex CLI for headless execution.

## Quick Start

```bash
# Dispatch a directory of tasks:
./scripts/codex-auto/pipeline.sh dispatch /tmp/codex-tasks/my-feature/

# Dispatch a single task:
./scripts/codex-auto/pipeline.sh dispatch /tmp/my-task.yaml
```

## Creating Task Files

Use the template at `scripts/codex-auto/templates/task-template.yaml`:

```yaml
id: "unique-task-id"
title: "Short description of what to do"
description: |
  Detailed instructions for Codex. Be specific about:
  - Which files to create or modify
  - Which patterns to follow (reference existing files)
  - What the end state should look like
profile: "feature"          # feature | bugfix | review
scope:
  - "apps/web/app/api/"     # Directories Codex should focus on
depends_on: []              # Task IDs that must complete first
acceptance_criteria:
  - "Criterion 1"
  - "Criterion 2"
verification_command: "pnpm typecheck && pnpm test"
max_minutes: 10
```

Schema: `scripts/codex-auto/schemas/task.schema.json`

## Task Patterns for Entitlement OS

### Schema change + API + tests (3-task chain)
```
01-schema.yaml  → Add Prisma field, run generate
02-api.yaml     → Create API route (depends_on: 01)
03-tests.yaml   → Write tests (depends_on: 02)
```

### New agent tool (2-task chain)
```
01-tool.yaml    → Create tool in packages/openai/src/tools/
02-wire.yaml    → Wire into createConfiguredCoordinator() (depends_on: 01)
```

### Bug fix (single task)
```
fix.yaml        → Profile: bugfix, specific file + line reference
```

### Automation loop (2-task chain)
```
01-handler.yaml → Create handler in apps/web/lib/automation/handlers/
02-register.yaml → Register in handler registry (depends_on: 01)
```

## How Dependencies Work

Tasks run in filename order. If task B has `depends_on: ["task-a-id"]`, it only runs after task A succeeds. If A fails, B is skipped with status `blocked`.

## Execution Details

Each task runs as:
```bash
codex exec --profile <profile> --timeout <max_minutes>m \
  "Read these files: <scope>. <description>. Verify: <verification_command>"
```

## Results

Output lands in `scripts/codex-auto/logs/dispatch-<timestamp>/`:
```
dispatch-20260331-120000/
├── task-id.log              # Full Codex output
├── task-id.result.json      # {status, duration_seconds, error?}
├── .completed               # List of completed task IDs
└── summary.json             # {total, passed, failed, blocked, tasks: [...]}
```

## Tips

- Keep tasks small (5-10 min each) — Codex works better with focused instructions
- Always include `verification_command` — it's how dispatch knows if the task succeeded
- Reference existing code patterns explicitly: "Follow the pattern in apps/web/app/api/deals/[id]/route.ts"
- Use `scope` to limit what Codex reads — faster execution, better focus

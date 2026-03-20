---
name: codex-agents-sdk
description: "Use when you need Codex-driven multi-agent workflows with handoff-based coordination and Codex MCP, mapped to Entitlement OS teams."
triggers:
  - "codex agents sdk"
  - "multi-agent"
  - "handoff orchestration"
  - "agent workflow"
  - "mcp orchestration"
---

# Codex Agents SDK Workflow

Use this skill to run coordinated multi-agent coding workflows using the Agents SDK with Codex exposed as an MCP server.

## Why this exists

This workflow is a practical adaptation of the `building_consistent_workflows_codex_cli_agents_sdk.ipynb` patterns for Entitlement OS:

1. Start Codex CLI as an MCP server.
2. Create role-specific agents (Planner + engineers + QA).
3. Gate progress by required deliverables before advancing.
4. Keep prompts explicit and traceable.

## Entitlement OS role mapping

- Project Manager (`agent-manager`)
  - Owns task decomposition, sequencing, and gate validation.
  - Targets `ROADMAP.md`, `packages/`, and `docs/` outputs.
- Database Engineer (`agent-db`)
  - Works in `packages/db/`, `packages/shared/` (schema and core data contracts only).
  - Enforces migration safety and schema discipline.
- Agent Platform Engineer (`agent-openai`)
  - Works in `packages/openai/`, `packages/evidence/`, `packages/artifacts/`.
  - Enforces Responses API + schema invariants.
- Web Engineer (`agent-web`)
  - Works in `apps/web/`.
  - Preserves auth + org-scoping + route security patterns.
- Worker Engineer (`agent-worker`)
  - Works in `apps/worker/`.
  - Preserves idempotent and replay-safe workflow constraints.
- QA Reviewer (`agent-qa`)
  - Verifies acceptance criteria and writes a test plan in `output/codex-agents-workflow/`.

## Run configuration

```bash
cd /Users/gallagherpropertycompany/Documents/gallagher-cres
python -m pip install -U openai-agents openai python-dotenv
export OPENAI_API_KEY=...
export ENTITLEMENT_OS_AGENT_WORKFLOW_OUTPUT_DIR="${PWD}/output/codex-agents-workflow"
python .codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py \
  --objective "Implement a new automation loop for X and add tests."
```

If you run multiple workflows, set a unique slug:

```bash
python .codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py \
  --objective "..." \
  --slug "automation-loop-<short-name>"
```

Or use the repo wrapper:

```bash
./scripts/codex-auto/codex-agents-sdk.sh \
  "Implement a new automation loop for X and add tests." \
  "automation-loop-<short-name>"
```

## Core pattern (important)

1. Launch Codex MCP server:
   - `npx -y codex mcp-server`
2. Run one Project Manager agent that creates an explicit execution plan.
3. Specialists hand off only when required artifacts exist.
4. Use `approval-policy: never` and `sandbox: workspace-write` for any Codex MCP calls inside specialist prompts.
5. Keep `entitlement_os_agents_sdk.py` output folder as the execution workspace.

## Guardrails

- Do not bypass handoffs.
- Do not skip gating checks for deliverables.
- Do not relax security constraints (auth, org scope, input validation, idempotency).
- Do not call deprecated/legacy APIs unless requested.
- Keep all generated artifacts inside `output/codex-agents-workflow/<slug>/`.

## References

- `scripts/entitlement_os_agents_sdk.py` (starter implementation based on the notebook’s flow)
- `references/agent_graph.md` (runbook and decision mapping)
- `references/checks.md` (required gate checks before handoffs)

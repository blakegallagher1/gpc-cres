---
name: orchestrate
description: "Multi-agent feature builds using the OpenAI Agents SDK orchestrator. Use when the user says orchestrate, multi-agent, build feature, or wants a full feature built autonomously with PM/DB/Web/OpenAI/QA coordination."
triggers:
  - "orchestrate"
  - "multi-agent"
  - "build feature"
  - "autonomous build"
  - "agent build"
  - "full feature"
---

# Multi-Agent Orchestration Skill

Launch a coordinated multi-agent build where a PM agent plans the work and DB/Web/OpenAI/QA specialist agents implement it with gated handoffs.

## Quick Start

```bash
# Build a feature with auto-generated slug:
./scripts/codex-auto/pipeline.sh orchestrate "Add a deal comparison page"

# Build with explicit slug (for organized output):
./scripts/codex-auto/pipeline.sh orchestrate "Add buyer criteria filtering to the search API" "buyer-criteria-filter"
```

## How It Works

The orchestrator (`.codex/skills/codex-agents-sdk/scripts/entitlement_os_agents_sdk.py`) runs a 5-agent graph:

```
PM Agent (coordinator)
├── DB Agent      → Prisma schema, migrations, queries
├── Web Agent     → Next.js pages, API routes, components
├── OpenAI Agent  → Agent tools, coordinator wiring, prompts
├── Worker Agent  → Automation handlers, background jobs
└── QA Agent      → Tests, type checks, lint verification
```

### Agent Flow
1. **PM** breaks the objective into subtasks and assigns to specialists
2. Each specialist implements using `codex exec` via MCP
3. **Gate checks** between phases validate:
   - `pnpm typecheck` passes
   - `pnpm lint` passes
   - `pnpm test` passes
   - No `any` types introduced
4. **QA** runs final verification
5. Results written to output directory

## Configuration

| Parameter | Default | Override |
|-----------|---------|---------|
| Model | gpt-5.4 (from config.toml) | `CODEX_MODEL=gpt-5.4-mini` |
| Max turns | 30 | `--max-turns 50` |
| Cost ceiling | $5.00 | `--cost-ceiling 10.0` |
| Output dir | `output/codex-agents-workflow/<slug>/` | `AGENTS_OUTPUT_DIR=/tmp/out` |

## Example Prompts for Entitlement OS

### New API endpoint + UI
```bash
./scripts/codex-auto/pipeline.sh orchestrate \
  "Add a /api/deals/[id]/timeline endpoint that returns all automation_events for a deal. Add a Timeline tab to apps/web/app/deals/[id]/ that renders events in a vertical timeline with timestamps and status badges." \
  "deal-timeline"
```

### New agent tool
```bash
./scripts/codex-auto/pipeline.sh orchestrate \
  "Create a zoning-analysis tool in packages/openai/src/tools/ that calls the gateway /screening/zoning endpoint. Parse the response into a structured ZoningReport. Wire it into createConfiguredCoordinator(). Add 5 tests." \
  "tool-zoning-analysis"
```

### Schema migration + downstream
```bash
./scripts/codex-auto/pipeline.sh orchestrate \
  "Add a 'sourceChannel' field (enum: BROKER, DIRECT, AUCTION, REFERRAL) to the Deal model. Generate migration. Update deal creation API, intake handler, and deal detail UI." \
  "deal-source-channel"
```

### Automation loop
```bash
./scripts/codex-auto/pipeline.sh orchestrate \
  "Add a comp-pull automation loop that fetches comparable sales from the gateway when a parcel is enriched. Follow the pattern in apps/web/lib/automation/enrichment.ts. Include idempotency, org-scoping, and 5 tests." \
  "automation-comp-pull"
```

## Monitoring Progress

```bash
# Check progress during a run:
cat output/codex-agents-workflow/<slug>/progress.json

# Fields: run_id, objective, current_turn, max_turns, cost_usd, agents_active, gates_passed
```

## Output Structure

```
output/codex-agents-workflow/<slug>/
├── progress.json       # Live progress tracker
├── gate-results/       # Pass/fail for each gate check
├── agent-logs/         # Per-agent execution logs
└── summary.json        # Final results + cost
```

## Tips

- Start with a clear, specific objective — vague prompts produce vague results
- Include file paths and pattern references in the objective
- The $5 cost ceiling prevents runaway token usage — increase only for large features
- If a gate fails, the orchestrator retries up to 2 times before stopping
- Check `progress.json` to see which agent is currently active

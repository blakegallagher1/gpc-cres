---
name: temporal-knowledge-graph
description: "Use when you need temporally constrained KG retrieval and multi-step LLM tool orchestration for Entitlement OS facts."
triggers:
  - "temporal graph"
  - "knowledge graph"
  - "multi-hop retrieval"
  - "entity timeline"
  - "kg event"
---

# Temporal Knowledge Graph Agents

Use this skill to run a multi-step retrieval flow over Entitlement OS knowledge graph data (`KGEvent`, `TemporalEdge`) and enforce
timestamp-aware queries.

## Why this exists

The upstream notebook shows a production pattern:
1. Generate a plan for a research question.
2. Expose KG-specific tools (`factual_qa`, `trend_analysis`) to the model.
3. Enforce temporal validity windows and predicate normalization.
4. Iterate tool calls until the model returns final narrative output.

For Entitlement OS, this maps to:
- `KGEvent` rows as graph facts.
- `TemporalEdge` as optional historical/causal links.
- `run_type` and `evidence_hash` context from worker auto-feed.

## Entitlement OS wiring

- KG source: `packages/db` tables `KGEvent` and `TemporalEdge`.
- Retrieval inputs that can be reused:
  - `subject_id`: entity-like search term (`subject`, `deal`, `property`, etc.).
  - `predicate`: normalized relation (`owns`, `acquired`, `located_in`, etc.).
  - `timestamp` window: `start_date_range`, `end_date_range`.
- Optional local fallback: JSONL edge dump in `output/temporal-knowledge-graph/` for non-DB environments.

## Run it

```bash
cd /Users/gallagherpropertycompany/Documents/gallagher-cres
python -m pip install -U openai
export OPENAI_API_KEY=...
export DATABASE_URL=...   # Entitlement OS Postgres DSN
python .codex/skills/temporal-knowledge-graph/scripts/temporal_graph_workflow.py \
  --question "What changed in flood-related workflow outcomes for 2025 between EBR and Jefferson Parish?"
```

Optional output directory for traces:

```bash
export ENTITLEMENT_OS_KG_WORKFLOW_DIR="${PWD}/output/temporal-knowledge-graph"
```

## Reference workflow (from notebook pattern)

- Planner prompt stage:
  - `initial_planner(question)` generates a concise task list.
- Tool stage:
  - `factual_qa(entity, start_date_range, end_date_range, predicate)`
  - `trend_analysis(question, companies, start_date_range, end_date_range, topic_filter)`
- Loop:
  - model requests function calls
  - executor runs functions
  - append tool outputs
  - continue until model returns final response

## Implementation guardrails

- Do not emit conclusions outside returned tool results.
- Enforce `end_date_range >= start_date_range`.
- Keep predicate checks strict with known relation normalization.
- Cap tool arguments for query safety; always require date bounds or a conservative fallback window.
- Save generated traces in `ENTITLEMENT_OS_KG_WORKFLOW_DIR`.

## References

- `references/patterns.md` (high-level adaptation summary)
- `references/patterns-map.md` (notebook pattern to script mapping)
- `references/db-schema.md` (KGEvent and TemporalEdge field notes)

# Notebook-to-Repo Patterns Map

Source notebook:
- `examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents.ipynb`

## Planner stage

- Notebook pattern: `initial_planner(question)` creates a step list before tool execution.
- Repo mapping: `.codex/skills/temporal-knowledge-graph/scripts/temporal_graph_workflow.py`
  - planner prompt function builds retrieval plan before function-call loop.
  - output plan is persisted into run artifact JSON under workflow output directory.

## Tool contracts

- Notebook pattern: strict tool schemas for `factual_qa` and `trend_analysis`.
- Repo mapping: `.codex/skills/temporal-knowledge-graph/scripts/temporal_graph_workflow.py`
  - both tools enforce typed args.
  - both tools reject inverted date windows (`start_date_range > end_date_range`).

## Function-call loop

- Notebook pattern: execute tool calls iteratively until no further `function_call` output is emitted.
- Repo mapping: `.codex/skills/temporal-knowledge-graph/scripts/temporal_graph_workflow.py`
  - iterative loop dispatches tools, appends tool outputs, and continues until final response.
  - full trace of calls and outputs is written to artifact JSON.

## Predicate normalization

- Notebook pattern: normalize relation strings before querying.
- Repo mapping: `.codex/skills/temporal-knowledge-graph/scripts/temporal_graph_workflow.py`
  - canonical dictionary + fuzzy normalization for predicate aliases.
  - prevents query misses from spelling/alias drift.

## Data layer adaptation

- Notebook pattern: retrieve factual edges and temporal trends from a knowledge graph backend.
- Repo mapping: `.codex/skills/temporal-knowledge-graph/scripts/temporal_graph_workflow.py`
  - primary source: `KGEvent` records (`subject_id`, `predicate`, `object_id`, `timestamp`, `confidence`, `source_hash`).
  - optional adjacency context: `TemporalEdge` reads for related link paths.
  - fallback source: JSONL file from `ENTITLEMENT_OS_KG_FALLBACK_FILE` when DB is unavailable.

## Artifact discipline

- Notebook pattern: preserve intermediate reasoning traces for inspection.
- Repo mapping: `.codex/skills/temporal-knowledge-graph/scripts/temporal_graph_workflow.py`
  - writes run artifact to `ENTITLEMENT_OS_KG_WORKFLOW_DIR`.
  - includes question, normalized tool inputs, tool outputs, and final answer.

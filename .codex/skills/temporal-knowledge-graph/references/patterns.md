# Pattern Mapping from `temporal_agents.ipynb`

## Directly reused
- `initial_planner`: convert a user question into concrete retrieval tasks.
- `tools` + `function call loop`: `factual_qa`/`trend_analysis` execution path.
- strict temporal window validation: reject inverted ranges.
- predicate normalization before query execution.
- structured output artifacts (what tools were called + arguments + raw outputs).

## Entitlement OS adaptation
- Graph storage: use `KGEvent` rows as fact edges.
- Time filtering: map notebook's validity window to `KGEvent.timestamp` and confidence-weighted ranking.
- Temporal sequence: include optional `TemporalEdge` reads when returning evidence paths.
- Output directory: keep all run artifacts in `output/temporal-knowledge-graph/`.

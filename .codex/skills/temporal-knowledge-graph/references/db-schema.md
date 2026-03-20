# Entitlement OS Temporal KG Data Sources

- `packages/db/prisma/migrations/20260216000000_data_agent_2_0/migration.sql`
  - `KGEvent(id, subject_id, predicate, object_id, timestamp, confidence, source_hash)`
  - `TemporalEdge(id, from_event, to_event, relation)`

- `packages/openai/src/dataAgent/retrieval.ts` already performs hybrid retrieval and emits retrieval metadata.
- `apps/worker/src/dataAgentAutoFeed.service.ts` currently persists KG rows from run citations.

Recommended query shape for this workflow:
- subject/object/predicate contains `<query>`
- timestamp between `[start_date_range, end_date_range]`
- ordered by `timestamp DESC, confidence DESC`
- optional cap at 200 rows for tool response size control

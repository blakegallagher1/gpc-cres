# Data Agent 2.0 Memory and Retrieval Architecture

This implementation adds a production-oriented memory layer with:

- Structured episodic memory (`Episode`)
- Knowledge graph events (`KGEvent`)
- Temporal graph edges (`TemporalEdge`)
- Reinforcement signals (`RewardSignal`)
- Vector and sparse embedding support in `KnowledgeEmbedding`
- Hybrid retrieval with semantic + sparse + graph ranking
- Reflection pipeline to extract graph facts and refresh embeddings
- Reinforcement API for feedback capture
- OpenTelemetry-ready logging/observability

## 1) Setup

### Environment Variables

Create a `.env` file:

```bash
OPENAI_API_KEY=sk-...
OPENAI_SUMMARY_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:4318
```

### Install

```bash
npm install
```

### Migrations

```bash
npx prisma migrate dev --schema=./prisma/schema.prisma
```

### Start

```bash
npm run dev
```

### Tests

```bash
npm test
```

## 2) Database Migration Files

Migration:

- `prisma/migrations/20260216000000_data_agent_2_0/migration.sql`

Schema:

- `prisma/schema.prisma`

The migration:

- Enables extensions:
  - `pgvector`
  - `pg_trgm`
- Adds `vector_embedding` to `KnowledgeEmbedding`
- Creates:
  - `Episode`
  - `KGEvent`
  - `TemporalEdge`
  - `RewardSignal`

Query index examples used by the migration:

```sql
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "KnowledgeEmbedding" ADD COLUMN IF NOT EXISTS "vector_embedding" vector(1536);
CREATE INDEX idx_episode_summary_trgm ON "Episode" USING GIN ("summary" gin_trgm_ops);
CREATE INDEX idx_kgevent_subject_trgm ON "KGEvent" USING GIN ("subject_id" gin_trgm_ops);
```

## 3) API / CLI Usage

### runRetrieval(query, subjectId?)

```ts
import { runRetrieval } from "./commands/retrieve";

await runRetrieval("find permit approvals from 2024", "subject-123");
```

### reflectAndUpdateMemory(episode)

```ts
import { reflectAndUpdateMemory } from "./services/reflection.service";

await reflectAndUpdateMemory({
  id: "ep-1",
  runId: "run-1",
  createdAt: new Date().toISOString(),
  agentIntent: "review permit",
  evidenceHash: "hash-1",
  retrievalMeta: { source: "agent" },
  modelOutputs: {
    knowledgeTriples: [
      { subjectId: "agent", predicate: "observed", objectId: "permit-grant" },
    ],
  },
  confidence: 0.9,
  outcomeSignal: null,
  nextStateHash: null,
  summary: "Permit approved by local board.",
});
```

### createEpisodeFromRun(run)

```ts
import { createEpisodeFromRun } from "./services/episode.service";

await createEpisodeFromRun({
  runId: "run-1",
  agentIntent: "perform compliance review",
  evidenceHash: "hash-1",
  retrievalMeta: { source: "retrieval" },
  modelOutputs: { finalOutput: "approved" },
  confidence: 0.84,
  outcomeSignal: "awaiting_followup",
  nextStateHash: "ns-123",
});
```

### addRewardSignal(episodeId, userScore, autoScore)

```ts
import { addRewardSignal } from "./services/reward.service";

await addRewardSignal("ep-1", 5, 0.92);
```

## 4) Key Query Examples

### Semantic vector search against `KnowledgeEmbedding`

```sql
SELECT id, content_text
FROM "KnowledgeEmbedding"
ORDER BY "vector_embedding" <=> '[0.1,0.2,0.3]'::vector
LIMIT 10;
```

### Trigram lexical search

```sql
SELECT id, content_text
FROM "KnowledgeEmbedding"
WHERE content_text % 'permit'
ORDER BY similarity(content_text, 'permit') DESC
LIMIT 10;
```

### KG event lookup

```sql
SELECT * FROM "KGEvent"
WHERE subject_id = 'deal-1'
ORDER BY confidence DESC, "timestamp" DESC;
```

## 5) Observability

- Retrieval logging and counters in `utils/logger.ts`
- Trace spans via `openTelemetry/setup.ts`
- Log/trace correlation keys are query hashes produced by simple deterministic hashing.


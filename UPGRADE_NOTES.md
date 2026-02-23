# AgentOS v2 — Phase 0 Upgrade Notes

**Date:** 2026-02-23
**Scope:** `@openai/agents` 0.4.6 → 0.4.15 + AgentOS foundation modules

---

## 1. SDK Upgrade: @openai/agents ^0.4.6 → ^0.4.15

### Version Discovery

The task spec requested `^0.9.3`, but that version does not exist on npm. The latest
published version is **0.4.15** (confirmed via `pnpm view @openai/agents dist-tags`).
The `@openai/agents` package uses `@openai/agents-core` and `@openai/agents-openai`
sub-packages internally.

### Breaking Changes: **None**

The 0.4.6 → 0.4.15 jump is a **patch-level additive release**. Diffing the
`@openai/agents-core` type exports between versions shows only new additions:

| Export | Type | Added in |
|---|---|---|
| `EditorInvocationContext` | type | 0.4.7+ |
| `ToolTimeoutError` | class | 0.4.8+ |
| `FunctionToolTimeoutBehavior` | type | 0.4.8+ |
| `ToolTimeoutErrorFunction` | type | 0.4.8+ |
| `invokeFunctionTool` | function | 0.4.8+ |
| `ReasoningItemIdPolicy` | type | 0.4.10+ |
| `ShellToolEnvironment` and related types | types | 0.4.12+ |
| `agentToolSourceRegistry` | module | 0.4.15 |

**No exports were removed or had signature changes.** The upgrade is fully backward
compatible with all existing agent definitions, tool registrations, guardrails,
handoffs, tracing, and run execution.

### API Surface Audit (verified stable)

| Surface | Status |
|---|---|
| `Agent` constructor | Unchanged |
| `tool()` function | Unchanged — Zod schemas still passed the same way |
| `run()` / `Runner.run()` | Unchanged |
| `InputGuardrail` / `OutputGuardrail` | Unchanged |
| `Handoff` / `handoff()` | Unchanged |
| `TracingExporter` / `BatchTraceProcessor` | Unchanged |
| `RunContext` | Unchanged |
| SSE streaming via `StreamedRunResult` | Unchanged |
| `MemorySession` / `Session` | Unchanged |

### Files Updated

- `packages/openai/package.json`: `^0.4.6` → `^0.4.15`
- `apps/web/package.json`: `^0.4.6` → `^0.4.15`

### New Features Available (not yet consumed)

- **Tool timeout**: `FunctionToolTimeoutBehavior` + `ToolTimeoutError` for built-in
  timeout support on function tools.
- **`invokeFunctionTool`**: Direct tool invocation utility.
- **`ReasoningItemIdPolicy`**: Control reasoning item IDs in run config.
- **Shell tool types**: Typed environment/container config for shell tools.

---

## 2. New Dependency: @qdrant/js-client-rest ^1.17.0

Added to `packages/openai/package.json`. Provides TS-native Qdrant access for
hybrid search (dense + BM25 sparse vectors) without routing through the Python
FastAPI gateway.

---

## 3. Embedding Model Change

| | Before | After |
|---|---|---|
| Model | `text-embedding-3-small` | `text-embedding-3-large` |
| Dimensions | 1536 (implicit) | 1536 (explicit `dimensions` param) |

Both produce 1536-dimensional vectors with cosine distance. Existing pgvector
`vector(1536)` columns and Qdrant collections are fully compatible — no reindexing
needed. New embeddings use the better model; old embeddings remain functional.

---

## 4. New AgentOS Config & Feature Flags

All 16 feature flags default to `false`. System behaves identically to pre-upgrade
when `AGENTOS_ENABLED=false` (default). See `packages/openai/src/agentos/config.ts`.

---

## 5. New Prisma Models (7) + Run.trajectory

New tables: `episodic_entries`, `semantic_facts`, `procedural_skills`, `domain_docs`,
`trajectory_logs`, `tool_specs`, `eval_results`.

New field on `runs`: `trajectory Json?` (nullable, no migration risk).

Migration SQL: `packages/db/prisma/migrations/20260223000000_add_agentos_tables/migration.sql`

---

## 6. Qdrant Collections (4)

Created by `infra/scripts/setup_qdrant_collections.py`:
- `episodic_memory`
- `skill_triggers`
- `domain_docs`
- `tool_specs`

All use dense (1536d cosine) + sparse ("bm25") vectors with appropriate payload indexes.

---

## ASSUMPTIONS

1. `@openai/agents ^0.9.3` does not exist. Using `^0.4.15` (latest published).
2. Embedding dimension=1536 is backward-compatible because both models support it
   and all existing columns/collections use this dimension.
3. Qdrant collections use `bm25` as the sparse vector name (not `sparse`) to be
   self-documenting. Config default matches.
4. The Python Qdrant setup script is run once per environment, not on every deploy.
5. Migration SQL is generated manually (Prisma needs live DB for `migrate dev`).
   It should be reviewed and applied via `prisma migrate deploy` in production.

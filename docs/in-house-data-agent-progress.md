# OpenAI In-House Data Agent Capabilities — Implementation Roadmap

Date started: 2026-02-14

This document maps the capabilities described in OpenAI’s in-house data agent to the current Entitlement OS implementation, with explicit progress tracking.

## Progress Legend

- ✅ Done
- 🚧 In progress
- 🧭 Planned
- ⛔ Blocked

## 0) Current Implementation Snapshot (as of 2026-02-14)

- ✅ Temporal-first agent execution with fallback path exists for long-running tasks.
- ✅ Duplicate protection for local fallback with run-id-scoped lease and completed-run replay checks.
- ✅ Structured run-state contract shared between web and shared packages.
- ✅ Run persistence now stores schema-typed `runState`.
- ✅ Contract tests added for shared run-state typing and persisted web payload shape.
- ✅ Correlation idempotency for local fallback now includes explicit lease-token propagation into local execution persistence.
- ✅ Automation event DB-noise reduced in tests via service-layer mocking.
- ✅ Dashboard recent-runs output is now deterministically ordered by `startedAt` descending before response shaping.
- ✅ Fixed a parser-blocking syntax issue in `apps/web/lib/hooks/useRunDashboard.ts` that also resolved lint/build warnings.
- ✅ Verification loop and in-repo stream parity updates are complete for current web/workflow paths.
- ✅ Added `useChat` `agent_progress` handling for run-state-first assistant rendering.
- ✅ Defaulted test bootstrap `DATABASE_URL` in `apps/web/test-utils/setup.ts` to remove unrelated env warnings.
- ✅ Added reproducibility guardrails with deterministic source manifest hashing and agent replay output parity validation.

## 1) Core Architecture Alignment

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Durable orchestration for agent workflows | ✅ | `apps/worker/src/activities/openai.ts`, `apps/web/lib/agent/agentRunner.ts` | Add richer workflow telemetry dashboards and explicit retry trace context. |
| Unified structured schemas for all agent outputs | ✅ | `packages/shared/src/temporal/types.ts`, `apps/web/lib/agent/executeAgent.ts` | Expand dashboard-safe decoding in API surfaces (next phase). |
| Strong audit trail on each reasoning step | ✅ | `apps/web/lib/agent/agentRunner.ts`, `apps/web/lib/services/automationEvent.service.ts` | Add dashboard-level trace context and evidence hashes in a follow-up. |
| Real-time event streaming | ✅ | `apps/web/lib/agent/agentRunner.ts`, `apps/web/lib/chat/useChat.ts` | Maintain full `agent_progress` contract with `runState`, `toolsInvoked`, and latest agent name. |
| Correlation IDs across Temporal and local fallback | ✅ | `apps/web/lib/agent/agentRunner.ts` | Add guaranteed correlation in all async handoff points and external callbacks. |
| Duplicate suppression and replay protection | ✅ | `apps/web/lib/agent/agentRunner.ts` | Add reconciliation summary metrics and stale lease alerting. |
| Correlation propagation in Temporal/local run persistence | ✅ | `apps/worker/src/activities/openai.ts`, `apps/web/lib/agent/executeAgent.ts`, `apps/web/lib/agent/agentRunner.ts` | Add metrics for cross-instance duplicate avoidance and stale-lease diagnostics. |

## 2) Data Understanding & Discovery

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Context-aware planner/router | ✅ | `apps/web/lib/agent/agentRunner.ts`, `apps/web/lib/agent/executeAgent.ts`, `apps/worker/src/activities/openai.ts` | Added mandatory proof-path enforcement and fail-closed downgrade when required evidence groups are missing for inferred intent. |
| Multi-source retrieval with source ranking | ✅ | `apps/web/app/api/cron/source-ingestion/route.ts` | Add stale-source prioritization across jurisdictions and manifest-based manifest replay checks. |
| Scheduler + retry-aware ingestion pipeline | ✅ | `apps/web/app/api/cron/source-ingestion/route.ts`, `apps/web/vercel.json` | Added scheduled cron execution plus rank-based capture retries and retry-aware metric output in persisted run payloads. |
| Source quality and freshness metadata | ✅ | `apps/web/app/api/cron/source-ingestion/route.ts` | Add confidence decay/quality buckets + stale-ratio trend fields to all persisted outputs. |

## 3) Evidence, Citation, and Verification

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Stable evidence hash + hash continuity checks | ✅ | `apps/web/lib/agent/executeAgent.ts`, `apps/web/lib/agent/agentRunner.ts` | Extend hashes to persisted artifacts and run outputs. |
| Unified citations across triage/packs/runs | ✅ | `packages/shared/src/temporal/types.ts`, `apps/web/lib/agent/executeAgent.ts`, `apps/web/app/api/cron/source-ingestion/route.ts`, `apps/worker/src/activities/openai.ts`, `apps/web/app/api/cron/parish-pack-refresh/route.ts` | Citation records and evidence hashes are now persisted for agent runs, triage runs, parish-pack refresh runs, and source-ingestion runs. |
| Schema-validated final reports | ✅ | `apps/web/lib/agent/executeAgent.ts` + `packages/shared/src/schemas/agentReport.ts` | Add report-level regression suite for malformed/partial JSON fallback behavior. |
| Evidence completeness enforcement before success | ✅ | `apps/web/lib/agent/executeAgent.ts`, `apps/worker/src/activities/openai.ts` | Added proof-group enforcement and failure summary injection in final trust/run state. |

## 4) Intelligence Reliability & Safety

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Agent state + confidence instrumentation | ✅ | `packages/shared/src/temporal/types.ts`, `apps/web/lib/agent/executeAgent.ts` | Add UI dashboard visualizing confidence over time per run/agent. |
| Duplicate-safe failover policy | ✅ | `apps/web/lib/agent/agentRunner.ts` | Add chaos-recovery tests for partial DB writes and Temporal startup failures. |
| Missing-evidence escalation and retry policy | ✅ | `apps/web/lib/agent/executeAgent.ts`, `apps/worker/src/activities/openai.ts`, `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts` | Add policy threshold telemetry and persisted retry envelope in run-state and output JSON. |
| Optional fallback with preserved lineage | ✅ | `apps/web/lib/agent/agentRunner.ts` | Add policy-level retry limits and dedupe across duplicate local fallbacks (next: dashboarding). |

## 5) Operationalization & Productization

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Agent-state dashboards (plan, confidence, retries) | ✅ | `apps/web/app/runs/*`, `apps/web/app/api/runs/*` | Add confidence-over-time visualizations and persisted trace events (tool calls, proof checks, retries). |
| Evidence and run audit explorer | ✅ | `apps/web/app/evidence/page.tsx`, `apps/web/app/api/evidence/route.ts`, `apps/web/app/runs/[runId]/page.tsx` | Expand with dedicated audit event timeline + per-source snapshot drill-down (next milestone). |
| Source ingestion staleness alerts | ✅ | `apps/web/app/api/cron/source-ingestion/route.ts` | Add stale-ratio thresholding + top-offender alert payload with manifest-backed evidence context. |
| End-to-end reproducibility checks | ✅ | `packages/shared/src/evidence.ts`, `packages/shared/test/source-manifest-hash.test.ts`, `apps/web/lib/agent/__tests__/executeAgent.runState-contract.test.ts` | Add CI scheduling for periodic reproducibility smoke jobs. |

## 6) Done List (Committed so far)

- Explicit local run lease for duplicate protection across cross-instance fallbacks.
- Shared schema-typed runState constants and types.
- Persisted run output now uses typed `runState` contract.
- Added `packages/shared` temporal contract tests.
- Added `apps/web` web-layer contract test for persisted `run.outputJson`.
- Reduced automation-event DB warnings in tests by mocking instrumentation service at unit-test layer.
- Added `agent_progress` event support in `apps/web/lib/chat/useChat.ts` and `apps/web/lib/chat/types.ts` contract.
- Added `apps/web/test-utils/setup.ts` default `DATABASE_URL` fixture for deterministic test logging.
- Added fallback-path run-state metadata capture in `apps/web/lib/agent/agentRunner.ts` and wired local fallback execution to preserve runId + metadata.
- Added proof checks, retry metadata, and fallback lineage/reason rendering in `apps/web/components/agent-state/AgentStatePanel.tsx`, plus run-page/chat propagation.
- ✅ Added `/api/runs/dashboard` and `/runs/dashboard` endpoints/pages with confidence, retry, fallback, and tool-failure intelligence surfaces.
- ✅ Added `apps/web/lib/hooks/useRunDashboard.ts` and API aggregation contract tests for run dashboard payload.
- ✅ Added deterministic source manifest hashing and replay-stability checks for persisted `run.outputJson` so equivalent runs produce identical stable payloads.

## 7) Next 3 Recommended Execution Steps

1. Add periodic reproducibility smoke runs in CI for source-ingestion and agent replay paths.
2. Add explicit chaos coverage for cross-instance local-fallback lease races and stale-run recovery.
3. Expand dashboards to surface reproducibility variance alerts when hash continuity drifts.

## 8) New Progress Notes (2026-02-14)

- ✅ Evidence rows in `/evidence` now expose the producing `runId` from latest snapshots and link directly to run detail pages.
- ✅ Run dashboard now provides `/api/runs/dashboard` + `/runs/dashboard` for operational telemetry: confidence trend, retry/fallback activity, missing evidence, and tool-failure summaries.
- ✅ `apps/web/lib/hooks/useRunDashboard.ts` query builder is syntax-correct and verified against lint/build.
- ✅ Added deterministic `recentRuns` sorting by `startedAt` in `/api/runs/dashboard` and companion coverage in test suite.
- ✅ Added ranked source ingestion manifest pipeline in `apps/web/app/api/cron/source-ingestion/route.ts` with quality buckets, stale-ratio metrics, source manifest hashing, evidence citations, and hash continuity.
- ✅ Wired missing-evidence retry envelope through web and worker agent finalization, and locked it in the shared + web contract tests.
- ✅ Closed the unified citations loop by persisting stable source citations/hashes for triage outputs, parish-pack refresh outputs, and source-ingestion artifacts.

## 9) Verification Log

- 2026-02-14 13:25:00 UTC: `pnpm typecheck` ✅
- 2026-02-14 13:28:00 UTC: `pnpm lint` initially ❌ due parser issue in `apps/web/lib/hooks/useRunDashboard.ts` line 89, fixed immediately.
- 2026-02-14 13:29:00 UTC: `pnpm lint` ✅
- 2026-02-14 13:29:20 UTC: `pnpm test` ✅
- 2026-02-14 13:30:00 UTC: `pnpm build` with placeholder env vars ✅

Status for each upcoming step should be updated here as soon as work begins.

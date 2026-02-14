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
- ✅ Automation event DB-noise reduced in tests via service-layer mocking.
- ✅ Basic verification loop has been executed after prior changes (`lint`, `typecheck`, `test`, `build`).

## 1) Core Architecture Alignment

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Durable orchestration for agent workflows | ✅ | `apps/worker/src/activities/openai.ts`, `apps/web/lib/agent/agentRunner.ts` | Add richer workflow telemetry dashboards and explicit retry trace context. |
| Unified structured schemas for all agent outputs | 🚧 | `packages/shared/src/temporal/types.ts`, `apps/web/lib/agent/executeAgent.ts` | Add end-to-end schema validation at API boundaries and dashboard-safe decoding checks. |
| Strong audit trail on each reasoning step | 🚧 | `apps/web/lib/agent/agentRunner.ts`, `apps/web/lib/services/automationEvent.service.ts` | Expand persisted trace schema for tool calls, proof checks, and retries. |
| Real-time event streaming | ✅ | `apps/web/lib/agent/agentRunner.ts` (stream updates + progress events) | Migrate from best-effort delta to richer progress event contract. |
| Correlation IDs across Temporal and local fallback | ✅ | `apps/web/lib/agent/agentRunner.ts` | Add guaranteed correlation in all async handoff points and external callbacks. |
| Duplicate suppression and replay protection | ✅ | `apps/web/lib/agent/agentRunner.ts` | Add reconciliation summary metrics and stale lease alerting. |

## 2) Data Understanding & Discovery

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Context-aware planner/router | 🚧 | `apps/web/lib/agent/agentRunner.ts`, `apps/web/lib/agent/executeAgent.ts` | Add mandatory proof-path enforcement per query intent (planner + policy checks). |
| Multi-source retrieval with source ranking | 🧭 | N/A | Add source discovery scheduler and quality-based ranking. |
| Scheduler + retry-aware ingestion pipeline | 🧭 | N/A | Build recurring source ingestion job set with staleness scoring and failure alerts. |
| Source quality and freshness metadata | 🧭 | N/A | Extend evidence schema with freshness, confidence decay, and staleness flags. |

## 3) Evidence, Citation, and Verification

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Stable evidence hash + hash continuity checks | ✅ | `apps/web/lib/agent/executeAgent.ts`, `apps/web/lib/agent/agentRunner.ts` | Extend hashes to persisted artifacts and run outputs. |
| Unified citations across triage/packs/runs | 🚧 | `packages/shared/src/temporal/types.ts`, `apps/web/lib/agent/executeAgent.ts` | Include citations in all persisted run artifacts (including retry and fallback outcomes). |
| Schema-validated final reports | ✅ | `apps/web/lib/agent/executeAgent.ts` + `packages/shared/src/schemas/agentReport.ts` | Add report-level regression suite for malformed/partial JSON fallback behavior. |
| Evidence completeness enforcement before success | 🚧 | `apps/web/lib/agent/executeAgent.ts` | Tighten mandatory-finding checks for tool-specific proofs. |

## 4) Intelligence Reliability & Safety

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Agent state + confidence instrumentation | ✅ | `packages/shared/src/temporal/types.ts`, `apps/web/lib/agent/executeAgent.ts` | Add UI dashboard visualizing confidence over time per run/agent. |
| Duplicate-safe failover policy | ✅ | `apps/web/lib/agent/agentRunner.ts` | Add chaos-recovery tests for partial DB writes and Temporal startup failures. |
| Missing-evidence escalation and retry policy | 🚧 | `apps/web/lib/agent/executeAgent.ts` | Add explicit escalation thresholds and auto-retry envelopes. |
| Optional fallback with preserved lineage | 🚧 | `apps/web/lib/agent/agentRunner.ts` | Persist fallback lineage and merge with live run record state transitions. |

## 5) Operationalization & Productization

| Capability | Status | Implementation location | Next action |
|---|---|---|---|
| Agent-state dashboards (plan, confidence, retries) | 🚧 | `apps/web/app/runs/*`, `apps/web/app/api/runs/*` | Add confidence-over-time visualizations and persisted trace events (tool calls, proof checks, retries). |
| Evidence and run audit explorer | 🚧 | `apps/web/app/evidence/page.tsx`, `apps/web/app/api/evidence/route.ts`, `apps/web/app/runs/[runId]/page.tsx` | Add evidence source drill-down pages + link evidence snapshots to run detail. |
| Source ingestion staleness alerts | 🧭 | N/A | Add scheduled checks + alerting on stale sources and ingestion failures. |
| End-to-end reproducibility checks | 🧭 | N/A | Add deterministic replay tests for major run paths. |

## 6) Done List (Committed so far)

- Explicit local run lease for duplicate protection across cross-instance fallbacks.
- Shared schema-typed runState constants and types.
- Persisted run output now uses typed `runState` contract.
- Added `packages/shared` temporal contract tests.
- Added `apps/web` web-layer contract test for persisted `run.outputJson`.
- Reduced automation-event DB warnings in tests by mocking instrumentation service at unit-test layer.

## 7) Next 3 Recommended Execution Steps

1. Add `runState` dashboard endpoints + UI pages to visualize current run progression and failures.
2. Add planner/router enforcement checks in `agentRunner` and fail-fast policy when proof path is incomplete.
3. Start source-ingestion discovery pipeline with freshness scoring and staleness alerts.

Status for each upcoming step should be updated here as soon as work begins.

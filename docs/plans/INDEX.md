# Plan Index

Last reviewed: 2026-04-09

## Purpose

This file is the central index for `docs/plans/`.

It exists because the repo has accumulated many plan/design/implementation documents, but only a subset are actively reflected in `ROADMAP.md`. This index makes that drift explicit instead of silently assuming every plan is still active.

## Status Legend

- `In Progress`: actively represented in `ROADMAP.md` or an open operational gap
- `Done`: completed and evidenced in current docs/roadmap
- `Deferred`: intentionally not active
- `Untracked historical`: document exists, but no current roadmap status/evidence has been reconciled yet

## Registry

| Plan | Status | Evidence / note |
|---|---|---|
| `2026-03-21-map-intelligence-screening.md` | In Progress | Screening remains operationally broken in production per `CLAUDE.md`; see `docs/runbooks/SCREENING_INCIDENT_RUNBOOK.md` |
| `2026-03-22-parcel-intelligence-spine-design.md` | Untracked historical | Requires reconciliation against current parcel-set planner/runtime |
| `2026-03-22-parcel-intelligence-spine-phase1.md` | Untracked historical | Requires explicit acceptance-state review |
| `2026-03-23-gateway-proxy-design.md` | Done | Gateway proxy is live and documented in `CLAUDE.md` |
| `2026-03-23-gateway-proxy-implementation.md` | Done | Gateway proxy worker, D1 fallback, and sync path are live |
| `2026-03-23-map-nl-intelligence-design.md` | Untracked historical | Not currently represented as an active roadmap item |
| `2026-03-23-sidebar-redesign-design.md` | Untracked historical | Historical design reference only until re-added to roadmap |
| `2026-03-25-agent-learning-tuning.md` | Untracked historical | Agent-learning work exists, but this plan is not currently indexed in roadmap |
| `2026-03-25-codex-cloud-setup.md` | Untracked historical | Historical setup/reference document |
| `2026-03-25-cua-browser-agent-design.md` | Done | CUA browser agent documented as deployed in `CLAUDE.md` |
| `2026-03-25-cua-browser-agent-implementation.md` | Done | Browser task + worker + UI integration shipped |
| `2026-03-25-single-agent-consolidation-design.md` | Untracked historical | Requires explicit roadmap reconciliation |
| `2026-03-25-single-agent-implementation.md` | Untracked historical | Requires explicit roadmap reconciliation |
| `2026-03-26-da007-agent-learning-runtime.md` | Untracked historical | Runtime exists, but this plan is not centrally statused today |
| `2026-03-26-map-ui-redesign.md` | Untracked historical | Historical UI plan pending reconciliation |
| `2026-03-26-server-reliability-phase1-design.md` | Untracked historical | Parts are live (Tailscale path), but completion evidence is fragmented |
| `2026-03-26-server-reliability-phase1-implementation.md` | Untracked historical | Needs explicit pass/fail evidence for watchdog/monitoring scope |
| `2026-03-27-map-modernization-plan.md` | Untracked historical | Not presently indexed in `ROADMAP.md` |
| `2026-03-27-map-stack-modernization-design.md` | Untracked historical | Not presently indexed in `ROADMAP.md` |
| `2026-03-27-p0-platform-enhancements.md` | Untracked historical | Historical enhancement track; completion state needs reconciliation |
| `2026-03-27-p1-platform-enhancements.md` | Untracked historical | Historical enhancement track; completion state needs reconciliation |
| `2026-03-27-p2-platform-enhancements.md` | Untracked historical | Historical enhancement track; completion state needs reconciliation |
| `2026-03-27-p3-platform-enhancements.md` | Untracked historical | Historical enhancement track; completion state needs reconciliation |
| `2026-03-30-map-batch-b-detail-cards-geocoder-tooltip.md` | Untracked historical | Batch plan not explicitly tracked in current roadmap |
| `2026-03-30-map-batch-c-clustering-measurement-shortcuts.md` | Untracked historical | Batch plan not explicitly tracked in current roadmap |
| `2026-03-30-map-batch-d-3d-terrain-deckgl.md` | Untracked historical | Batch plan not explicitly tracked in current roadmap |
| `2026-03-31-autonomous-development-pipeline.md` | Untracked historical | Pipeline exists, but this plan needs explicit roadmap status |
| `2026-03-31-perplexity-agent-api-integration.md` | Done | Marked done in `ROADMAP.md` as `AI-RESEARCH-001` |
| `2026-04-01-cua-code-execution-harness-design.md` | Untracked historical | CUA evolution reference; active completion state not indexed |
| `2026-04-01-cua-code-execution-harness-implementation.md` | Untracked historical | Requires explicit shipped/not-shipped reconciliation |
| `2026-04-01-cua-self-teaching-design.md` | Untracked historical | Design reference only until promoted into roadmap |
| `2026-04-04-parcel-tile-speed-visual-upgrade.md` | Untracked historical | Needs explicit roadmap status |
| `2026-04-05-map-parcel-truth-overlay.md` | In Progress | Indexed in `ROADMAP.md` as `MAP-INTEL-001` |
| `2026-04-09-control-plane-extraction.md` | In Progress | Indexed in `ROADMAP.md` as `INFRA-CP-001`; repo assets are landed and host `root@5.161.99.123` is staged, pending Tailscale join |

## Required Follow-Up

The remaining `Untracked historical` items are not safe to treat as active commitments. Before implementation resumes on any of them:

1. add or update the matching entry in `ROADMAP.md`
2. define acceptance criteria and verification evidence
3. move the item to `Done`, `Deferred`, or `In Progress`

# Legacy Cleanup Candidates

Last reviewed: 2026-03-11
Phase: Opportunity OS generalization, Phase 6 follow-up

This document lists code that appears redundant after the generalized workflow migration.

Do not remove any item in this document during Phase 6.

Removal preconditions for every candidate:

- one full release cycle has passed with generalized workflow writes active
- entitlement creation, screening, automation, and artifact flows still pass
- all active clients read `workflowTemplateKey` and `currentStageKey` as canonical fields
- no external callers still depend on legacy `sku`, legacy `status`, or `/triage` aliases

## Route Aliases And Compatibility Endpoints

| Candidate | Files / Routes | Why it is now redundant | Removal condition |
| --- | --- | --- | --- |
| Legacy screening alias pair | `apps/web/app/api/deals/[id]/triage/route.ts`, `apps/web/app/api/deals/[id]/screen/route.ts` | `/screen` currently wraps `/triage` and mostly reshapes the response. Both endpoints represent the same screening flow. | Keep one canonical screening endpoint after all clients migrate and native `/screen` behavior is fully owned in one route. |
| Legacy triage UI callers | `apps/web/app/deals/[id]/page.tsx`, `apps/web/components/deals/RunTriageButton.tsx` | These clients still call `/api/deals/[id]/triage` directly instead of the generalized `/screen` surface. | Remove or rewrite after the UI exclusively uses the canonical screening endpoint. |

## Deal API Compatibility Shims

| Candidate | Files / Functions | Why it is now redundant | Removal condition |
| --- | --- | --- | --- |
| Generalization shim helpers | `apps/web/app/api/_lib/opportunityPhase3.ts` functions `resolveGeneralizedFieldsFromLegacySku`, `resolveStageKeyFromLegacyStatus`, `resolveLegacyStatusFromStageKey`, `projectLegacyDealCompatibility` | These helpers exist to translate legacy `sku` and entitlement `status` values into generalized workflow state and back again. | Collapse after legacy read compatibility is no longer required. |
| Legacy list filters and bulk status mutation | `apps/web/app/api/deals/route.ts` | The collection route still accepts legacy `status` and `sku` filters and retains a bulk `update-status` action that maps back into canonical workflow state. | Remove when clients filter and mutate by generalized workflow fields only. |
| Legacy single-deal PATCH compatibility branch | `apps/web/app/api/deals/[id]/route.ts` | The single-deal route still accepts legacy `sku` and `status` hints, mirrors `legacySku` and `legacyStatus`, and emits legacy status events. | Reduce to generalized writes plus read-only compatibility echoes after callers stop sending legacy fields. |

## Automation Compatibility Tail

| Candidate | Files / Functions | Why it is now redundant | Removal condition |
| --- | --- | --- | --- |
| Legacy transition matrix | `apps/web/lib/automation/advancement.ts` constants `STAGE_TRANSITIONS` and function `getNextTransition` | Advancement now runs from `workflowTemplateKey` and `currentStageKey`. This status-based matrix remains only as a compatibility helper. | Remove after no tests, handlers, or consumers rely on legacy transition names. |
| Legacy human-gate matrix | `apps/web/lib/automation/gates.ts` constants `HUMAN_GATED_TRANSITIONS`, `ADVANCEMENT_CRITERIA`, and function `canAutoAdvance` | Gate logic is still encoded in entitlement-era statuses instead of generalized stages. | Replace with stage-key rules before removal. |
| Legacy status event type | `apps/web/lib/automation/events.ts` event union member `deal.statusChanged` | Handler registration is now stage-based, but the event type is still emitted from compatibility branches. | Remove after internal and external consumers no longer subscribe to legacy status transitions. |
| Dual-trigger disposition fallback | `apps/web/lib/automation/buyerOutreach.ts`, `apps/web/lib/automation/artifactAutomation.ts` | Both handlers now support generalized `deal.stageChanged -> DISPOSITION`, but still keep the legacy `deal.statusChanged -> EXIT_MARKETED` branch. | Remove once disposition automation is confirmed to be stage-driven only. |
| Dual-trigger entitlement underwriting fallback | `apps/web/lib/automation/entitlementStrategy.ts` | The handler is already stage-aware, but it still accepts legacy `PREAPP` and `CONCEPT` status triggers. | Remove after entitlement workflow entry is trusted through `UNDERWRITING` stage changes only. |
| Legacy terminal outcome mapping | `apps/web/lib/automation/knowledgeCapture.ts`, `apps/web/lib/automation/outcomeCapture.ts` | Both files still accept legacy `EXITED` and `KILLED` alongside generalized `CLOSED_WON` and `CLOSED_LOST`. | Remove legacy terminal mappings once all closeout events come from generalized stages. |

## OpenAI Tooling And Prompt Surfaces

| Candidate | Files / Functions | Why it is now redundant | Removal condition |
| --- | --- | --- | --- |
| Legacy deal status tool | `packages/openai/src/tools/dealTools.ts` function `updateDealStatus` | This tool explicitly updates the legacy compatibility status echo rather than canonical workflow state. | Remove after tool callers mutate workflow via template and stage concepts only. |
| Legacy list filters in tools | `packages/openai/src/tools/dealTools.ts` function `listDeals` | The tool still filters by legacy `status` and `sku` enums rather than generalized workflow fields. | Replace with generalized workflow filters and remove legacy filters after caller migration. |
| Entitlement-era milestone calculators | `packages/openai/src/tools/calculationTools.ts` functions `create_milestone_schedule` and `estimate_project_timeline` | Both tools still hard-code entitlement-specific status values like `PREAPP`, `CONCEPT`, `APPROVED`, and `EXIT_MARKETED`. | Replace with generalized workflow-stage calculators before removal. |
| Legacy status-gated artifact generation | `packages/openai/src/tools/artifactTools.ts` constants `STAGE_PREREQUISITES`, function `isAtOrPast`, and status-specific buyer teaser messaging | Artifact eligibility and messaging still depend on legacy status ordering rather than template-aware stages. | Remove after artifact gating derives from workflow template and current stage only. |

## Direct Deal To Parcel Assumptions

| Candidate | Files / Functions | Why it is now redundant | Removal condition |
| --- | --- | --- | --- |
| First-parcel memory lookup | `apps/web/lib/agent/agentRunner.ts` | Memory context still derives from `Deal -> Parcel` by reading the first parcel on the deal. This bypasses the new asset layer. | Rewrite against primary asset or `DealAsset` once asset-backed context is fully available. |
| First-parcel outcome entity lookup | `apps/web/lib/services/outcomeCapture.service.ts` | Outcome capture still resolves entity identity from the first parcel attached to a deal. | Rewrite against primary asset identity once asset-first linkage is stable. |

## Notes

- Nothing in this file should be removed until the repo gates stay green across a full release cycle.
- Compatibility readers for legacy `sku` and `status` remain intentional during the soak period.
- Entitlement workflows are still first-class. Cleanup means removing duplicate compatibility paths, not removing entitlement support.

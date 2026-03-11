# Opportunity OS Generalization Roadmap

Status: Planning draft
Authority: Repo-specific implementation roadmap for broadening Entitlement OS into a general CRE opportunity platform
Owner: Platform engineering
Last reviewed: 2026-03-11

This document defines how to evolve the current repo from an entitlement-focused operating system into a multi-tenant CRE deal OS that can source, evaluate, manage, and advance all real estate opportunities.

For active implementation status, use `ROADMAP.md`.
For current architecture and security/data-path contracts, use `docs/SPEC.md` and `docs/claude/architecture.md`.

## 1) Current repo constraints

The platform layer is already broad enough to support general CRE workflows:

- Multi-tenant org/user/deal/chat/task/evidence runtime already exists in `packages/db/prisma/schema.prisma`.
- The web app already has broad surfaces (`deals`, `portfolio`, `buyers`, `map`, `market`, `runs`, `workflows`, `wealth`) under `apps/web/app/`.
- The agent layer already includes coordinator, finance, legal, research, risk, due diligence, operations, marketing, tax, and market-intel specialists in `packages/openai/src/agents/`.
- The schema already includes generic CRE structures such as `DealTerms`, `EnvironmentalAssessment`, `PropertyTitle`, `PropertySurvey`, `Tenant`, `TenantLease`, `DevelopmentBudget`, `CapitalSource`, `DealFinancing`, `DealRisk`, and `DealStakeholder`.

The current constraints are domain-shape constraints, not platform constraints:

- `Deal.sku` is hard-coded to three entitlement-era product types in `packages/db/prisma/schema.prisma`.
- `Deal.status` is hard-coded to an entitlement lifecycle (`PREAPP`, `NEIGHBORS`, `SUBMITTED`, `HEARING`, `APPROVED`).
- `Parcel` is tied directly to `Deal`, which makes parcel-led workflows first-class but property-, asset-, lease-, and portfolio-led workflows secondary.
- A large amount of documentation, routing, tools, prompts, and automation still assumes zoning/parish-pack/entitlement/triage as the default operating model.

## 2) Target operating model

The target is not "remove entitlements." The target is:

- one generic opportunity core
- one configurable workflow engine
- multiple domain modules layered on top

In the target system:

- Entitlement remains a first-class module.
- Acquisition underwriting becomes a peer module.
- Asset management and leasing become peer modules.
- Capital markets and disposition become peer modules.
- Map/parcel intelligence remains important, but becomes one input surface rather than the defining center of every deal.

## 3) Design principles

1. Additive first. Do not break the current entitlement product in early phases.
2. Preserve `org_id` scoping and existing auth/gateway/data-path invariants.
3. Separate platform-core changes from domain-module changes.
4. Replace hard-coded enums with template-driven workflow configuration only after compatibility shims exist.
5. Keep entitlement-specific tables, tools, and prompts operational until the generalized equivalents are battle-tested.
6. Do not rename the repo/packages first. Product naming can change later; schema/runtime stability comes first.

## 4) Concrete schema changes

### 4.1 Deal taxonomy

Current anchor:

- `packages/db/prisma/schema.prisma`
- `model Deal`
- `enum sku_type`
- `enum deal_status`

Required change:

- Keep `Deal` as the primary top-level business object.
- Add generalized classification fields before removing any entitlement-era fields.

Recommended additive fields on `Deal`:

- `assetClass deal_asset_class?`
- `assetSubtype String?`
- `strategy deal_strategy?`
- `workflowTemplateKey workflow_template_key?`
- `currentStageKey deal_stage_key?`
- `opportunityKind opportunity_kind?`
- `dealSourceType deal_source_type?`
- `primaryAssetId String?`
- `marketName String?`
- `investmentSummary String?`
- `businessPlanSummary String?`
- `legacySku sku_type?`
- `legacyStatus deal_status?`

New enums to add:

- `deal_asset_class`
  - `LAND`
  - `INDUSTRIAL`
  - `OFFICE`
  - `RETAIL`
  - `MULTIFAMILY`
  - `SELF_STORAGE`
  - `HOSPITALITY`
  - `MIXED_USE`
  - `SPECIALTY`
  - `PORTFOLIO`
- `deal_strategy`
  - `ENTITLEMENT`
  - `GROUND_UP_DEVELOPMENT`
  - `VALUE_ADD_ACQUISITION`
  - `CORE_ACQUISITION`
  - `LEASE_UP`
  - `ASSET_MANAGEMENT`
  - `RECAPITALIZATION`
  - `REFINANCE`
  - `DISPOSITION`
  - `DEBT_PLACEMENT`
- `workflow_template_key`
  - `ENTITLEMENT_LAND`
  - `DEVELOPMENT`
  - `ACQUISITION`
  - `LEASE_UP`
  - `ASSET_MANAGEMENT`
  - `DISPOSITION`
  - `REFINANCE`
  - `PORTFOLIO_REVIEW`
- `deal_stage_key`
  - `ORIGINATION`
  - `SCREENING`
  - `UNDERWRITING`
  - `DUE_DILIGENCE`
  - `CONTRACTING`
  - `EXECUTION`
  - `ASSET_MANAGEMENT`
  - `DISPOSITION`
  - `CLOSED_WON`
  - `CLOSED_LOST`
- `opportunity_kind`
  - `SITE`
  - `PROPERTY`
  - `LOAN`
  - `PORTFOLIO`
  - `TENANT`
  - `JV`
- `deal_source_type`
  - `MANUAL`
  - `BROKER`
  - `OWNER_DIRECT`
  - `MARKET_SCAN`
  - `AGENT_DISCOVERY`
  - `REFERRAL`
  - `IMPORT`

### 4.2 Asset and parcel normalization

Current anchor:

- `Deal -> Parcel` direct relationship in `packages/db/prisma/schema.prisma`

Required change:

- Introduce a generalized `Asset` layer so a deal can be property-led, parcel-led, or portfolio-led.

New models:

- `Asset`
  - `id`, `orgId`, `name`, `assetClass`, `assetSubtype`, `marketName`, `address`, `city`, `state`, `postalCode`, `yearBuilt`, `rentableAreaSf`, `siteAreaAcres`, `occupancyPct`, `metadata`
- `DealAsset`
  - join table between `Deal` and `Asset`
  - fields: `dealId`, `assetId`, `role`, `isPrimary`
- `AssetParcel`
  - join table between `Asset` and `Parcel`
  - fields: `assetId`, `parcelId`

Migration intent:

- Existing entitlement deals backfill to one primary `Asset` representing the site.
- Existing `Parcel.dealId` remains temporarily for compatibility while readers/writers move to `DealAsset` and `AssetParcel`.

### 4.3 Workflow templates and stage history

Current anchor:

- `Deal.status`
- automation handlers keyed to entitlement-specific statuses

Required change:

- Move workflow logic into data/config rather than enums only.

New models:

- `WorkflowTemplate`
  - `key`, `name`, `assetClass`, `strategy`, `isSystem`, `configJson`
- `WorkflowStageTemplate`
  - `workflowTemplateId`, `stageKey`, `name`, `sequence`, `entryCriteriaJson`, `exitCriteriaJson`
- `DealWorkflowStage`
  - `dealId`, `stageKey`, `status`, `enteredAt`, `completedAt`, `ownerUserId`, `notes`
- `DealWorkflowEvent`
  - `dealId`, `fromStageKey`, `toStageKey`, `reason`, `actorType`, `metadata`

Why this matters:

- Entitlement can still have `PREAPP`, `SUBMITTED`, `HEARING`, etc., but those become template-specific stages instead of globally required stages.
- Acquisition, refinance, and asset-management deals can follow different stage sets without schema branching.

### 4.4 Scorecards and module-specific data

Current anchor:

- triage and entitlement scoring concepts are spread across tools/docs/tests

Required change:

- Add a generic screening/scorecard model so "triage" becomes one specialization of a broader opportunity evaluation framework.

New models:

- `DealScorecard`
  - `dealId`, `templateKey`, `score`, `recommendation`, `inputJson`, `outputJson`, `createdByAgent`, `createdAt`
- `DealModuleState`
  - `dealId`, `moduleKey`, `stateJson`, `updatedAt`

Examples:

- entitlement scorecard
- acquisition scorecard
- refinance scorecard
- disposition readiness scorecard
- lease-up readiness scorecard

### 4.5 Existing models to preserve and reuse

These models already support general CRE and should be reused instead of rebuilt:

- `DealTerms`
- `EnvironmentalAssessment`
- `PropertyTitle`
- `PropertySurvey`
- `Tenant`
- `TenantLease`
- `DevelopmentBudget`
- `CapitalSource`
- `CapitalDeployment`
- `EquityWaterfall`
- `DealFinancing`
- `DealRisk`
- `DealStakeholder`

## 5) Concrete API changes

### 5.1 Deal API evolution

Target files:

- `apps/web/app/api/deals/route.ts`
- `apps/web/app/api/deals/[id]/route.ts`
- `packages/shared/src/*` deal schemas

Changes:

- Extend deal create/update payloads to accept `assetClass`, `strategy`, `workflowTemplateKey`, `currentStageKey`, `opportunityKind`, and optional `primaryAssetId`.
- Keep `sku` and legacy `status` accepted during compatibility phases.
- Return both generalized and legacy fields during dual-read phases.

### 5.2 New workflow endpoints

New route family:

- `apps/web/app/api/workflow-templates/route.ts`
- `apps/web/app/api/deals/[id]/workflow/route.ts`
- `apps/web/app/api/deals/[id]/workflow/stages/route.ts`
- `apps/web/app/api/deals/[id]/workflow/events/route.ts`

Purpose:

- retrieve valid workflow templates
- inspect current stage state
- advance/reopen/block stages
- persist stage audit history

### 5.3 New asset endpoints

New route family:

- `apps/web/app/api/assets/route.ts`
- `apps/web/app/api/assets/[id]/route.ts`
- `apps/web/app/api/deals/[id]/assets/route.ts`
- `apps/web/app/api/assets/[id]/parcels/route.ts`

Purpose:

- support property-led and portfolio-led opportunities without forcing every workflow through `Deal -> Parcel`

### 5.4 Generalized screening endpoint

Current anchor:

- `apps/web/app/api/deals/[id]/triage/route.ts`

Required change:

- Introduce `apps/web/app/api/deals/[id]/screen/route.ts` as the generalized evaluation endpoint.
- Keep `/triage` as an entitlement-oriented compatibility facade that calls the new screen service with the entitlement scorecard template.

### 5.5 Module-specific intelligence endpoints

Keep and narrow:

- `/api/intelligence/entitlements`
- parish-pack and zoning endpoints

Add:

- `/api/intelligence/acquisitions`
- `/api/intelligence/asset-management`
- `/api/intelligence/capital-markets`
- `/api/intelligence/dispositions`

These do not all need to launch at once, but the API shape should be module-oriented rather than entitlement-default.

### 5.6 Shared schema contract updates

Target files:

- `packages/shared/src/index.ts`
- `packages/shared/src/*schemas*`
- `packages/shared/src/*types*`

Changes:

- move all create/update/read contracts to the generalized taxonomy
- publish workflow-template and stage contracts
- add scorecard and asset schemas
- keep legacy entitlement payloads behind compatibility wrappers until cutover

## 6) Agent and tool changes

### 6.1 Coordinator and query routing

Target files:

- `packages/openai/src/agents/coordinator.ts`
- `packages/openai/src/queryRouter.ts`
- `packages/openai/src/agents/index.ts`

Changes:

- route based on `strategy`, `assetClass`, and `workflowTemplateKey`, not just entitlement-oriented keywords
- preserve entitlements as one specialist route, not the default worldview
- add explicit intents for:
  - acquisitions
  - underwriting
  - leasing
  - asset management
  - capital markets
  - dispositions
  - portfolio review

### 6.2 Agent lineup

Retain:

- `finance.ts`
- `legal.ts`
- `research.ts`
- `risk.ts`
- `dueDiligence.ts`
- `operations.ts`
- `marketing.ts`
- `tax.ts`
- `marketIntel.ts`
- `marketTrajectory.ts`
- `entitlements.ts`

Add:

- `acquisitions.ts`
- `assetManagement.ts`
- `leasing.ts`
- `capitalMarkets.ts`
- `dispositions.ts`

Role changes:

- `entitlements.ts` becomes a domain specialist for permit/zoning/public-process work.
- `finance.ts` remains cross-cutting, but underwriting/debt/disposition tasks should no longer be forced through entitlement-specific deal framing.

### 6.3 Tool reorganization

Current entitlement-first tools to keep as one module:

- `packages/openai/src/tools/entitlementIntelligenceTools.ts`
- `packages/openai/src/tools/zoningTools.ts`

Add generalized/core tool families:

- `workflowTools.ts`
  - `get_workflow_state`
  - `advance_workflow_stage`
  - `list_available_workflow_actions`
- `assetTools.ts`
  - `create_asset`
  - `link_asset_to_deal`
  - `link_parcel_to_asset`
  - `get_asset_summary`
- `screeningTools.ts`
  - generalized `run_deal_screen`
  - `run_scorecard`
  - `compare_scorecards`
- `acquisitionTools.ts`
  - `analyze_rent_roll`
  - `analyze_trailing_financials`
  - `search_rent_comps`
  - `search_sales_comps`
- `leasingTools.ts`
  - `summarize_leasing_pipeline`
  - `draft_tenant_outreach_plan`
  - `analyze_expiration_risk`
- `capitalMarketsTools.ts`
  - `compare_debt_quotes`
  - `summarize_refinance_options`
  - `build_disposition_buyer_list`
- `portfolioTools.ts`
  - `analyze_portfolio_hold_sell`
  - `summarize_asset_performance`

### 6.4 Prompt and guardrail changes

Target files:

- `packages/openai/src/agents/*.ts`
- `packages/openai/src/queryRouter.ts`
- `packages/openai/src/guardrails/inputGuardrails.ts`
- any domain prompt/config files under `packages/openai`

Changes:

- replace repo-wide assumptions that "deal" implies entitlement flip
- keep zoning/entitlement detection as one branch, not the branch
- add module-specific evidence and approval requirements
- preserve current safety rules around org scope, strict schemas, and tool validation

## 7) UI and workflow changes

Target surfaces:

- `apps/web/app/deals`
- `apps/web/app/deal-room`
- `apps/web/app/portfolio`
- `apps/web/app/prospecting`
- `apps/web/app/market`
- `apps/web/app/runs`
- `apps/web/app/chat`
- `apps/web/app/map`

Changes:

- deal create/edit flows ask for `assetClass`, `strategy`, and `workflowTemplate`
- UI renders module-specific tabs conditionally
- entitlement surfaces remain available only when the selected workflow template requires them
- deal-room becomes opportunity-room
- screening UI becomes generalized evaluation UI, with entitlement triage as one scorecard mode
- map remains parcel/geo-native, but no longer implied as the required primary interface for every deal

## 8) Automation changes

Current automation is strong, but some loops are entitlement-shaped.

Target files:

- `apps/web/lib/automation/triage.ts`
- `apps/web/lib/automation/advancement.ts`
- `apps/web/lib/automation/buyerOutreach.ts`
- `apps/web/lib/automation/documents.ts`
- `apps/web/lib/automation/enrichment.ts`
- `apps/web/lib/automation/events.ts`
- `apps/web/lib/automation/config.ts`

Changes:

- rename generalized triage concepts to screen/scorecard concepts internally
- preserve existing entitlement readiness logic behind the entitlement workflow template
- add module-aware advancement logic so different templates define different stage rules
- allow artifact generation and outreach to key off template + strategy, not only entitlement lifecycle milestones

## 9) Ordered migration plan

### Phase 0 — Strategy freeze and compatibility rules

Deliverables:

- approve taxonomy (`assetClass`, `strategy`, `workflowTemplateKey`, `stageKey`)
- decide whether `Deal` remains the canonical object name
- decide whether repo/package renaming is explicitly out of scope for the first program

Stop rule:

- do not touch Prisma or API contracts until the taxonomy matrix is approved

### Phase 1 — Additive schema introduction

Files:

- `packages/db/prisma/schema.prisma`
- `packages/shared/src/*`

Actions:

- add new enums, new optional `Deal` fields, `Asset`/join models, workflow models, scorecard models
- keep legacy `sku` and `status` intact
- generate non-destructive Prisma migrations only

Verification:

- Prisma generate/migrate
- schema-level tests
- zero behavioral change in current entitlement flows

### Phase 2 — Backfill and dual-read models

Files:

- migration scripts under `packages/db` or `scripts/`
- service layer readers in `apps/web/lib/services/*`

Actions:

- backfill one primary `Asset` per existing deal
- map current `sku` into `assetClass`, `strategy`, and `workflowTemplateKey`
- map current `deal_status` into generalized `currentStageKey`
- populate entitlement workflow rows for all existing deals

Compatibility mapping:

- `SMALL_BAY_FLEX` -> `assetClass=INDUSTRIAL`, `strategy=ENTITLEMENT`, `workflowTemplateKey=ENTITLEMENT_LAND`
- `OUTDOOR_STORAGE` -> `assetClass=INDUSTRIAL`, `strategy=ENTITLEMENT`, `workflowTemplateKey=ENTITLEMENT_LAND`
- `TRUCK_PARKING` -> `assetClass=INDUSTRIAL`, `strategy=ENTITLEMENT`, `workflowTemplateKey=ENTITLEMENT_LAND`

Verification:

- row-count reconciliation
- sampled deal diffs before/after backfill
- no orphaned parcel/deal relations

### Phase 3 — API dual-write / compatibility facade

Files:

- `apps/web/app/api/deals/*`
- `apps/web/app/api/deals/[id]/triage/route.ts`
- new workflow/asset routes
- `packages/shared/src/*`

Actions:

- write new generalized fields on create/update
- continue returning legacy fields to old UI clients
- implement `/screen` and keep `/triage` as facade

Verification:

- route tests for both legacy and generalized payloads
- auth/org-scoping regression tests

### Phase 4 — Agent and tool cutover

Files:

- `packages/openai/src/agents/*`
- `packages/openai/src/tools/*`
- `packages/openai/src/queryRouter.ts`
- `apps/web/lib/agent/*`
- `infra/cloudflare-agent/*`

Actions:

- add new modules/agents/tools
- teach coordinator to route by opportunity type
- preserve entitlement tools as one routed module

Verification:

- agent/tool contract tests
- query-router intent tests
- streamed chat integration tests across SSE and WebSocket paths

### Phase 5 — UI and automation cutover

Files:

- `apps/web/app/*`
- `apps/web/components/*`
- `apps/web/lib/automation/*`

Actions:

- generalized deal create/edit UX
- workflow timeline UI
- module-aware scorecard rendering
- automation keyed to workflow template rather than hard-coded entitlement statuses

Verification:

- route/component tests
- focused Playwright or UI smoke on create/edit/workflow flows
- automation idempotency checks

### Phase 6 — Legacy entitlement compatibility sunset

Actions:

- move `sku` and legacy entitlement `status` to compatibility-only read paths
- deprecate old prompt assumptions and route aliases
- sunset direct `Deal -> Parcel` dependence where no longer needed

Verification:

- confirm all active clients read new fields
- confirm all entitlement flows still work through template/module layer
- remove dead code only after a full release cycle

## 10) Recommended first implementation slices

Do not start with rebranding or prompt rewrites.

Start in this order:

1. Schema taxonomy and workflow template models
2. Additive asset layer
3. `/screen` compatibility API beside `/triage`
4. Coordinator/query-router generalization
5. New agent/tool modules for acquisitions and capital markets
6. UI workflow-template support
7. Automation template-awareness

## 11) Verification requirements for the program

For every implementation slice:

- preserve `org_id` scoping
- preserve gateway-only property DB access
- preserve strict shared schema validation
- preserve current entitlement workflows until the replacement path is proven

Program-level verification gates:

- schema migration tests
- route tests for legacy + new payloads
- agent/tool contract tests
- automation regression tests
- repo gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`

## 12) Non-goals for the first wave

- Renaming the repo/packages from `entitlement-os` on day one
- Removing entitlement-specific tables before template-based replacements exist
- Replacing parcel/map infrastructure with a property-only abstraction
- Attempting a single-step big-bang migration
- Treating portfolio/loan/asset-management flows as an afterthought after the schema is already locked again

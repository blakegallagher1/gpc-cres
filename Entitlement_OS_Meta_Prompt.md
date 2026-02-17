# ENTITLEMENT OS — Consolidation & Enhancement Meta-Prompt

**Gallagher Property Company | February 2026 | v1.0**

> This document is a self-contained instruction set for a coding agent. Paste the full text into a new agent session. It contains every specification, schema definition, and acceptance criterion needed for execution.

---

## 1. Role & Context

You are a senior full-stack engineer working on **Entitlement OS**, the internal operating system for Gallagher Property Company — a CRE investment and development firm focused on light industrial, outdoor storage, and truck parking in Louisiana.

**Your mission:** Execute a comprehensive consolidation of the UI (reducing 20 sidebar items to 10) and a deep feature enhancement across 7 domains, all without losing any existing functionality. Every capability stays. You are reducing doors into the same rooms and adding depth where the platform is shallow.

**Tech stack:** Next.js 16 (App Router), React 19, shadcn/ui, Radix, Tailwind, Zustand, SWR, Prisma 6, PostgreSQL (Supabase), OpenAI Agents SDK, pnpm monorepo. Strict TypeScript. Node 22.

**Repo structure:** `apps/web/` (Next.js frontend + API routes), `packages/db/` (Prisma), `packages/openai/` (13 agents + ~26 tools), `packages/shared/` (Zod schemas), `packages/evidence/`, `packages/artifacts/` (PDF + PPTX generation).

**Key rules from CLAUDE.md (follow exactly):**

- Use `.nullable()` (not `.optional()`) for Zod tool parameters
- Use plain `z.string()` — never `z.string().url()` or `z.string().email()`
- Wire agent tools in `createConfiguredCoordinator()`, not on module-level exports
- Scope all DB queries with `orgId` for multi-tenant isolation
- Dispatch automation events with `.catch(() => {})` — never block API responses
- Use `import "server-only"` for any module touching chatgpt-apps keys
- Don't use Chat Completions API — use OpenAI Responses API
- Don't use `any` type — use `Record<string, unknown>`
- All automation tests use Jest (NOT vitest) with `jest.mock()`/`jest.requireMock()`

**Execution protocol:** Read `CLAUDE.md`, `ROADMAP.md`, and `IMPLEMENTATION_PLAN.md` before touching any code. Follow the ROADMAP-FIRST protocol. Update `ROADMAP.md` after each completed work item with results and status.

---

## 2. Execution Phases

Execute in strict order. Each phase must pass typecheck and existing tests before advancing to the next. Commit after each numbered sub-task.

---

### PHASE A: UI CONSOLIDATION (Do First)

Reduce the sidebar from 20 items to 10. No functionality is removed — only reorganized. After this phase, every feature must still be reachable.

#### A1. Delete `/deploy`

Remove `apps/web/app/deploy/` entirely. Remove the sidebar entry from `components/layout/Sidebar.tsx`. This page is a localStorage-only mockup with no backend integration.

**Acceptance:** Route gone, sidebar entry gone, no dead imports, typecheck passes.

#### A2. Merge `/runs` + `/runs/dashboard` into tabbed `/runs`

The `/runs` page currently shows a searchable run history table. The `/runs/dashboard` page shows trend analytics, reliability profiling, and confidence scoring. Merge them into a single `/runs` page with two tabs:

- **History** — the current `/runs` table (search, type filter, status filter, bulk actions)
- **Intelligence** — the current `/runs/dashboard` content (confidence trends, retry analysis, reproducibility drift, source ingestion profiling)

Delete `apps/web/app/runs/dashboard/` after migration. Update sidebar to single `/runs` entry. Preserve all URL query params for the history tab (search, type, status filters).

**Acceptance:** `/runs` renders both tabs. `/runs/dashboard` redirects to `/runs?tab=intelligence` or is removed. All dashboard charts and metrics render in the Intelligence tab. Sidebar shows one "Runs" entry.

#### A3. Fold `/saved-searches` into `/prospecting`

Move saved search functionality into the `/prospecting` page as a collapsible sidebar panel or dropdown labeled "Saved Filters." When user clicks a saved search, it populates the prospecting filter state and map view. Delete the standalone `/saved-searches` route and sidebar entry.

**Acceptance:** Saved searches load/save/delete from within `/prospecting`. No `/saved-searches` route. Sidebar entry gone.

#### A4. Fold `/workflows` into `/automation` as a tab

Add a "Builder" tab to the `/automation` page alongside the existing Stats, Feed, Health, and Failures tabs. The Builder tab contains the full workflow list, template gallery, create/edit/run controls from the current `/workflows` page. Delete the standalone `/workflows` route.

**Acceptance:** `/automation` has 5 tabs (Stats, Feed, Health, Failures, Builder). Builder tab has full workflow CRUD. `/workflows` route removed. Sidebar shows one "Automation" entry.

#### A5. Fold `/outcomes` into `/portfolio` as a tab

Add an "Outcomes" tab to the `/portfolio` page. This tab contains the deal exit tracking, assumption bias detection, triage calibration, and performance analytics from the current `/outcomes` page. Delete the standalone `/outcomes` route.

**Acceptance:** `/portfolio` has Outcomes tab with all exit/kill tracking. `/outcomes` route removed. Sidebar entry gone.

#### A6. Fold `/screening` into `/deals` as a view mode

Add a "Triage Queue" tab or view mode to the `/deals` page. This view shows the card-based screening interface with triage scores, status filters (KILL/HOLD/ADVANCE), review flags, and score range filters. The screening detail page (`/screening/[projectId]`) becomes `/deals/[id]?view=triage`. The screening playbook (`/screening/playbook`) becomes `/deals/playbook`. Delete the standalone `/screening` route.

**Acceptance:** `/deals` has Triage Queue view with all screening functionality. `/screening` routes redirect or are removed. Sidebar shows one "Deals" entry.

#### A7. Fold `/buyers` into deal detail + portfolio

Add a "Buyers" tab (6th tab) to the deal detail page `/deals/[id]`. This shows buyers associated with that deal, outreach history, and add/search buyer actions. For the cross-deal portfolio view, add a "Buyers" sub-section or tab to `/portfolio`. Delete the standalone `/buyers` route and sidebar entry.

**Acceptance:** Buyer CRUD accessible from deal detail. Cross-deal buyer list accessible from portfolio. No standalone `/buyers` route.

#### A8. Merge `/evidence` + `/jurisdictions` into `/reference`

Create a new `/reference` route with two tabs: "Evidence Sources" (the current `/evidence` content) and "Jurisdictions" (the current `/jurisdictions` content). Delete both standalone routes. Add a single "Reference Data" sidebar entry in the Settings/Operations group.

**Acceptance:** `/reference` has two tabs. Both `/evidence` and `/jurisdictions` routes removed. One sidebar entry.

#### A9. Fold `/deal-room` into `/deals/[id]` as a tab

Add a "Room" or "Collaborate" tab (7th tab) to the deal detail page. This contains messaging, shared docs, and team management from the deal room. The `/deal-room` index page becomes unnecessary. Delete the standalone `/deal-room` route if deal rooms are 1:1 with deals. If deal rooms can span multiple deals, keep the route but remove the sidebar entry and make it accessible only from deal detail links.

**Acceptance:** Deal room content accessible from deal detail. Sidebar entry removed.

#### A10. Update Sidebar

After all consolidations, the sidebar must render exactly these groups and items:

| Group | Item | Notes |
|-------|------|-------|
| **Core** | Chat | Unchanged — `/` |
| **Core** | Deals | Now includes Triage Queue view + buyer tab in detail |
| **Core** | Map | Unchanged — `/map` |
| **Pipeline** | Prospecting | Now includes Saved Filters panel |
| **Pipeline** | Portfolio | Now includes Outcomes tab + buyer cross-view |
| **Pipeline** | Wealth | Unchanged — `/wealth` |
| **Intelligence** | Command Center | Unchanged — `/command-center` |
| **Intelligence** | Agents | Unchanged — `/agents` |
| **Intelligence** | Runs | Now includes Intelligence dashboard tab |
| **Intelligence** | Automation | Now includes Builder (workflows) tab |
| **Settings** | Reference Data | Evidence + Jurisdictions tabs |
| **Settings** | Market Intel | Unchanged — `/market` |

**Acceptance:** Sidebar renders 12 items across 4 groups. No dead links. Every previously-accessible feature reachable from the new structure. Run full test suite.

---

### PHASE B: DEAL SCHEMA EXPANSION (Tier 1 — Critical)

The deal record is missing the entire transaction lifecycle. Add 7 new Prisma models and the corresponding API routes and UI. Every model must include `orgId` for multi-tenant isolation.

#### B1. DealTerms model

Add to Prisma schema: `DealTerms` (1:1 with Deal). Fields: `offerPrice` (Decimal?), `earnestMoney` (Decimal?), `closingDate` (DateTime?), `titleCompany` (String?), `dueDiligenceDays` (Int?), `financingContingencyDays` (Int?), `loiSignedAt` (DateTime?), `psaSignedAt` (DateTime?), `titleReviewDue` (DateTime?), `surveyDue` (DateTime?), `environmentalDue` (DateTime?), `sellerContact` (String?), `brokerContact` (String?), `orgId` (String). Add to deal detail Overview tab as an "Acquisition Terms" card. Add API route for CRUD at `/api/deals/[id]/terms`.

**Acceptance:** Migration runs. DealTerms editable from deal detail. Milestone dates render in timeline. orgId scoped.

#### B2. EntitlementPath model

Add: `EntitlementPath` (1:1 with Deal). Fields: `recommendedStrategy` (String?), `preAppMeetingDate` (DateTime?), `preAppMeetingNotes` (String?), `applicationType` (String? — CUP, Rezoning, Variance, etc.), `applicationSubmittedDate` (DateTime?), `applicationNumber` (String?), `publicNoticeDate` (DateTime?), `publicNoticePeriodDays` (Int?), `hearingScheduledDate` (DateTime?), `hearingBody` (String?), `hearingNotes` (String?), `decisionDate` (DateTime?), `decisionType` (String? — approved, approved_with_conditions, denied, continued), `conditions` (String[]), `appealDeadline` (DateTime?), `appealFiled` (Boolean), `conditionComplianceStatus` (String?), `orgId` (String). Add to deal detail as an "Entitlement" card or sub-tab. This is the core tracking model for what the platform is named after.

**Acceptance:** Full entitlement lifecycle trackable from deal detail. Hearing dates appear in Command Center deadlines widget.

#### B3. EnvironmentalAssessment model

Add: `EnvironmentalAssessment` (many per Deal). Fields: `phase` (String — Phase_I or Phase_II), `completedDate` (DateTime?), `recs` (String[]), `crecFound` (Boolean?), `estimatedRemediationCost` (Decimal?), `remediationTimeline` (String?), `consultantName` (String?), `orgId` (String). Surface in deal detail Documents tab with extraction auto-populate when Phase I upload is classified.

#### B4. DealFinancing model

Add: `DealFinancing` (many per Deal — supports multiple tranches). Fields: `lenderName` (String?), `loanType` (String? — senior, mezzanine, construction, seller_financing), `loanAmount` (Decimal?), `interestRate` (Decimal?), `loanTermMonths` (Int?), `dscrRequired` (Decimal?), `ltv` (Decimal?), `committedDate` (DateTime?), `commitmentExpiryDate` (DateTime?), `conditions` (String[]), `orgId` (String). Surface in deal detail Overview and in financial model as "Actual vs. Modeled" comparison.

#### B5. DealRisk model

Add: `DealRisk` (many per Deal). Fields: `category` (String — environmental, entitlement, market, financial, operational), `description` (String), `severity` (String — low, medium, high, critical), `probability` (Decimal?), `financialExposure` (Decimal?), `mitigation` (String?), `status` (String — identified, monitoring, mitigated, accepted), `createdAt`, `updatedAt`, `orgId` (String). Initialize from triage output. Surface in deal detail as a "Risk Register" card. Aggregate in portfolio analytics for portfolio-level risk heat map.

#### B6. DealStakeholder model

Add: `DealStakeholder` (many per Deal). Fields: `name` (String), `role` (String — sponsor, equity_partner, lender, broker, lawyer, title_company, contractor), `company` (String?), `email` (String?), `phone` (String?), `equityOwnership` (Decimal?), `decisionRights` (String[]), `orgId` (String). Replace the YAML-in-notes pattern. Surface in deal detail Overview.

#### B7. PropertyTitle and PropertySurvey models

Add both (1:1 with Deal each). `PropertyTitle`: `titleInsuranceReceived` (Boolean?), `exceptions` (String[]), `liens` (String[]), `easements` (String[]), `orgId`. `PropertySurvey`: `surveyCompletedDate` (DateTime?), `acreageConfirmed` (Decimal?), `encroachments` (String[]), `setbacks` (Json?), `orgId`. Surface in deal detail.

**Acceptance for all B tasks:** All 7 models in schema. Migrations run. API routes exist with orgId scoping. Deal detail UI renders all new data. Existing tests pass. New tests cover CRUD for each model.

---

### PHASE C: FINANCIAL MODEL DEPTH (Tier 1 — Critical)

Transform the financial model from a flat NOI calculator into an institutional-grade underwriting tool.

#### C1. Rent Roll Modeling

Add Prisma models: `Tenant` (id, dealId, name, creditRating, orgId) and `TenantLease` (id, tenantId, dealId, unitIdentifier, leaseStart, leaseEnd, monthlyRent, annualEscalation, leaseStatus, orgId). Add a "Rent Roll" tab to the financial model page. The pro forma calculation hook (`useProFormaCalculations`) must aggregate rent roll entries to derive total revenue, model vacancy by lease maturity, and calculate weighted average lease term. Add agent tool: `get_rent_roll` (dealId) that returns the full lease schedule.

**Acceptance:** Rent roll entries CRUD in financial model UI. Pro forma NOI derived from lease-level data when rent roll exists. Agent can query rent roll. Lease expiry concentration visible as a risk metric.

#### C2. Construction Budget Line-Item Detail

Replace the hardcoded $/SF calculation in `calculate_development_budget` with a detailed cost model. Add a `DevelopmentBudget` Prisma model (1:1 with Deal): `acquisitionPrice`, `sitePrepCosts`, `hardCosts`, `architectureEngineering`, `permittingFees`, `utilityExtensions`, `parkingCosts`, `hardCostContingencyPct`, `softCostContingencyPct`, `ownerContingencyPct`, `constructionLoanStructure` (Json), `constructionSchedule` (Json), `orgId`. Add a "Development Budget" tab to the financial model for development-stage deals. The `calculate_development_budget` tool must accept detailed line items and return itemized budget with contingency breakdowns.

**Acceptance:** Line-item budget editable in UI. Agent tool returns detailed cost breakdown. Total cost flows into pro forma. Contingency categories separated.

#### C3. Capital Stack / Sources & Uses

Add Prisma model: `CapitalSource` (many per Deal) — `sourceType` (equity, senior_debt, mezzanine, seller_financing, tax_credits), `amount`, `interestRate`, `term`, `preferredReturn`, `orgId`. Add model: `EquityWaterfall` (many per Deal) — `tier` (Int), `criterion` (String), `lpAllocationPct` (Decimal), `gpAllocationPct` (Decimal), `orgId`. Connect waterfall UI to backend model. Add Sources & Uses summary view to financial model showing total sources = total uses. Add agent tool: `model_capital_stack`.

**Acceptance:** Capital sources editable. Waterfall calculates from backend model. Sources & Uses balances. LP/GP distributions computed per tier.

#### C4. Multi-Scenario Stress Testing

Add predefined stress scenarios to the sensitivity tab: Base, Upside, Downside, Rate Shock (+200bps), Recession (vacancy +15%, rent growth -3%), Tenant Loss (largest tenant vacates). Each scenario modifies multiple assumptions simultaneously. Add probability weighting to compute expected IRR/multiple. Store scenarios in `Deal.financialModelAssumptions` JSON. Add agent tool: `stress_test_deal` that runs all scenarios and returns a comparison table.

**Acceptance:** 6 predefined scenarios run in UI. Joint variable manipulation works. Expected value computed with probability weights. Agent can run stress tests.

#### C5. Exit Strategy Modeling

Add a `model_exit_scenarios` agent tool that takes base assumptions and models: sell at year N (for N = 1..10), refinance at year M and hold to year N, disposition at stabilization. For each scenario, compute: exit value, equity proceeds, equity multiple, IRR. Identify IRR-maximizing exit timing. Add "Exit Analysis" view to financial model showing scenario comparison chart.

**Acceptance:** Multiple exit paths modeled. Chart shows IRR by exit year. Optimal exit identified. Agent tool returns ranked scenarios.

#### C6. Tax Integration

Connect the existing depreciation/cost segregation calculation tools to the pro forma. Add after-tax IRR computation. Link 1031 exchange deadline calculations to actual deal closing timelines (from `DealTerms.closingDate`). Surface tax impact in financial model Results tab as "Pre-Tax IRR" vs. "After-Tax IRR" comparison.

**Acceptance:** After-tax IRR computed. 1031 deadlines calculated from actual closing date. Tax impact visible in results.

---

### PHASE D: AGENT TOOL DEPTH (Tier 2 — High)

Add 7 new agent tools to `packages/openai/src/tools/`. Wire each into the appropriate agent via `createConfiguredCoordinator()`. All tools use snake_case names, `.nullable()` for optional Zod params, no `z.string().url()`.

#### D1. `recommend_entitlement_path`

**Input:** `jurisdiction_id`, `sku`, `proposed_use`, `site_constraints` (String[]), `risk_tolerance` (conservative/moderate/aggressive). **Output:** recommended path with approval probability, expected timeline months, estimated cost, 2-3 alternative paths ranked, risk flags. **Wire to:** Entitlements agent.

#### D2. `analyze_comparable_sales`

**Input:** `parcel_address`, `acreage`, `sku_type`, array of comp objects (address, salePrice, acreage, saleDate). **Output:** adjusted comps (time/location/condition adjustments), valuation range (low/mid/high), recommended offer price, market strength indicator. **Wire to:** Research agent.

#### D3. `optimize_debt_structure`

**Input:** `purchase_price`, `noi`, `available_equity`, `risk_tolerance`, array of `debt_options` (lenderType, maxLoan, interestRate, term, dscrRequired). **Output:** ranked structures (conservative/moderate/aggressive) each with equity required, DSCR, levered IRR, risk score. **Wire to:** Finance agent.

#### D4. `estimate_phase_ii_scope`

**Input:** `phase_i_recs` (String[]), `site_acreage`, `groundwater_depth`. **Output:** estimated Phase II cost range (low/mid/high), timeline weeks, potential remediation scope description, remediation cost range, probability of remediation required. **Wire to:** Due Diligence agent.

#### D5. `analyze_title_commitment`

**Input:** `title_commitment_text` (String), `deal_type`. **Output:** categorized exceptions, liens with severity, easement impact description, title insurance cost estimate, cure items with cost and timeline. **Wire to:** Legal agent.

#### D6. `generate_zoning_compliance_checklist`

**Input:** `jurisdiction_id`, `sku`, `current_zoning`, `site_constraints` (acreage, proposed height, parking spaces, FAR). **Output:** requirement-by-requirement compliance matrix (item, required, proposed, compliant boolean, variance needed, variance likelihood), total variance count, estimated variance cost and timeline. **Wire to:** Entitlements agent.

#### D7. `model_exit_scenarios` (if not built in C5)

See C5 specification. **Wire to:** Finance agent.

**Acceptance for all D tasks:** Each tool has Zod schema, execute function returning `JSON.stringify` output, is wired in `createConfiguredCoordinator()`, and has at least one unit test.

---

### PHASE E: AUTOMATION ENHANCEMENTS (Tier 2 — High)

Add 5 new automation handlers to `apps/web/lib/automation/`. Follow existing patterns: event-driven, idempotent, fire-and-forget dispatch, use `AUTOMATION_CONFIG` for guardrails.

#### E1. Financial Model Auto-Initialization

New handler file: `financialInit.ts`. On `triage.completed` event, auto-populate `Deal.financialModelAssumptions` with: buildable SF (acreage × 43560 × SKU coverage ratio), target IRR from triage output, market exit cap rate from parish data, default 5-year hold. Only populate if `financialModelAssumptions` is null (don't overwrite user edits). Register handler and add test suite.

#### E2. Task Deadline Monitoring

New handler file: `deadlineMonitoring.ts`. New cron route: `/api/cron/deadline-check` (daily 7 AM). Query tasks where `dueAt < now()` and `status != DONE`. For each, create `[AUTO]` notification task for the deal owner. For tasks aging >30 days without status change, escalate priority to HIGH. Add `AUTOMATION_CONFIG` entries for thresholds. Test suite with 10+ cases.

#### E3. Contingency Document Extraction

Enhance existing `documents.ts` handler. After document classification and extraction (`upload.created` event), add business logic: if `docType == phase_i_esa` and extracted RECs found, auto-create `EnvironmentalAssessment` record and "Schedule Phase II ESA" task. If `docType == appraisal` and appraised value < `DealTerms.offerPrice * 0.95`, create HIGH priority "Appraisal Gap — Renegotiate" task. If `docType == financing_commitment`, compare terms to `DealFinancing` model and flag discrepancies. Test suite.

#### E4. Market Condition Monitoring

New handler file: `marketMonitoring.ts`. New cron route: `/api/cron/market-monitor` (daily 8 AM). For each parish with active deals: fetch latest market metrics (cap rates, absorption). Compare to 30-day-ago values. If cap rate change > 50bps, create notification tasks on all active deals in that parish flagging re-underwriting. If rate environment shifts > 100bps, flag DSCR recalculation needed across portfolio. Test suite.

#### E5. Automated Knowledge Capture

New handler file: `knowledgeCapture.ts`. On `deal.statusChanged` to EXITED or KILLED, extract deal metadata (SKU, parish, strategy, actual timeline, triage predictions, outcome metrics) and store as knowledge base entry via `store_knowledge_entry` tool. Include variance analysis: predicted vs. actual IRR, timeline, risk materializations. Test suite.

**Acceptance for all E tasks:** Each handler registered in `handlers.ts`. Each has test suite (Jest, `jest.mock` pattern). Event dispatch from API routes with `.catch(() => {})`. `AUTOMATION_CONFIG` updated with new thresholds. Cron routes protected with `CRON_SECRET`.

---

### PHASE F: ARTIFACT TEMPLATES (Tier 1 — Critical)

Build the 4 highest-priority missing artifact templates. The Playwright rendering engine and template system already exist in `packages/artifacts/`.

#### F1. TRIAGE_PDF template

6-page report: Executive Summary (deal name, recommendation, triage tier, key risks), Site Overview (address, acreage, zoning, map thumbnail), Entitlement Analysis (recommended strategy, approval probability, timeline), Financial Summary (projected IRR, cap rate, equity multiple from pro forma), Risk Matrix (all identified risks by category and severity), Next Actions (prioritized task list). Pull all data from deal context, triage output, and financial model.

#### F2. SUBMISSION_CHECKLIST_PDF template

Jurisdiction-specific submission requirements checklist. Pull from parish pack data. Sections: Application Forms, Required Drawings/Plans, Environmental Reports, Traffic Studies, Public Notice Requirements, Fee Schedule. Each item has checkbox, description, and status (complete/pending/not applicable).

#### F3. BUYER_TEASER_PDF template

1-page marketing document: Property photo placeholder, key metrics table (acreage, SF, NOI, cap rate, asking price), location highlights, investment thesis (2-3 sentences from agent analysis), contact information. Branded with GPC logo placeholder.

#### F4. EXIT_PACKAGE_PDF template

Multi-page disposition package: Executive Summary, Property Description, Financial Performance (historical NOI, rent roll summary, occupancy trends), Market Overview (parish metrics, comp sales), Investment Highlights, Asking Price and Terms.

**Acceptance for all F tasks:** Template file exists in `packages/artifacts/templates/`. Generate endpoint produces valid PDF. Content pulls from live deal data. Artifact auto-generation triggers from automation handlers for triage and exit-marketed events.

---

### PHASE G: PORTFOLIO ANALYTICS DEPTH (Tier 2 — High)

#### G1. Concentration Risk Dashboard

Add to `/portfolio` page: Herfindahl-Hirschman Index (HHI) by parish, by SKU, by lender. Render as gauge charts with thresholds (green < 0.25, yellow 0.25–0.5, red > 0.5). Show top-3 exposure by each dimension. Alert badge when any HHI > 0.5.

#### G2. Deal Velocity & Throughput Metrics

Add to `/portfolio` or `/command-center`: average days in each pipeline stage (with median, p75, p90). Kill rate by stage (percentage of deals killed at each status). Funnel leakage visualization showing drop-off from INTAKE to EXITED. Trend chart: are we getting faster or slower quarter over quarter?

#### G3. Capital Deployment Tracking

New Prisma model: `CapitalDeployment` (`dealId`, `stage`, `capitalCommitted`, `capitalDeployed`, `nonRecoverableExpense`, `deploymentDate`, `orgId`). Dashboard widget showing: total committed vs. deployed, cost per active parcel, cost per acre, deployment efficiency by stage, sunk cost on killed deals.

#### G4. Debt Maturity Wall

Query `DealFinancing` records to build a calendar view of loan maturities by quarter. Show total debt maturing per quarter, count of deals affected, and refinance risk scoring. Alert when >20% of portfolio debt matures within 12 months.

#### G5. Outcome vs. Prediction Tracking

Compare triage-predicted metrics (IRR, timeline, risk score) to actual outcomes (from `DealOutcome` records). Compute systematic biases: average IRR overestimate, average timeline underestimate, risk accuracy score. Surface as "Triage Calibration" chart in the Portfolio Outcomes tab.

**Acceptance for all G tasks:** Each metric renders in portfolio UI. Data sourced from real deal records. Charts responsive. Loading states for async data. Calculations correct on sample data.

---

### PHASE H: QUALITY ASSURANCE (After Every Phase)

After each phase (A through G):

1. Run `pnpm typecheck` from repo root. Zero errors.
2. Run `pnpm test` from repo root. All existing tests pass.
3. Run `pnpm lint`. No new errors (warnings acceptable).
4. For schema changes: `pnpm db:migrate` creates clean migration.
5. New code has test coverage: API routes tested, automation handlers tested (Jest pattern), agent tools have at least one test.
6. Update `ROADMAP.md` with completed items and status.
7. Commit with descriptive message: `phase-X: [scope] description`

**Do not proceed to the next phase if any check fails.** Fix the issue first. This is non-negotiable.

---

## 3. Deliverables Summary

| # | Deliverable | Scope | Priority |
|---|-------------|-------|----------|
| **A** | UI Consolidation (20 → 10 sidebar items) | Delete /deploy, merge 8 routes, update sidebar | CRITICAL |
| **B** | Deal Schema Expansion (7 new models) | DealTerms, EntitlementPath, Environmental, Financing, Risk, Stakeholder, Title/Survey | CRITICAL |
| **C** | Financial Model Depth (6 enhancements) | Rent roll, construction budget, capital stack, stress testing, exit modeling, tax integration | CRITICAL |
| **D** | Agent Tool Depth (7 new tools) | Entitlement recommendation, comps analysis, debt optimization, Phase II scoping, title analysis, zoning checklist, exit scenarios | HIGH |
| **E** | Automation Enhancements (5 new handlers) | Financial init, deadline monitoring, contingency extraction, market monitoring, knowledge capture | HIGH |
| **F** | Artifact Templates (4 templates) | Triage PDF, submission checklist, buyer teaser, exit package | CRITICAL |
| **G** | Portfolio Analytics (5 enhancements) | Concentration risk, deal velocity, capital deployment, debt maturity wall, outcome tracking | HIGH |

**Total estimated scope:** ~40 discrete work items across 7 phases. Execute in order A → B → C → F → D → E → G (critical phases first, then high-priority). Phase H quality checks apply after every phase.

**End state:** A 10-item sidebar with institutional-grade deal tracking, underwriting-depth financial modeling, 7 new agent tools, 5 new automation loops, 4 production artifact templates, and portfolio analytics that surface concentration risk, deal velocity, and triage calibration. No functionality lost. Every enhancement is additive.

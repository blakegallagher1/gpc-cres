# Single Agent Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 17 agents with one `EntitlementOS` agent on `gpt-5.4`, deduplicating ~118 tools into one array, merging system prompts, and deleting ~3,000 lines of routing/handoff code.

**Architecture:** Single `Agent` from `@openai/agents` SDK with all tools, one structured system prompt with domain sections, no handoffs. `createConfiguredCoordinator()` replaced by `createEntitlementOSAgent()` called from the same site in `executeAgent.ts`.

**Tech Stack:** TypeScript, `@openai/agents` SDK, Prisma, Vitest

**Design doc:** `docs/plans/2026-03-25-single-agent-consolidation-design.md`

---

### Task 1: Update model config

**Files:**
- Modify: `packages/shared/src/openaiModels.ts`

**Step 1: Replace 16 model entries with 1**

Change from:
```typescript
export const AGENT_MODEL_IDS = {
  coordinator: "gpt-5.2",
  finance: "gpt-5.2",
  legal: "gpt-5.2",
  // ... 12 more
} as const;
```

To:
```typescript
export const AGENT_MODEL_ID = "gpt-5.4" as const;

/** @deprecated Use AGENT_MODEL_ID instead */
export const AGENT_MODEL_IDS = {
  coordinator: AGENT_MODEL_ID,
  finance: AGENT_MODEL_ID,
  legal: AGENT_MODEL_ID,
  research: AGENT_MODEL_ID,
  risk: AGENT_MODEL_ID,
  screener: AGENT_MODEL_ID,
  dueDiligence: AGENT_MODEL_ID,
  entitlements: AGENT_MODEL_ID,
  design: AGENT_MODEL_ID,
  operations: AGENT_MODEL_ID,
  marketing: AGENT_MODEL_ID,
  tax: AGENT_MODEL_ID,
  marketIntel: AGENT_MODEL_ID,
  marketTrajectory: AGENT_MODEL_ID,
} as const;
```

Keep the deprecated `AGENT_MODEL_IDS` export temporarily so no imports break during the transition. It will be cleaned up in later tasks.

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add packages/shared/src/openaiModels.ts
git commit -m "feat(agents): add AGENT_MODEL_ID (gpt-5.4) for single agent consolidation"
```

---

### Task 2: Create deduplicated tool array

**Files:**
- Modify: `packages/openai/src/tools/index.ts`

**Step 1: Create the unified tool array**

After the existing specialist arrays (keep them for now — they'll be removed in Task 6), add:

```typescript
/**
 * Unified tool set for the single EntitlementOS agent.
 * Deduplicates all specialist tools into one array.
 */
export const entitlementOsTools = [
  // --- Core: Deals, Tasks, Parcels ---
  query_org_sql,
  getDealContext,
  listDeals,
  createDeal,
  updateDealStatus,
  createTask,
  updateTask,
  listTasks,
  create_tasks,
  searchParcels,
  getParcelDetails,
  updateParcel,
  addParcelToDeal,
  describeParcelSet,
  listParcelSets,

  // --- Screening ---
  screenZoning,
  screenFlood,
  screenSoils,
  screenWetlands,
  screenEpa,
  screenTraffic,
  screenLdeq,
  screenFull,
  screenBatch,

  // --- Property Database ---
  queryPropertyDbSql,
  computeDriveTimeArea,
  recall_property_intelligence,
  store_property_finding,

  // --- Finance & Underwriting ---
  calculate_proforma,
  calculate_debt_sizing,
  calculate_development_budget,
  get_rent_roll,
  model_capital_stack,
  stress_test_deal,
  optimize_debt_structure,
  model_exit_scenarios,
  analyze_portfolio,
  run_underwriting,
  run_underwriting_workflow,
  summarize_comps,
  get_historical_accuracy,
  record_deal_outcome,
  record_outcome,

  // --- Acquisition / Asset Mgmt / Capital Markets ---
  acquisition_dcf_analysis,
  acquisition_cap_rate_evaluation,
  acquisition_rent_roll_analysis,
  acquisition_internal_comparable_sales,
  acquisition_investment_returns,
  asset_lease_admin_summary,
  asset_tenant_exposure_analysis,
  asset_noi_optimization_plan,
  asset_capital_plan_summary,
  asset_operations_health,
  capital_debt_sizing_overview,
  capital_lender_outreach_brief,
  capital_disposition_analysis,
  capital_refinance_scenarios,
  capital_stack_optimization,

  // --- Legal & Entitlements ---
  zoningMatrixLookup,
  parishPackLookup,
  analyze_title_commitment,
  recommend_entitlement_path,
  generate_zoning_compliance_checklist,
  predict_entitlement_path,
  get_entitlement_feature_primitives,
  get_entitlement_intelligence_kpis,
  get_jurisdiction_pack,

  // --- Risk & Evidence ---
  floodZoneLookup,
  evidenceSnapshot,
  compareEvidenceHash,
  assess_uncertainty,
  request_reanalysis,
  estimate_phase_ii_scope,

  // --- Market Intelligence ---
  analyze_comparable_sales,
  search_comparable_sales,
  calculate_market_metrics,
  query_market_data,
  analyze_market_workflow,
  queryBuildingPermits,
  searchNearbyPlaces,
  get_area_summary,
  get_poi_density,

  // --- Documents ---
  query_document_extractions,
  get_document_extraction_summary,
  compare_document_vs_deal_terms,
  search_document_content,
  run_data_extraction_workflow,

  // --- Artifacts & Reporting ---
  generate_artifact,
  attach_artifact,
  triage_deal,
  generate_dd_checklist,
  evaluate_run,

  // --- Memory & Knowledge ---
  record_memory_event,
  get_entity_memory,
  store_memory,
  get_entity_truth,
  lookup_entity_by_address,
  ingest_comps,
  search_knowledge_base,
  search_procedural_skills,
  search_similar_episodes,
  store_knowledge_entry,
  get_shared_context,
  share_analysis_finding,
  log_reasoning_trace,

  // --- Marketing & Buyers ---
  searchBuyers,
  addBuyer,
  logOutreach,

  // --- Design ---
  calculate_site_capacity,
  estimate_construction_cost,

  // --- Tax ---
  calculate_depreciation_schedule,
  calculate_cost_segregation_estimate,
  calculate_1031_deadlines,

  // --- Operations ---
  create_milestone_schedule,
  estimate_project_timeline,

  // --- Scoring ---
  parcelTriageScore,
  hardFilterCheck,
];
```

**Step 2: Verify tool count**

```bash
grep -c '^\s\+\w' # count entries - should be ~115, under 128
```

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add packages/openai/src/tools/index.ts
git commit -m "feat(tools): create unified entitlementOsTools array (deduplicated ~115 tools)"
```

---

### Task 3: Create the EntitlementOS agent definition

**Files:**
- Create: `packages/openai/src/agents/entitlement-os.ts`

**Step 1: Write the agent**

Create `packages/openai/src/agents/entitlement-os.ts`. This file defines the single `EntitlementOS` agent with:
- Model: imported `AGENT_MODEL_ID` (gpt-5.4)
- System prompt: merged from coordinator + specialist domain sections
- No handoffs

Read the coordinator system prompt from `coordinator.ts` (the `COORDINATOR_INSTRUCTIONS` string, ~358 lines). Read each specialist agent file to extract the unique domain guidance (the lines in their system prompts that are NOT boilerplate about role/tools). Merge into one structured prompt.

The prompt should follow this structure:
```
# EntitlementOS — CRE Investment Intelligence Agent

## Identity
You are EntitlementOS, the AI operating system for Gallagher Property Company...
[from coordinator.ts role section]

## Company Focus
[from coordinator.ts — light industrial, outdoor storage, truck parking, Louisiana]

## Deal Pipeline
[from coordinator.ts — TRIAGE → DUE_DILIGENCE → ENTITLEMENTS → FINANCE → EXECUTION]

## Domain Expertise

### Finance & Underwriting
[from finance.ts — key rules about sensitivity ranges, disclaimers, DCF methodology]
[from capital-markets.ts — debt sizing, disposition analysis guidance]
[from acquisition-underwriting.ts — cap rate, rent roll analysis approach]

### Legal & Entitlements
[from legal.ts — no legal advice, cite ordinances, risk framing]
[from entitlements.ts — zoning analysis, approval pathway mapping]

### Environmental Screening & Risk
[from risk.ts — uncertainty quantification, hazard assessment protocol]
[from screener.ts — parcel filtering, batch screening workflow]
[from dueDiligence.ts — Phase I/II environmental, flood risk, insurance]

### Market Intelligence
[from research.ts — competitive analysis, asset research methodology]
[from marketIntel.ts — comparable analysis, neighborhood metrics]
[from marketTrajectory.ts — growth indicators, permit activity]

### Operations & Project Management
[from operations.ts — milestone tracking, timeline estimation]
[from design.ts — site capacity, construction cost estimation]

### Tax Strategy
[from tax.ts — depreciation, cost segregation, 1031 exchange caveats]

### Marketing & Dispositions
[from marketing.ts — buyer targeting, outreach strategy]

## Output Standards
[merged from financeOutputGuardrail + legalOutputGuardrail rules]
- Always include confidence score and evidence citations
- Never present financial projections without sensitivity ranges
- Never provide legal advice — frame as risk analysis with ordinance citations
- Date-stamp all market claims
- Flag uncertainty explicitly

## Memory & Learning Protocol
[from coordinator.ts — shared context, knowledge base, entity memory usage]

## Property Database
[from coordinator.ts — when/how to use screening tools, SQL patterns, parcel lookup]
```

Agent definition:
```typescript
import { Agent } from "@openai/agents";
import { AGENT_MODEL_ID } from "@entitlement-os/shared";

const ENTITLEMENT_OS_INSTRUCTIONS = `...merged prompt...`;

export const entitlementOsAgent = new Agent({
  name: "EntitlementOS",
  model: AGENT_MODEL_ID,
  instructions: ENTITLEMENT_OS_INSTRUCTIONS,
  modelSettings: {
    providerData: {
      prompt_cache_key: "entitlement-os",
    },
  },
});
```

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add packages/openai/src/agents/entitlement-os.ts
git commit -m "feat(agents): create single EntitlementOS agent with merged domain prompt (gpt-5.4)"
```

---

### Task 4: Rewrite `createConfiguredCoordinator` → `createEntitlementOSAgent`

**Files:**
- Modify: `packages/openai/src/agents/index.ts`

**Step 1: Add new function**

Keep the existing `createConfiguredCoordinator` temporarily (for backwards compat). Add a new function:

```typescript
import { entitlementOsAgent } from "./entitlement-os.js";
import { entitlementOsTools } from "../tools/index.js";

export async function createEntitlementOSAgent(
  options?: {
    intent?: QueryIntent | null;
    pluginTools?: Tool[];
  },
): Promise<Agent> {
  const tools = [
    ...instrumentAgentTools(
      entitlementOsAgent.name,
      filterUnsupportedAgentTools([
        ...entitlementOsTools,
        ...(options?.pluginTools ?? []),
      ]),
    ),
  ];

  return entitlementOsAgent.clone({
    tools,
    instructions: async (runContext, agent) => {
      // Keep lazy context injection (deal data, parcel info)
      const lazyCtx = new LazyContext(runContext);
      const dealContext = await lazyCtx.getDealContext();
      const baseInstructions = typeof agent.instructions === "string"
        ? agent.instructions
        : await agent.instructions(runContext, agent);
      return dealContext
        ? `${baseInstructions}\n\n## Current Deal Context\n${dealContext}`
        : baseInstructions;
    },
  });
}
```

**Step 2: Update the export**

Add `createEntitlementOSAgent` to the package exports. Keep `createConfiguredCoordinator` as a deprecated wrapper that calls `createEntitlementOSAgent`.

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add packages/openai/src/agents/index.ts
git commit -m "feat(agents): add createEntitlementOSAgent() factory — single agent with all tools"
```

---

### Task 5: Switch executeAgent.ts to use the new agent

**Files:**
- Modify: `apps/web/lib/agent/executeAgent.ts`

**Step 1: Find and replace the coordinator creation call**

Search for `createConfiguredCoordinator` or `createIntentAwareCoordinator` in `executeAgent.ts`. Replace with `createEntitlementOSAgent`.

The key change:
```typescript
// Before:
const agent = await createConfiguredCoordinator(intent);

// After:
const agent = await createEntitlementOSAgent({ intent });
```

Keep the `intent` parameter passing — it's used for logging/analytics, not routing.

**Step 2: Run typecheck and tests**

```bash
pnpm typecheck
pnpm vitest run --reporter=verbose -- executeAgent
```

**Step 3: Commit**

```bash
git add apps/web/lib/agent/executeAgent.ts
git commit -m "feat(agents): switch executeAgent to createEntitlementOSAgent"
```

---

### Task 6: Remove consult tools and update CF Worker export

**Files:**
- Modify: `packages/openai/src/tools/toolCatalog.ts` — remove consult tool entries
- Modify: `infra/cloudflare-agent/scripts/export-tools.ts` — remove consult tool stubs
- Modify: `packages/openai/src/agents/index.ts` — remove `SPECIALIST_CONSULT_TOOLS`, `buildSpecialistConsultTools()`

**Step 1: Remove consult tools from toolCatalog**

Search for `consult_finance_specialist`, `consult_risk_specialist`, `consult_legal_specialist`, `consult_market_trajectory_specialist` in `toolCatalog.ts` and delete those entries.

**Step 2: Remove consult tool stubs from CF Worker export**

In `export-tools.ts`, remove the hardcoded consult tool function schemas.

**Step 3: Remove consult infrastructure from agents/index.ts**

Delete `SPECIALIST_CONSULT_TOOLS` array, `buildSpecialistConsultTools()` function, and any references to consult tools.

**Step 4: Run typecheck and build**

```bash
pnpm typecheck
cd infra/cloudflare-agent && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/openai/src/tools/toolCatalog.ts infra/cloudflare-agent/scripts/export-tools.ts packages/openai/src/agents/index.ts
git commit -m "refactor(agents): remove consult tools — single agent doesn't self-consult"
```

---

### Task 7: Delete specialist agent files and clean up routing

**Files:**
- Delete: 17 agent files (all except `entitlement-os.ts`, `index.ts`, `contextLoader.ts`)
- Modify: `packages/openai/src/agents/index.ts` — remove specialist imports, `specialistAgents` array, `SPECIALIST_INTENT_MAP`, `buildSpecialistAgentConfigs()`, `buildSpecialistTeam()`, `withTools()`, old `createConfiguredCoordinator()`

**Step 1: Delete specialist agent files**

```bash
cd packages/openai/src/agents
rm coordinator.ts legal.ts finance.ts research.ts risk.ts screener.ts \
   dueDiligence.ts entitlements.ts design.ts operations.ts marketing.ts \
   tax.ts marketIntel.ts marketTrajectory.ts capital-markets.ts \
   acquisition-underwriting.ts asset-management.ts
```

**Step 2: Clean agents/index.ts**

Remove:
- All 17 specialist agent imports
- `specialistAgents` array export
- `SPECIALIST_INTENT_MAP`
- `buildSpecialistAgentConfigs()` function
- `buildSpecialistTeam()` function
- `buildSpecialistConsultTools()` function (if not done in Task 6)
- `withTools()` function
- Old `createConfiguredCoordinator()` function

Keep:
- `createEntitlementOSAgent()` (from Task 4)
- `QueryIntent` imports/re-exports (used for logging)
- `LazyContext` imports
- `instrumentAgentTools`, `filterUnsupportedAgentTools`
- `initAgentsSentry`

**Step 3: Remove specialist tool arrays from tools/index.ts**

Delete: `legalTools`, `researchTools`, `riskTools`, `financeTools`, `screenerTools`, `marketingTools`, `dueDiligenceTools`, `entitlementsTools`, `operationsTools`, `marketIntelTools`, `designTools`, `marketTrajectoryTools`, `taxTools`, `ALL_AGENT_TOOL_GROUPS`.

Keep: `coordinatorTools` renamed/aliased to `entitlementOsTools` (or already created in Task 2), `ALL_AGENT_TOOLS`, `ALL_COORDINATOR_TOOL_OBJECTS` (update to reference `entitlementOsTools`).

**Step 4: Run typecheck**

```bash
pnpm typecheck
```

Fix any remaining import errors.

**Step 5: Commit**

```bash
git add -A packages/openai/src/agents/ packages/openai/src/tools/index.ts
git commit -m "refactor(agents): delete 17 specialist agents, clean routing — single EntitlementOS agent"
```

---

### Task 8: Update tests

**Files:**
- Modify: `packages/openai/test/phase1/agents/coordinator.phase1.test.ts`
- Any other tests that reference specialist agents

**Step 1: Update coordinator phase1 test**

The test has 3 assertions that will fail:
1. `expect(configuredHandoffs).toHaveLength(specialistAgents.length)` → change to `toHaveLength(0)` or update to verify single agent has all tools
2. `expect(toolNames.has("consult_finance_specialist"))` → remove these assertions
3. Instructions containing `consult_finance_specialist` → update to check for domain sections

Rewrite the test to verify:
- Agent is created with `gpt-5.4` model
- Agent has ~115 tools (use `toBeGreaterThan(100)`)
- Agent has no handoffs
- Agent instructions contain key domain sections

**Step 2: Run full test suite**

```bash
pnpm test
```

Fix any other test failures.

**Step 3: Commit**

```bash
git add packages/openai/test/ apps/web/__tests__/
git commit -m "test(agents): update tests for single EntitlementOS agent architecture"
```

---

### Task 9: Update UI AgentIndicator

**Files:**
- Modify: `apps/web/components/chat/AgentIndicator.tsx`

**Step 1: Add EntitlementOS to color map**

Add `"EntitlementOS"` with a primary color. Keep existing specialist colors as fallbacks (they won't appear but won't break if old data is displayed).

**Step 2: Commit**

```bash
git add apps/web/components/chat/AgentIndicator.tsx
git commit -m "feat(ui): add EntitlementOS agent color to AgentIndicator"
```

---

### Task 10: Full verification and deploy

**Step 1: Run full verification gate**

```bash
pnpm lint
pnpm typecheck
pnpm test
OPENAI_API_KEY=placeholder pnpm build
```

All must pass.

**Step 2: Commit the plan doc**

```bash
git add docs/plans/
git commit -m "docs: single agent consolidation implementation plan"
```

**Step 3: Push**

```bash
git push origin main
```

Triggers Vercel deploy via GitHub integration.

**Step 4: Verify in Sentry**

After deploy, monitor for 10 minutes. Check Sentry for any new errors related to agent creation, tool resolution, or missing imports.

**Step 5: Test a chat interaction**

Send a message through the chat that exercises multiple domains (e.g., "Screen this parcel for flood risk and estimate what it would cost to develop"). Verify:
- Single agent responds (no handoff indicators)
- Tools are invoked correctly
- Response quality is good
- TrajectoryLog records show `agentId: "EntitlementOS"`

---

## Commit sequence

1. `feat(agents): add AGENT_MODEL_ID (gpt-5.4) for single agent consolidation`
2. `feat(tools): create unified entitlementOsTools array`
3. `feat(agents): create single EntitlementOS agent with merged domain prompt`
4. `feat(agents): add createEntitlementOSAgent() factory`
5. `feat(agents): switch executeAgent to createEntitlementOSAgent`
6. `refactor(agents): remove consult tools`
7. `refactor(agents): delete 17 specialist agents, clean routing`
8. `test(agents): update tests for single agent architecture`
9. `feat(ui): add EntitlementOS agent color`
10. `docs + verification + deploy`

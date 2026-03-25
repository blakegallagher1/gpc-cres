# Single Agent Consolidation Design

**Date:** 2026-03-25
**Status:** Approved
**Author:** Blake Gallagher + Claude

## Problem

17 agents (Coordinator + 16 specialists), 127+ tools, hybrid handoff/consult routing. Every specialist query costs 2-3 LLM round-trips (Coordinator decides → specialist processes → Coordinator synthesizes). Routing errors, maintenance burden, and attribution confusion in the learning pipeline. Modern models (GPT-5.4 with 128-tool support, 128K context) make this architecture unnecessary.

## Solution

Replace all 17 agents with a single `EntitlementOS` agent running `gpt-5.4` with all tools deduplicated into one array (~80-90 unique tools) and one structured system prompt (~400-500 lines).

## Architecture

### Before
```
User → Coordinator (gpt-5.2) → handoff → Specialist (gpt-5.2) → tools → Coordinator → User
```

### After
```
User → EntitlementOS (gpt-5.4) → tools → User
```

## Key Decisions

### Keep
- **QueryIntent enum** — useful for analytics, logging, learning pipeline. Stop using for routing.
- **Tool implementations** — all existing tools unchanged. Just deduplicated into one array.
- **Learning pipeline** — trajectory logs, episodic entries, procedural skills. Works better with one agent (clean tool sequence attribution).
- **Lazy context loading** — deal data, parcel info still injected at runtime.
- **AgentIndicator UI component** — derive domain context from QueryIntent for display ("Working on finance analysis...").

### Delete
- **16 specialist agent files** — `legal.ts`, `finance.ts`, `research.ts`, `risk.ts`, `screener.ts`, `dueDiligence.ts`, `entitlements.ts`, `design.ts`, `operations.ts`, `marketing.ts`, `tax.ts`, `market-intel.ts`, `market-trajectory.ts`, `capital-markets.ts`, `acquisition-underwriting.ts`, `asset-management.ts`
- **Coordinator agent file** — `coordinator.ts` replaced by new `entitlement-os.ts`
- **Consult tools** — `consult_finance_specialist`, `consult_risk_specialist`, `consult_legal_specialist`, `consult_market_trajectory_specialist`. With one agent, self-consultation is nonsensical.
- **Specialist routing logic** — `SPECIALIST_INTENT_MAP`, `buildSpecialistAgentConfigs()`, `buildSpecialistTeam()`, `buildSpecialistConsultTools()`, `withTools()` per-specialist cloning (~500 lines in `agents/index.ts`)
- **14 specialist tool arrays** — `legalTools`, `financeTools`, etc. Replaced by one `allTools` array.
- **Output guardrail functions** — `financeOutputGuardrail`, `legalOutputGuardrail`. Rules merged into prompt.

### Modify
- **`agents/index.ts`** — `createConfiguredCoordinator()` → `createEntitlementOSAgent()`. Clean function, no specialist filtering.
- **`shared/src/openaiModels.ts`** — 16 model entries → 1 (`gpt-5.4`)
- **`tools/index.ts`** — specialist arrays → one deduplicated `allTools` array
- **`infra/cloudflare-agent/scripts/export-tools.ts`** — remove consult tool stubs
- **`tools/toolCatalog.ts`** — remove consult tool entries
- **Tests** — update 3 failing tests in `coordinator.phase1.test.ts`
- **`executeAgent.ts`** — call `createEntitlementOSAgent()` instead of `createConfiguredCoordinator(intent)`

## System Prompt Structure

```
# EntitlementOS — CRE Investment Intelligence Agent

## Role & Company Context
[GPC focus areas, deal criteria, operating philosophy]

## Deal Pipeline & Workflow
[TRIAGE → DD → ENTITLEMENTS → FINANCE → EXECUTION]

## Domain Expertise
### Finance & Underwriting
[Key rules: sensitivity ranges required, disclaimer on projections]
### Legal & Entitlements
[Key rules: no legal advice, always cite ordinance sections]
### Environmental & Risk
[Key rules: cite FEMA/EPA sources, flag uncertainty]
### Market Intelligence
[Key rules: use comps, date-stamp market claims]
### Operations & Tax
[Key rules: depreciation caveats, entity structure disclaimers]

## Memory & Learning Protocol
[Shared context, knowledge base, entity memory usage]

## Output Standards
[Confidence scores, evidence citations, structured findings]

## Property Database Routing
[When to query parcels, screening tools, SQL patterns]
```

## Blast Radius

| Category | Files | Severity | Fix |
|----------|-------|----------|-----|
| Agent imports/routing | `agents/index.ts` | High | Rewrite function |
| Consult tool references | 5 locations | High | Delete tools + refs |
| Output guardrails | 2 functions | High | Merge into prompt |
| UI agent display | `AgentIndicator.tsx` | Medium | Keep, derive from intent |
| Tests | 3 tests | Low | Update assertions |
| CF Worker export | `export-tools.ts` | Medium | Remove consult stubs |

## Rollback

Single git revert restores all 17 agents. The new `createEntitlementOSAgent()` replaces `createConfiguredCoordinator()` at the same call site in `executeAgent.ts`.

## Expected Impact

- **~40-60% latency reduction** on specialist queries (eliminate handoff round-trips)
- **~30% token cost reduction** (one prompt, not coordinator + specialist)
- **~3,000-4,000 lines deleted**
- **Clean learning attribution** (tool sequences captured correctly, single agentId)
- **Model upgrade** from gpt-5.2 → gpt-5.4 improves quality across all domains

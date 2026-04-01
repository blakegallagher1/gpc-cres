# CUA Self-Teaching Browser Agent — Design Document

**Date:** 2026-04-01
**Status:** Approved
**Author:** Blake Gallagher + Claude

## Context

The CUA browser agent fails on complex multi-step tasks like searching LACDB for commercial properties. A request to "gather all commercial RE for sale on LACDB in 70808" resulted in a 2-minute timeout with no data returned. The CUA worker was still navigating when the polling layer gave up. After failure, the agent asked the user for help instead of retrying autonomously.

**Root causes:**
1. Polling timeout (120s) is shorter than the worker's execution capacity (24 turns, ~6 min)
2. No retry or adaptation loop — single-shot dispatch, then surrender
3. No task decomposition — complex objectives sent as a single monolithic instruction
4. No knowledge bootstrapping — agent goes in blind with zero site-specific context
5. No partial-progress capture — everything learned during a failed task is lost

**Goal:** Make the CUA agent autonomously iterate until it completes browser tasks through self-teaching and self-improvement, without requiring human guidance between attempts.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Autonomy level | Full — retry without asking, escalate only after budget exhausted | Most AGI-like; human stays out of the loop |
| UI change handling | Playbook-first, fallback to native vision | Fast for known sites, resilient when sites change |
| Orchestration layer | Agent prompt level — LLM reasoning, not hardcoded pipelines | Intelligence in the model, not in code; improves as LLM improves |
| Cost management | Soft cap of 5 `browser_task` calls per objective, then user checkpoint | Prevents runaway cost while allowing complex tasks |
| Knowledge visibility | Auto-save with brief summary, inspectable on demand | Agent owns its learning; user has visibility without curation burden |

---

## Architecture

### The Autonomous Browser Loop

Replace the current linear workflow (search KB → 1 browser_task → ask user on failure) with a multi-phase reasoning loop executed entirely at the agent prompt level.

```
User objective
    ↓
1. PLAYBOOK LOOKUP
   search_knowledge_base("browser playbook {domain}")
   ├─ Has code_snippet → try code mode (Phase 0)
   │   ├─ Success → return result, done
   │   └─ Failure → playbook stale, continue to step 2
   ├─ Has strategy → load as hints for step 3
   └─ Not found → proceed blind
    ↓
2. PLAN (internal reasoning, no tool call)
   Break objective into phases. Default pattern:
     RECON   → discover site structure
     EXECUTE → enter criteria, submit search
     EXTRACT → read and structure results
     PAGINATE → get additional pages
   Free-form override if site doesn't fit pattern.
    ↓
3. EXECUTE PHASES (up to 5 browser_task calls)
   For each phase:
     a. Call browser_task with phase-specific instructions + playbook hints
     b. REFLECT: did it work? What did I learn? What next?
     c. On failure: retry phase (up to 2 retries) with adjusted approach
   If 5 calls used → present partial results, ask user to continue
    ↓
4. ASSEMBLE RESULT
   Combine data from all phases into structured response
    ↓
5. AUTO-SAVE PLAYBOOK
   store_knowledge_entry with domain, phases, strategy, selectors
   Brief summary to user: "Saved LACDB search strategy for next time."
```

### Polling Timeout Fix

Add `timeoutSeconds` parameter to `browser_task` tool. The agent sets it per-call based on phase complexity:

| Phase | Suggested maxTurns | Suggested timeout |
|-------|-------------------|-------------------|
| RECON | 3–5 | 120s |
| EXECUTE | 5–8 | 180s |
| EXTRACT | 5–8 | 180s |
| PAGINATE | 3–5 | 120s |
| Legacy single-call | 24 | 600s |

Default changes from 120s → 300s for backward compatibility with existing single-call patterns.

### Playbook Schema

Stored as knowledge base entries via `store_knowledge_entry(content_type="agent_analysis")`:

```json
{
  "type": "browser_playbook",
  "domain": "lacdb.com",
  "objective_pattern": "commercial property search by ZIP",
  "last_verified": "2026-04-01",
  "success_count": 1,
  "phases": [
    {
      "name": "NAVIGATE_TO_SEARCH",
      "url": "https://lacdb.com/AdvancedSearch",
      "strategy": "Click Advanced Search in top nav or go to /AdvancedSearch",
      "key_elements": { "zip_field": "#txtZip", "type_dropdown": "#ddlPropertyType" }
    },
    {
      "name": "EXECUTE_SEARCH",
      "strategy": "Enter ZIP, select Commercial, select For Sale, click Search",
      "expected_result": "Results table with Address, Price, Type, SqFt columns"
    },
    {
      "name": "EXTRACT_RESULTS",
      "strategy": "Read each row. Extract: address, price, sqft, lot_size, listing_date",
      "pagination": "Next page button at bottom, class .pagination-next"
    }
  ],
  "code_snippet": null
}
```

**Graduation path:** blind → strategy (success_count=1) → code snippet (success_count>=2)

### Retry & Reflection

Each phase gets up to 2 retries (3 total attempts), counted within the 5-call soft cap.

**Failure taxonomy:**

| Failure | Signal | Agent response |
|---------|--------|----------------|
| Timeout | "timed out after N seconds" | Retry with more turns/timeout or simpler instructions |
| Navigation stuck | Wrong page in screenshots | Adjust URL, try alternate path |
| Data not found | Completed but empty | Refine criteria, check site structure |
| Service down | 502/503/connection refused | Abort, report to user (not retryable) |
| Stale playbook | Code mode fails | Clear code_snippet, fall back to native RECON |

**Reflection template** (agent internal reasoning between tool calls):
- Did the phase achieve its goal?
- What went wrong? (timeout / wrong page / empty data / error)
- What did I learn? (new URL, form structure, selector, alternate path)
- What should I do next? (retry with adjustment / next phase / escalate)

### User-Visible Progress

The agent streams brief updates as it works:

```
🔍 Phase 1/4: Reconnaissance on lacdb.com...
✓ Found Advanced Search at /AdvancedSearch. ZIP field, type dropdown, status filter.

🎯 Phase 2/4: Executing search — ZIP 70808, Commercial, For Sale...
✗ Search timed out. Retrying with simplified criteria...
✓ Found 8 results.

📊 Phase 3/4: Extracting listing data...
✓ Extracted 8 listings with address, price, sqft, lot size.

💾 Saved LACDB commercial search strategy for next time.
```

---

## Implementation Scope

**Only 2 files change:**

| File | Change | Nature |
|------|--------|--------|
| `packages/openai/src/agents/entitlement-os.ts` | Replace BROWSER AUTOMATION section (lines 568–617) with autonomous loop protocol | Prompt text only |
| `packages/openai/src/tools/browserTools.ts` | Add `timeoutSeconds` param to Zod schema, use in `pollForResult` | ~15 lines of code |

**What does NOT change:**
- CUA worker (`infra/cua-worker/`) — stays a dumb executor
- Tool registry — no new tools
- Knowledge base tools — `store_knowledge_entry` and `search_knowledge_base` already exist
- Agent coordinator — no routing changes
- UI — progress updates are normal chat messages

---

## Verification Plan

### 1. Unit: timeout parameter
- Confirm `browser_task` Zod schema accepts `timeoutSeconds` (nullable, default 300)
- Confirm `pollForResult` uses the provided timeout instead of hardcoded 120s

### 2. Integration: LACDB search (the original failing task)
- Send: "gather all commercial RE for sale on LACDB in 70808"
- Expect: agent decomposes into phases, calls browser_task multiple times, returns structured data
- Expect: playbook auto-saved to knowledge base

### 3. Integration: repeat LACDB search (playbook reuse)
- Send same query again
- Expect: agent loads playbook, skips RECON, faster completion

### 4. Integration: failure recovery
- Send a task targeting a site with an unusual layout
- Expect: agent retries failed phases with adjusted instructions, up to 2 retries per phase
- Expect: escalates to user after 5 total calls if still failing

### 5. Regression
- `pnpm typecheck` passes
- `pnpm test` passes (existing browser tool tests)
- Existing single-call browser_task usage still works (backward compatible default timeout)

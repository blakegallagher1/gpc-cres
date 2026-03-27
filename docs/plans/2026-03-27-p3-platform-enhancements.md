# P3 Platform Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Plan 13 lower-priority / future patterns covering apply_patch, code interpreter, unified runtime migration, network policies, context injection, metadata merging, and container lifecycle management.

**Architecture:** P3 patterns are primarily architectural decisions, migration paths, and future-proofing. They depend on P0-P2 being substantially complete and represent the long-term evolution toward OpenAI's unified agent runtime.

**Approach:** Design documents and architecture decisions rather than detailed TDD steps. Implementation follows when P0-P2 are stable.

---

### Task 1: apply_patch Tool for File Mutations (Pattern 45)

**Assessment:** The `@openai/agents` SDK includes `ApplyPatchTool` support. GPT-5.3+ is extensively trained on the `*** Begin Patch` / `*** End Patch` unified diff format.

**When to implement:** When agents need to edit deal documents, generate config files, or modify structured data files.

**Design:**
- Check: `grep -r "ApplyPatchTool\|apply_patch" node_modules/@openai/agents/`
- If supported: add `ApplyPatchTool` to agent tool definitions for document editing workflows
- Scope file mutations to artifact directories (evidence bucket, deal-room-uploads)
- Requires human approval gate (Pattern 8) before any file write

**Files:** `packages/openai/src/tools/documentTools.ts` (add apply_patch tool), agent definitions

---

### Task 2: Code Interpreter for Multi-Pass Document Inspection (Pattern 49)

**Assessment:** Code Interpreter runs in an OpenAI-hosted container with Python + common libraries. It can zoom, crop, rotate images before answering.

**When to implement:** When CUA extraction accuracy on complex pages (assessor portals with dense tables, FEMA flood maps) needs improvement beyond crop-and-rerun (P2 Pattern 50).

**Design:**
- Add `{ type: "code_interpreter", container: { type: "auto" } }` to CUA worker tools
- Use for pages with evidence spread across multiple regions
- Combine with structured output JSON schema for bounding boxes
- Use `[x_min, y_min, x_max, y_max]` normalized 0-999 coordinate system

**Files:** `infra/cua-worker/src/responses-loop.ts` (add code_interpreter to tools array)

---

### Task 3: Audit detail: "original" on Screenshots (Pattern 47)

**Assessment:** Quick verification task. CUA worker should use `detail: "original"` (not "high" or "low") for full-resolution screenshots.

**Action:**
- Read `infra/cua-worker/src/responses-loop.ts` line ~352
- Confirm `detail: "original"` is set on `input_image` items
- If using "high" or "auto", change to "original" for maximum accuracy

**Files:** `infra/cua-worker/src/responses-loop.ts`

---

### Task 4: Confirm Responses API Everywhere (Pattern 39)

**Assessment:** Verify no code paths use `client.chat.completions.create()` — all should use `client.responses.create()` for 40-80% better cache utilization.

**Action:**
- `grep -r "chat.completions" packages/ apps/ infra/`
- Any hits should be migrated to Responses API
- The `@openai/agents` SDK uses Responses API internally, so agent runs are covered
- Check for any direct OpenAI client usage outside the SDK

**Files:** Any files using Chat Completions API

---

### Task 5: Unified Agent Runtime Migration Design (Pattern 40)

**Assessment:** Long-term architecture decision. OpenAI's hosted shell + container_auto + skills represents a potential replacement for the custom CUA worker + gateway proxy + Playwright stack.

**Design Document:**

| Current Component | OpenAI Native Equivalent | Migration Path |
|---|---|---|
| CUA Worker (Playwright + Chromium) | `computer` tool (already used) | Keep — CUA is browser-specific |
| Gateway proxy (FastAPI) | Hosted shell + network_policy | Partial — data queries could migrate |
| Property DB queries | Shell + SQL scripts as skills | Possible for simple queries |
| Artifact generation | Shell + `/mnt/data` + file retrieval | Good fit for reports/PDFs |
| Screenshot capture | `computer` tool screenshots | Already using |
| Auth bootstrap (first-party-auth.ts) | `domain_secrets` | Migrate when hosted CUA supports it |

**Recommendation:** Hybrid approach. Keep CUA worker for browser automation (no native replacement). Migrate data processing and report generation to hosted shell. Keep gateway for property DB (latency-sensitive, private network).

**Files:** Create `docs/architecture/unified-runtime-migration.md`

---

### Task 6: Tools-Write-Disk Pattern (Pattern 41)

**Assessment:** For hosted container usage, intermediate data should be written to `/mnt/data` rather than returned through conversation context.

**Design:**
- Tool outputs that exceed 10K tokens → write to disk, return file reference
- Convention: `{ type: "file_reference", path: "/mnt/data/{tool_name}_{timestamp}.json" }`
- Model can read files via shell tool when needed
- Depends on container persistence (P1 Pattern 25) being active

**Files:** Tool utility in `packages/openai/src/utils/artifactBoundary.ts` (extends P2 Pattern 30)

---

### Task 7: First-Param Context Injection (Pattern 3)

**Assessment:** Standardize how tools receive run context. Currently inconsistent — some tools destructure from second arg, others reach through nested properties.

**Design:**
- Convention: first parameter is always the Zod-validated args, second is typed context
- Create `ToolExecutionContext` type with standardized fields: `{ orgId, userId, conversationId, dealId, runType }`
- Wrapper function that extracts context from SDK's raw context object

**Files:** `packages/openai/src/utils/toolContext.ts`, all tool files

---

### Task 8: Domain-Scoped Network Policy (Pattern 15)

**Assessment:** Two-layer network allowlisting for hosted shell containers. Org-level defines maximum allowed domains; request-level subsets for each job.

**Design:**
- Org-level config: `ALLOWED_DOMAINS=gallagherpropco.com,api.gallagherpropco.com,qdrant.gallagherpropco.com`
- Request-level: each shell tool invocation specifies only the domains it needs
- Requests outside org allowlist error immediately
- Audit log all outbound requests from containers

**Files:** `packages/openai/src/utils/networkPolicy.ts`, env configuration

---

### Task 9: Annotated Metadata Merging (Pattern 6)

**Assessment:** Layer tool descriptions from multiple sources: JSDoc (base), skill manifest (override), runtime context (dynamic). Clear precedence chain.

**When to implement:** After P2 Pattern 14 (JSDoc auto-description) is complete.

**Design:**
- Priority: runtime override > skill manifest > Zod .describe() > JSDoc
- Merge function: `mergeToolDescription(jsdoc, zodDesc, skillDesc, runtimeOverride) → string`

**Files:** `packages/openai/src/utils/descriptionMerge.ts`

---

### Task 10: Sync Auto-Threading (Pattern 4)

**Assessment:** Check if any tools have synchronous execute() functions that could block the event loop.

**Action:**
- Audit all tool execute() functions for synchronous operations
- TypeScript tools using `@openai/agents` SDK are async by default
- If any sync operations found (e.g., `readFileSync`), wrap with worker_threads or convert to async

**Files:** Audit pass on `packages/openai/src/tools/*.ts`

---

### Task 11: Compaction Mode Auto-Selection (Pattern 20)

**Assessment:** Automatically choose between `previous_response_id` (cheapest) and `input`-based compaction.

**Design:**
- If `previous_response_id` is available and response was stored → use `previous_response_id` mode
- If response was not stored (`store: false`) or no response ID → use `input` mode
- Track `store` setting per Responses API call to inform mode selection

**Files:** `packages/openai/src/utils/compactionMode.ts`

---

### Task 12: Container TTL Management (Pattern 21)

**Assessment:** Handle 20-minute container expiry gracefully.

**Design:**
- Track `lastActiveAt` timestamp per container session
- Before reuse, check if `Date.now() - lastActiveAt > 18 * 60 * 1000` (2-min safety margin)
- If expired: fall back to `container_auto` and create new session
- Cleanup: remove expired container references from Prisma

**Files:** `packages/openai/src/utils/containerManager.ts` (extends P1 Pattern 25)

---

### Task 13: Two-Layer Network Allowlisting (Pattern 19)

**Assessment:** Org-level + request-level domain allowlists. Identical to Pattern 15 but scoped to org configuration.

**Design:**
- Org config stored in Prisma: `OrgNetworkPolicy { orgId, allowedDomains[], domainSecrets[] }`
- Request-level `network_policy` must be a subset of org policy
- Validation: `requestDomains.every(d => orgDomains.includes(d))`
- Admin UI for org-level domain management

**Files:** Schema migration, `apps/web/lib/services/networkPolicy.service.ts`

---

## Implementation Sequencing

```
P0 complete → P1 complete → P2 substantially complete
                                     ↓
              ┌──────────────────────┼──────────────────────┐
              ↓                      ↓                      ↓
    Tasks 3,4 (quick audits)  Tasks 1,2,5 (new tools)  Tasks 7-13 (architecture)
              ↓                      ↓                      ↓
        Immediate wins       Medium-term features      Long-term migration
```

## Summary

| Task | Pattern | Type | Effort |
|------|---------|------|--------|
| 1 | #45 apply_patch | New tool | Medium |
| 2 | #49 Code Interpreter | Tool config | Low |
| 3 | #47 Audit detail:original | Verification | Trivial |
| 4 | #39 Audit Responses API | Verification | Low |
| 5 | #40 Unified runtime design | Architecture doc | High |
| 6 | #41 Tools-write-disk | Convention | Low |
| 7 | #3 Context injection | Refactor | Medium |
| 8 | #15 Network policy | Config | Medium |
| 9 | #6 Metadata merging | Utility | Low |
| 10 | #4 Sync threading | Audit | Trivial |
| 11 | #20 Compaction mode | Utility | Low |
| 12 | #21 Container TTL | Lifecycle | Low |
| 13 | #19 Two-layer allowlist | Service + schema | Medium |

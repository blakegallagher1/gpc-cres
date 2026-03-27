# P2 Platform Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 13 medium-priority patterns covering versioned prompts, cache retention, phase metadata, tool output truncation, crop-and-rerun extraction, inline skills, artifact boundaries, JSDoc descriptions, dynamic tool toggles, rich output types, and compaction candidate filtering.

**Architecture:** These patterns optimize existing systems (caching, output handling, extraction accuracy) and add new capabilities (versioned prompts, inline skills, rich outputs). Most are independent.

**Prerequisites:** P0 and P1 plans should be substantially complete before starting P2.

---

### Task 1: Versioned Prompt Management with Rollback (Pattern 34)

**Files:**
- Create: `apps/web/lib/services/promptVersioning.service.ts`
- Modify: `packages/db/prisma/schema.prisma` (add AgentPromptVersion model)

**Implementation:**
- New Prisma model `AgentPromptVersion { id, agentId, version, promptText, score, createdAt, isActive }`
- `createPromptVersion(agentId, promptText)` → auto-increments version
- `getActivePrompt(agentId)` → returns highest-scoring active version
- `revertToVersion(agentId, version)` → sets isActive on target, deactivates current
- Track aggregate quality score per version from P1 graders

**Commit:** `feat(prompts): add versioned prompt management with rollback (Pattern 34)`

---

### Task 2: Extended Prompt Cache Retention (Pattern 37)

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts`
- Modify: `apps/web/lib/agent/executeAgent.ts` (if SDK exposes parameter)

**Implementation:**
- Add `prompt_cache_retention: "24h"` to `client.responses.create()` calls
- Keeps KV cache on GPU for 24h instead of 5-10 min default
- One-line addition per Responses API call site

**Commit:** `feat(cache): enable 24h extended prompt cache retention (Pattern 37)`

---

### Task 3: Monitor cached_tokens in Usage (Pattern 38)

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts` (extract cached_tokens from response.usage)
- Modify: `infra/cua-worker/src/types.ts` (add cachedTokens to TaskResult.cost)

**Implementation:**
- After each Responses API call, read `response.usage.prompt_tokens_details.cached_tokens`
- Add to `totalCachedTokens` accumulator alongside existing `totalInputTokens`
- Include in TaskResult: `cost: { inputTokens, outputTokens, cachedTokens }`
- Log cache hit ratio: `cachedTokens / inputTokens`

**Commit:** `feat(telemetry): track cached_tokens in usage response (Pattern 38)`

---

### Task 4: Preserve phase Metadata on Messages (Pattern 42)

**Files:**
- Modify: `apps/web/lib/agent/agentRunner.ts` (message persistence blocks)

**Implementation:**
- When persisting assistant messages to Prisma, check for `phase` field on output items
- Include phase in the `metadata` JSON column: `{ ...existingMetadata, phase: "commentary" | "final_answer" }`
- Ensure phase is preserved when messages are loaded back for context building
- Critical: dropping phase causes GPT-5.3+ performance degradation

**Commit:** `feat(chat): preserve phase metadata on assistant messages (Pattern 42)`

---

### Task 5: Tool Response Truncation (Pattern 44)

**Files:**
- Create: `packages/openai/src/utils/truncateToolOutput.ts`
- Create: `packages/openai/src/utils/__tests__/truncateToolOutput.test.ts`

**Implementation:**
```typescript
const MAX_OUTPUT_CHARS = 40_000; // ~10K tokens
const PRESERVE_CHARS = 20_000;  // first 5K + last 5K tokens

export function truncateToolOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const head = output.slice(0, PRESERVE_CHARS);
  const tail = output.slice(-PRESERVE_CHARS);
  const dropped = output.length - MAX_OUTPUT_CHARS;
  return `${head}\n\n…[${dropped} characters truncated]…\n\n${tail}`;
}
```

- Apply to all tool execute() return values that are strings
- For JSON objects, `JSON.stringify` then truncate, then note it was truncated

**Commit:** `feat(tools): add tool response truncation at 10K tokens (Pattern 44)`

---

### Task 6: Crop-and-Rerun Focused Extraction (Pattern 50)

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts`
- Create: `infra/cua-worker/src/crop-utils.ts`

**Implementation:**
- Two-pass extraction mode: when initial extraction returns low-confidence data
- Pass 1: full screenshot → model identifies region of interest with coordinates
- Pass 2: crop screenshot to identified region → re-send with `detail: "original"`
- Trigger heuristic: if model's response mentions "cannot read" or confidence < threshold
- Use sharp or canvas for server-side image cropping

**Commit:** `feat(cua): add crop-and-rerun focused extraction mode (Pattern 50)`

---

### Task 7: Inline Skills for Dynamic Playbooks (Pattern 29)

**Files:**
- Create: `packages/openai/src/utils/inlineSkillBuilder.ts`

**Implementation:**
- Convert learned CUA strategies (from DA-007 ProceduralSkill records) into base64 inline skills
- `buildInlineSkill(skill: ProceduralSkill)` → `{ type: "inline", name, description, source: { type: "base64", media_type: "application/zip", data } }`
- Generate SKILL.md from skill metadata + tool sequence
- Zip SKILL.md + any supporting scripts → base64 encode
- Wire into CUA task creation: when a matching procedural skill exists, attach as inline skill

**Commit:** `feat(skills): build inline skills from learned procedural knowledge (Pattern 29)`

---

### Task 8: Artifact Boundary Pattern (Pattern 30)

**Files:**
- Create: `packages/openai/src/utils/artifactBoundary.ts`

**Implementation:**
- For hosted container usage, artifacts write to `/mnt/data/`
- For local CUA, artifacts go to `screenshotDir` (already configured)
- Convention: `{ artifactPath: "/mnt/data/parish-pack-{dealId}.pdf", artifactType: "pdf" }`
- Tool returns file reference instead of full content, keeping context lean
- Retrieval via Containers/Files API or direct file system access

**Commit:** `feat(artifacts): add /mnt/data artifact boundary convention (Pattern 30)`

---

### Task 9: Auto-Description from JSDoc (Pattern 14)

**Files:**
- Create: `packages/openai/src/utils/jsdocToDescription.ts`

**Implementation:**
- Parse JSDoc `@description` and `@param` tags from tool function source
- Use TypeScript compiler API or a simple regex parser
- Auto-populate Zod `.describe()` calls from JSDoc
- Reduces ~200 lines of manual description boilerplate
- Lower ROI if tools don't have JSDoc — may need to add JSDoc first

**Commit:** `feat(tools): auto-extract tool descriptions from JSDoc (Pattern 14)`

---

### Task 10: is_enabled Dynamic Tool Toggle (Pattern 9)

**Files:**
- Create: `packages/openai/src/utils/toolHealthCheck.ts`

**Implementation:**
- Per-tool `is_enabled` callback that checks service health at runtime
- `browser_task`: check CUA worker `/health` endpoint
- Property DB tools: check gateway health via `GATEWAY_PROXY_URL/health`
- Disabled tools are hidden from the model (not sent in tool definitions)
- Cache health check results for 30s to avoid per-request overhead

```typescript
export async function isToolEnabled(toolName: string): Promise<boolean> {
  if (toolName === "browser_task") return checkCuaHealth();
  if (toolName.startsWith("screen_") || toolName === "search_parcels") return checkGatewayHealth();
  return true;
}
```

**Commit:** `feat(tools): add dynamic tool enable/disable based on service health (Pattern 9)`

---

### Task 11: Rich Output Types — ToolOutputImage (Pattern 12)

**Files:**
- Modify: `packages/openai/src/tools/browserTools.ts`

**Implementation:**
- Return CUA screenshots as `ToolOutputImage` objects instead of file path strings
- The model receives screenshots as vision input on the next turn
- Check `@openai/agents` SDK for `ToolOutputImage` support in TypeScript
- If supported: `return { type: "image", image_url: screenshotDataUrl }`

**Commit:** `feat(tools): return CUA screenshots as ToolOutputImage for vision (Pattern 12)`

---

### Task 12: Compaction Candidate Filtering (Pattern 22)

**Files:**
- Create: `packages/openai/src/utils/compactionFiltering.ts`

**Implementation:**
- When using manual compaction (standalone `/responses/compact`), filter candidates
- Preserve user messages verbatim — only compact assistant/tool output items
- Count non-user items to determine when compaction threshold is reached

```typescript
export function selectCompactionCandidates(items: unknown[]): unknown[] {
  return items.filter(item => {
    if (typeof item !== "object" || !item) return false;
    const obj = item as Record<string, unknown>;
    return obj.role !== "user" && obj.type !== "compaction";
  });
}
```

**Commit:** `feat(compaction): add candidate filtering to preserve user messages (Pattern 22)`

---

### Task 13: Verification Gate

**Step 1:** `pnpm typecheck`
**Step 2:** `pnpm test`
**Step 3:** `pnpm build`

---

## Summary

| Task | Pattern | Type |
|------|---------|------|
| 1 | #34 Versioned prompts | New service + schema |
| 2 | #37 Cache retention 24h | Param addition |
| 3 | #38 Track cached_tokens | Telemetry |
| 4 | #42 Preserve phase | Message persistence fix |
| 5 | #44 Truncation 10K | New utility |
| 6 | #50 Crop-and-rerun | CUA enhancement |
| 7 | #29 Inline skills | Learning → skills bridge |
| 8 | #30 Artifact boundary | Convention/utility |
| 9 | #14 JSDoc descriptions | Tooling automation |
| 10 | #9 Dynamic toggle | Health-based enablement |
| 11 | #12 Rich outputs | CUA screenshot format |
| 12 | #22 Compaction filtering | Compaction utility |

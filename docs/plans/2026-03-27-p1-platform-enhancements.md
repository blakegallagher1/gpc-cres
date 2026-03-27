# P1 Platform Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 12 high-priority patterns covering self-optimization, OpenAI Skills, hosted shell, tool guardrails, tool namespacing, parallel calls, reasoning effort tuning, and extraction verbosity.

**Architecture:** These patterns build on the P0 foundation (strict schemas, timeouts, compaction) and extend into agent intelligence (self-optimization, graders) and infrastructure (hosted shell, skills).

**Tech Stack:** TypeScript, OpenAI Responses API, @openai/agents SDK, Prisma, Vitest

**Prerequisites:** P0 Patterns 1, 10, 23 should be implemented first.

---

### Task 1: Multi-Grader Evaluation Framework (Pattern 32)

**Files:**
- Create: `apps/web/lib/services/agentGraders.service.ts`
- Create: `apps/web/lib/services/__tests__/agentGraders.test.ts`

**Implementation:**
- Define 4 orthogonal grader functions: `gradeDataCompleteness`, `gradeAccuracy`, `gradeCostEfficiency`, `gradeCitationQuality`
- Each returns `{ score: number; passed: boolean; feedback: string }`
- Aggregate with lenient pass (Pattern 33): pass if 75% graders pass OR average > 0.85
- Wire into learning pipeline after `createTrajectoryLogFromRun`

**Key types:**
```typescript
export type GraderResult = { name: string; score: number; passed: boolean; feedback: string };
export type AggregateGradeResult = { scores: GraderResult[]; avgScore: number; lenientPass: boolean };
export function evaluateRunOutput(run: { finalOutput: string; toolsInvoked: string[]; turns: number }, reference?: unknown): Promise<AggregateGradeResult>;
```

**Commit:** `feat(eval): add multi-grader evaluation framework (Pattern 32)`

---

### Task 2: Closed-Loop Agent Self-Optimization (Pattern 31)

**Files:**
- Create: `apps/web/lib/services/promptOptimization.service.ts`
- Modify: `apps/web/lib/automation/agentLearningPromotion.ts` (hook graders + optimizer after trajectory creation)

**Implementation:**
- `generatePromptPatch(currentPrompt, runOutput, graderFeedback)` → calls GPT to produce an improved prompt
- Store prompt patches as `ProceduralSkill` entries with metadata `{ type: "prompt_patch", agentId, version }`
- Only trigger when aggregate grade is below threshold (not lenient-pass)
- Max 3 optimization retries per run type before alerting

**Commit:** `feat(learning): add closed-loop prompt optimization (Pattern 31)`

---

### Task 3: Skills as Versioned Workflow Bundles (Patterns 27, 28)

**Files:**
- Create: `skills/screening-workflow/SKILL.md`
- Create: `skills/parish-pack-generator/SKILL.md`
- Create: `skills/deal-enrichment/SKILL.md`
- Create: `skills/cua-playbook/SKILL.md`
- Create: `scripts/skills/upload-skill.sh`

**Implementation:**
- Each skill directory contains `SKILL.md` with frontmatter (name, description) + instructions
- Include "Use when" and "Don't use when" blocks for routing accuracy (Pattern 28)
- Upload script uses `curl -X POST https://api.openai.com/v1/skills` with zip upload
- Version management via `scripts/skills/set-default-version.sh`

**Example SKILL.md:**
```yaml
---
name: screening-workflow
description: >
  Run environmental screening on a parcel. Use when: user asks to screen a parcel,
  check flood zones, soils, wetlands, EPA facilities, or run full environmental analysis.
  Don't use when: user asks about deal status, document review, buyer outreach,
  or financial modeling.
---
```

**Commit:** `feat(skills): add versioned workflow skill bundles (Patterns 27, 28)`

---

### Task 4: Hosted Shell Integration (Pattern 24)

**Files:**
- Create: `packages/openai/src/utils/shellEnvironment.ts`

**Implementation:**
- Configure `container_auto` environment for non-CUA tasks (data processing, reports, API calls)
- Network policy: allowlist `gallagherpropco.com`, `api.gallagherpropco.com`
- Wire domain_secrets from P0 Pattern 26
- Skill mounting: reference skills from Task 3

```typescript
export function buildHostedShellConfig(options?: { skills?: string[] }) {
  return {
    type: "shell" as const,
    environment: {
      type: "container_auto" as const,
      network_policy: {
        type: "allowlist" as const,
        allowed_domains: ["gallagherpropco.com", "api.gallagherpropco.com"],
        domain_secrets: [
          { domain: "api.gallagherpropco.com", name: "GATEWAY_KEY", value: process.env.LOCAL_API_KEY ?? "" },
        ],
      },
      ...(options?.skills ? {
        skills: options.skills.map(id => ({ type: "skill_reference" as const, skill_id: id })),
      } : {}),
    },
  };
}
```

**Commit:** `feat(shell): add hosted shell container_auto configuration (Pattern 24)`

---

### Task 5: Persistent Container Reuse (Pattern 25)

**Files:**
- Create: `packages/openai/src/utils/containerManager.ts`
- Modify: `packages/db/prisma/schema.prisma` (add ContainerSession model)

**Implementation:**
- Track container IDs per conversation in Prisma
- Reuse containers for follow-up turns via `container_reference`
- Handle 20-minute TTL expiry with graceful fallback to `container_auto`
- Cleanup expired containers on conversation close

```typescript
export async function getOrCreateContainer(conversationId: string): Promise<{ type: "container_reference"; container_id: string } | { type: "container_auto" }>;
export async function releaseContainer(conversationId: string): Promise<void>;
```

**Commit:** `feat(shell): add persistent container reuse across turns (Pattern 25)`

---

### Task 6: Tool Input/Output Guardrails (Pattern 7)

**Files:**
- Create: `packages/openai/src/utils/toolGuardrails.ts`

**Implementation:**
- Input guardrails: validate parcel IDs exist, reject non-allowlisted URLs, check required fields
- Output guardrails: validate data completeness thresholds, reject low-confidence extractions
- Check `@openai/agents` TypeScript SDK for `tool_input_guardrails` / `tool_output_guardrails` support
- If not supported natively, implement as wrapper functions around tool execute()

```typescript
export type InputGuardrail = (toolName: string, args: Record<string, unknown>) => { valid: boolean; error?: string };
export type OutputGuardrail = (toolName: string, output: unknown) => { valid: boolean; error?: string };

export const URL_ALLOWLIST_GUARDRAIL: InputGuardrail = (name, args) => {
  if (!args.url || typeof args.url !== "string") return { valid: true };
  const allowed = ["gallagherpropco.com", "api.gallagherpropco.com"];
  const hostname = new URL(args.url).hostname;
  const isAllowed = allowed.some(d => hostname === d || hostname.endsWith(`.${d}`));
  return isAllowed ? { valid: true } : { valid: false, error: `URL ${hostname} not in allowlist` };
};
```

**Commit:** `feat(tools): add input/output guardrail framework (Pattern 7)`

---

### Task 7: Per-Tool Error Formatting (Pattern 11)

**Files:**
- Create: `packages/openai/src/utils/toolErrorFormatters.ts`

**Implementation:**
- Custom error messages per tool that guide model toward recovery
- Map tool names to recovery-oriented error messages

```typescript
export const TOOL_ERROR_FORMATTERS: Record<string, (error: Error) => string> = {
  browser_task: () => "Browser automation service is temporarily unavailable. Describe what data you need and I'll try the knowledge base or property database instead.",
  search_parcels: () => "Property database didn't respond. Try recall_property_intelligence for cached data, or ask the user to check gateway health.",
  screen_batch: (e) => `Batch screening partially failed: ${e.message}. Try screening individual parcels or reducing batch size.`,
  _default: (e) => `Tool error: ${e.message}. Try an alternative approach.`,
};
```

**Commit:** `feat(tools): add per-tool error formatters for model recovery guidance (Pattern 11)`

---

### Task 8: Tool Namespacing + Deferred Loading (Pattern 13)

**Files:**
- Modify: `packages/openai/src/tools/index.ts` (group tools into namespaces)

**Implementation:**
- Group 30+ tools into namespaces: `property`, `document`, `browser`, `memory`, `deal`, `financial`
- Mark infrequently-used tools with `defer_loading: true`
- Check `@openai/agents` SDK for `tool_namespace()` support
- If not supported, implement via tool description prefixes as a fallback

**Commit:** `feat(tools): add tool namespacing and deferred loading (Pattern 13)`

---

### Task 9: Parallel Tool Calls + Reasoning Effort Tuning (Patterns 43, 46)

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts` (reasoning effort)
- Modify: `apps/web/lib/agent/executeAgent.ts` (parallel tool calls if configurable)

**Implementation:**
- CUA worker: change `reasoning: { effort: "low" }` to `reasoning: { effort: "medium" }` for better navigation accuracy
- Agent runner: ensure `parallel_tool_calls: true` is set (or verify SDK default)
- Add reasoning effort as a configurable parameter per run type

```typescript
export function getReasoningEffort(runType?: string): "low" | "medium" | "high" {
  switch (runType) {
    case "screening": return "low";
    case "deal_analysis": return "high";
    case "parish_pack": return "high";
    case "browser": return "medium";
    default: return "medium";
  }
}
```

**Commit:** `feat(agent): tune reasoning effort per task and enable parallel tool calls (Patterns 43, 46)`

---

### Task 10: Extraction Verbosity for CUA (Pattern 48)

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts`

**Implementation:**
- Add `text: { verbosity: "high" }` to Responses API calls when extracting structured data
- Prevents model from paraphrasing parcel numbers, dollar amounts, legal descriptions
- Apply when instructions contain keywords like "extract", "transcribe", "read"

**Commit:** `feat(cua): add high verbosity for faithful data extraction (Pattern 48)`

---

### Task 11: Full Verification Gate

**Step 1:** `pnpm typecheck`
**Step 2:** `pnpm test`
**Step 3:** `pnpm build`
**Step 4:** `pnpm -C infra/cua-worker run build`

---

## Summary

| Task | Patterns | Scope |
|------|----------|-------|
| 1. Multi-grader evaluation | #32, #33 | New service |
| 2. Self-optimization loop | #31 | New service + handler mod |
| 3. Skills bundles | #27, #28 | New skill directories |
| 4. Hosted shell config | #24 | New utility |
| 5. Container persistence | #25 | New utility + schema |
| 6. Guardrails framework | #7 | New utility |
| 7. Error formatters | #11 | New utility |
| 8. Tool namespacing | #13 | Tool registry mod |
| 9. Parallel calls + effort | #43, #46 | CUA + runner mods |
| 10. Extraction verbosity | #48 | CUA mod |

# Agent Learning Tuning & Enablement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable procedural skill promotion and injection, calibrate thresholds to match actual run data, and add an empty-sequence guard so the pipeline produces useful skills as runs accumulate.

**Architecture:** The learning pipeline is fully wired (trajectory → episode → procedural skill → prompt injection). This plan flips feature flags, adds a safety guard, adjusts thresholds, and verifies end-to-end. No schema changes needed.

**Tech Stack:** TypeScript, Prisma, asyncpg (gateway), Vitest

---

### Task 1: Add empty-sequence guard to procedural skill promotion

**Files:**
- Modify: `apps/web/lib/services/proceduralSkill.service.ts:205-210`
- Test: `apps/web/__tests__/services/proceduralSkill.service.test.ts` (or co-located test)

**Step 1: Write the failing test**

In the test file for `proceduralSkill.service.ts`, add:

```typescript
it("skips promotion when tool sequence is empty", async () => {
  // Setup: create 5 episodic entries with empty toolSequence, same taskType + agentId
  // Call upsertProceduralSkillsFromEpisode
  // Assert: updatedSkillCount === 0
});
```

The test should verify that even when `minEpisodesForSkill` is met, an empty `toolSequence` causes the function to return early with `{ updatedSkillCount: 0, skillIds: [] }`.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web/__tests__/services/proceduralSkill --reporter=verbose`
Expected: FAIL — currently no guard exists, so the function would attempt to create a skill.

**Step 3: Implement the guard**

In `proceduralSkill.service.ts`, after the existing threshold check at line ~209, add:

```typescript
// Skip promotion for runs without meaningful tool sequences
if (cluster.episode.toolSequence.length === 0) {
  return { updatedSkillCount: 0, skillIds: [] };
}
```

Place this BEFORE the `minEpisodesForSkill` check (around line 205) so it short-circuits early.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/web/__tests__/services/proceduralSkill --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/lib/services/proceduralSkill.service.ts apps/web/__tests__/services/proceduralSkill*
git commit -m "feat(learning): add empty tool-sequence guard to procedural skill promotion"
```

---

### Task 2: Calibrate thresholds and enable flags

**Files:**
- Modify: `apps/web/lib/automation/config.ts:66-79`

**Step 1: Read the current config**

Read `apps/web/lib/automation/config.ts` lines 66-79 to confirm current values.

**Step 2: Apply calibrated values**

Change:
```typescript
agentLearning: Object.freeze({
  enabled: true,
  createTrajectoryLogs: true,
  createEpisodes: true,
  injectEpisodes: true,
  injectProcedures: false,       // ← change to true
  promoteFacts: false,
  promoteProcedures: false,      // ← change to true
  minConfidenceForFactPromotion: 0.72,
  minEpisodesForSkill: 3,
  minSkillSuccessRate: 0.67,     // ← change to 0.60
  maxSimilarEpisodes: 2,
  maxProcedures: 2,
}),
```

To:
```typescript
agentLearning: Object.freeze({
  enabled: true,
  createTrajectoryLogs: true,
  createEpisodes: true,
  injectEpisodes: true,
  injectProcedures: true,        // enabled — 0 skills exist, exercises injection path
  promoteFacts: false,
  promoteProcedures: true,       // enabled — empty-sequence guard prevents garbage skills
  minConfidenceForFactPromotion: 0.72,
  minEpisodesForSkill: 3,
  minSkillSuccessRate: 0.60,     // lowered — current confidence range 0.548-0.62
  maxSimilarEpisodes: 2,
  maxProcedures: 2,
}),
```

Rationale for each change:
- `injectProcedures: true` — harmless, 0 procedural skills exist. Exercises the `learningContextBuilder.ts` injection path so it's warm when skills form.
- `promoteProcedures: true` — the empty-sequence guard (Task 1) prevents generic skills. Real skills form only after 3+ episodes with matching non-empty tool sequences.
- `minSkillSuccessRate: 0.60` — current episode confidences are 0.548–0.62. The 0.67 threshold blocks everything. 0.60 allows skills from successful runs while still filtering poor ones.

**Step 3: Commit**

```bash
git add apps/web/lib/automation/config.ts
git commit -m "feat(learning): enable procedural promotion + injection, lower success threshold to 0.60"
```

---

### Task 3: Verify existing tests pass

**Step 1: Run the full agent learning test suite**

```bash
pnpm vitest run apps/web/__tests__/automation/agentLearningPromotion --reporter=verbose
pnpm vitest run apps/web/__tests__/services/proceduralSkill --reporter=verbose
pnpm vitest run apps/web/__tests__/memory/memoryContextBuilder --reporter=verbose
```

All must pass. The config changes should not break any existing tests since tests mock the config.

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 3: Run full test suite**

```bash
pnpm test
```

Expected: All pass (no regressions)

---

### Task 4: Verify the promotion handler works end-to-end

The DB connection fix from earlier today (gateway `/db` endpoint) should have unblocked promotions. Verify by checking if new runs produce trajectory logs and episodes.

**Step 1: Check run promotion status**

Query the DB:
```sql
SELECT memory_promotion_status, count(*) FROM runs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY memory_promotion_status;
```

If there are recent runs with `null` status, the handler isn't firing. If `failed`, check the error in `automation_events`:
```sql
SELECT type, status, output_data FROM automation_events
WHERE type = 'agent.run.completed'
ORDER BY created_at DESC LIMIT 5;
```

**Step 2: If promotions are still failing, check logs**

The `automation_events` table stores error details in `output_data`. Look for the failure class and fix accordingly.

**Step 3: Commit any fixes discovered**

---

### Task 5: Final commit and deploy

**Step 1: Push to main**

```bash
git push origin main
```

This triggers the Vercel GitHub integration deploy.

**Step 2: Verify in Sentry after deploy**

Check for any new errors in the `entitlement-os-web` project related to `agentLearning`, `proceduralSkill`, or `learningContext`.

**Step 3: Monitor over next 20-30 runs**

As users interact with the chat, runs with tool calls will:
1. Create trajectory logs with non-empty `toolCalls`
2. Create episodic entries with non-empty `toolSequence`
3. Once 3+ episodes share the same taskType + agentId + toolSequence pattern, procedural skills will form
4. Those skills will be injected as `[Relevant Procedures]` in future prompts

---

## What was NOT changed (and why)

- **`promoteFacts`** stays `false` — fact promotion writes to MemoryVerified which has separate calibration needs
- **`minConfidenceForFactPromotion`** stays 0.72 — only relevant when fact promotion is enabled
- **`minEpisodesForSkill`** stays at 3 — reasonable cluster threshold; lowering would create premature skills
- **No schema changes** — all tables and indexes already exist
- **No trajectory extractor changes** — tool capture chain is correct; empty sequences are from no-tool conversational runs

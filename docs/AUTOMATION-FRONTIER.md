# The Automation Frontier: Entitlement OS

Last reviewed: 2026-02-19


## Current State: "Guided Autonomy"

The system is a **consultation tool, not an autonomous deal machine**. Agents advise, humans decide. Every deal requires ~44 manual trigger points across its lifecycle. Here's every place a human intervenes, what an autonomous loop would look like, and what guardrails keep it safe.

---

## 1. DEAL INTAKE & CREATION

**Status: WIRED.** `handleIntakeReceived` in `lib/automation/intake.ts`. Parses content for addresses, parishes, SKU signals. Auto-creates deal when criteria match + within daily rate limit. 24h veto task attached.

**Today:** Human fills form — name, SKU, jurisdiction, parcel address. Clicks "Create Deal."

**Autonomous Loop:**
- **Observe:** Monitor inbound emails (broker blasts, LoopNet alerts), MLS feeds, or a shared intake inbox. Agent parses property details from unstructured text/PDFs.
- **Decide:** Does this match GPC's target criteria? (SKU fit, parish coverage, acreage range, price ceiling)
- **Act:** Auto-create deal in INTAKE status, geocode address, attach initial parcel, notify human via Slack/email: "New deal created from [source]. Review?"
- **Guardrails:**
  - Hard filter: Only create deals in covered parishes (EBR, Ascension, Livingston, West BR, Iberville)
  - Hard filter: Reject if acreage < minimum for SKU type
  - Rate limit: Max 10 auto-created deals/day (prevent spam from bad data source)
  - **Human veto window**: 24 hours to kill before auto-enrichment begins
  - All auto-created deals tagged `source: "auto-intake"` for audit

---

## 2. PARCEL ENRICHMENT

**Status: WIRED.** `handleParcelCreated` in `lib/automation/enrichment.ts`. Auto-enriches on parcel creation: normalizes address, searches Property DB, scores match confidence (1.0 exact → 0.2 no match), auto-applies at >90%, creates review task at 50-90%.

**Today:** Human clicks "Enrich" on each parcel. Two-step: search property DB, then apply best match. Manual per-parcel.

**Autonomous Loop:**
- **Observe:** New parcel added to any deal (DB trigger or post-create hook)
- **Decide:** Normalize address → search Property DB → score match confidence (exact address match = high, fuzzy = medium, no match = low)
- **Act:** If confidence > 90%: auto-apply enrichment (flood, soils, wetlands, EPA, traffic, LDEQ screening). If 50-90%: present top 3 matches to human. If < 50%: flag "manual geocoding needed."
- **Guardrails:**
  - Never auto-apply if multiple parcels share the same address (ambiguous match)
  - Log every auto-enrichment decision with match score for audit
  - Human can override any auto-applied enrichment
  - Max 1 enrichment attempt per parcel per 24h (prevent loops on bad data)

---

## 3. TRIAGE EXECUTION

**Status: WIRED.** `handleTriageReadiness` in `lib/automation/triage.ts`. Fires on `parcel.enriched` — checks all parcels enriched + INTAKE status + no existing run + daily rate limit. Creates notification task (agents advise, humans decide).

**Today:** Human clicks "Run Triage." AI scores the deal. Human reviews and decides.

**Autonomous Loop:**
- **Observe:** Deal has >= 1 enriched parcel AND status is INTAKE AND no triage run exists
- **Decide:** All parcels enriched? If yes, auto-trigger triage. If no, wait (or notify: "Parcel X missing enrichment data").
- **Act:** Run triage. Based on result:
  - **KILL**: Auto-advance deal to KILLED status. Notify human: "Deal killed — [top disqualifier]. Review to override."
  - **HOLD**: Keep in TRIAGE_DONE. Create reminder task: "Re-evaluate in 30 days." Notify human.
  - **ADVANCE**: Auto-advance to TRIAGE_DONE. Auto-create all next_action tasks. Auto-execute "Run All."
- **Guardrails:**
  - **KILL requires human confirmation within 48h** — deal stays in KILLED_PENDING, not permanently killed
  - ADVANCE never skips TRIAGE_DONE stage (no jumping to PREAPP without human review)
  - Max 1 triage run per deal per 24h (prevent cost runaway on re-triggers)
  - Budget cap: If OpenAI spend for triage exceeds $X/month, pause auto-triage and alert
  - All auto-triage decisions logged to Run record with full reasoning

---

## 4. TASK EXECUTION (Next Actions)

**Status: WIRED.** `handleTaskCreated` + `handleTaskCompleted` in `lib/automation/taskExecution.ts`. On `task.created`: checks allowlist (human-only keywords: call/meet/negotiate/sign/schedule), concurrent limit (5/deal). On `task.completed`: quality check (agent findings min 50 chars → review task if too short).

**Today:** Human clicks "Run All" or individual next actions. Agent executes and marks DONE.

**Autonomous Loop:**
- **Observe:** Task created with status TODO and no agent run attached
- **Decide:** Is this task type executable by an agent? (research, screening, verification = yes; "Schedule meeting with seller" = no)
- **Act:** Auto-dispatch to `/api/deals/{id}/tasks/{taskId}/run`. Stream results. Mark DONE on success. On failure, mark BLOCKED and create diagnostic subtask.
- **Guardrails:**
  - **Task type allowlist**: Only auto-execute task types agents can actually complete (flood verification, zoning research, market analysis, etc.)
  - Tasks with "call," "meet," "negotiate," "sign" in title are NEVER auto-executed (human-only)
  - Max 5 concurrent agent task runs per deal (prevent resource exhaustion)
  - If agent output is empty or < 50 chars, mark as NEEDS_REVIEW instead of DONE
  - Timeout: 5 minutes per task run. After that, mark BLOCKED + notify human
  - **Cascading tasks**: When task X completes and unblocks task Y, auto-start Y (with same guardrails)

---

## 5. DEAL STATUS ADVANCEMENT

**Status: WIRED.** `handleAdvancement` + `handleStatusChangeReminder` in `lib/automation/advancement.ts`. On `task.completed`: checks if all step tasks done → suggests advancement (human-gated for PREAPP+). On `deal.statusChanged`: suggests creating tasks for new stage if none exist.

**Today:** 100% manual. Only INTAKE → TRIAGE_DONE is automated. The other 9 transitions require human judgment via API call or agent chat.

**Autonomous Loop:**
- **Observe:** All tasks for current pipeline step are DONE
- **Decide:** Check advancement criteria per stage:

| From | To | Auto-advance criteria | Human gate? |
|------|-----|----------------------|-------------|
| INTAKE | TRIAGE_DONE | Triage run completed | No (already works) |
| TRIAGE_DONE | PREAPP | All Step 2 tasks DONE + decision = ADVANCE | **Yes — human confirms** |
| PREAPP | CONCEPT | Pre-app meeting notes uploaded + all Step 3 tasks DONE | **Yes** |
| CONCEPT | NEIGHBORS | Concept plan uploaded + site plan approved | **Yes** |
| NEIGHBORS | SUBMITTED | Neighbor notification complete + no objections (or objections resolved) | **Yes** |
| SUBMITTED | HEARING | Application submitted + hearing date set | **Yes** |
| HEARING | APPROVED | Hearing outcome = approved | **Yes** |
| APPROVED | EXIT_MARKETED | Exit package generated + listed for sale | **Yes** |
| EXIT_MARKETED | EXITED | Closing date passed + funds received | **Yes** |

- **Act:** When all criteria met, send notification: "Deal X ready to advance from [CURRENT] to [NEXT]. [Approve] [Hold]." If human doesn't respond in 48h, send reminder. Never auto-advance past TRIAGE_DONE without explicit human approval.
- **Guardrails:**
  - **Stage transitions PREAPP and beyond always require human click** — this is the core judgment call (commit capital, sign contracts, go to hearing)
  - System can SUGGEST advancement, never FORCE it
  - Advancement notifications include summary of completed tasks + outstanding risks
  - "Kill at any stage" button always available — takes priority over any auto-advance

---

## 6. DOCUMENT MANAGEMENT

**Status: WIRED.** `handleUploadCreated` in `lib/automation/documents.ts`. On `upload.created`: classifies by filename (13 regex rules for title/environmental/survey/financial/legal), auto-updates kind if >70% confidence, creates review task if <70% or if user classification differs from auto-classification.

**Today:** Human uploads files, manually categorizes them (title, environmental, survey, financial, legal, other).

**Autonomous Loop:**
- **Observe:** New file uploaded to deal
- **Decide:** Classify document type via AI (read first page, match to category). Extract key data points.
- **Act:** Auto-categorize upload. For specific doc types:
  - **Title report**: Extract legal description, encumbrances, liens. Flag any title defects as BLOCKED task.
  - **Phase I ESA**: Extract REC findings. If RECs found, create high-priority task for Risk agent.
  - **Survey**: Extract acreage, setbacks, easements. Update parcel record.
  - **Financial (appraisal, LOI)**: Extract price, terms. Update deal financial context.
- **Guardrails:**
  - Never delete or modify uploaded files — only ADD metadata
  - Auto-classification confidence score shown to human. Below 70%: ask human to confirm category.
  - PII detection: If document contains SSN, bank account numbers, etc., flag and restrict access
  - Max file processing: 50MB per file, 10 files per batch (prevent OOM)
  - Document extraction failures create "manual review needed" task, not silent failures

---

## 7. EVIDENCE MONITORING (Change Detection)

**Status: WIRED.** Daily cron at `/api/cron/change-detection`. Full loop: fetch → hash → compare → store snapshot → create tasks for affected deals. 60s timeout, 3x retry, >50% unreachable alert.

**Autonomous Loop:**
- **Observe:** (Daily 6 AM) For each `JurisdictionSeedSource` URL: fetch content, hash, compare to previous snapshot
- **Decide:** Has content changed? If yes, is the change material? (Ignore CSS/layout changes; flag zoning code text changes, new ordinances, new application forms)
- **Act:**
  - Store new snapshot in Supabase storage
  - If material change detected: Create task for Legal/Entitlements agent: "Review policy change at [jurisdiction] — [URL]. Diff: [summary]"
  - If zoning code changed: Flag all active deals in that jurisdiction for review
  - Weekly digest email: "3 jurisdiction sources changed this week. 0 require action."
- **Guardrails:**
  - Ignore non-material changes (timestamp-only, CSS, ads)
  - Max 60s timeout per URL fetch (prevents hung Playwright processes)
  - Retry 3x with exponential backoff before marking source as "unreachable"
  - If > 50% of sources are unreachable, alert human (possible network issue, not site changes)
  - Cost cap: If Playwright rendering exceeds budget, fall back to HTTP-only fetch

---

## 8. PARISH PACK GENERATION

**Status: WIRED.** Cron job runs weekly (Sunday 4 AM). For each stale jurisdiction x SKU combo: gathers evidence from existing snapshots, calls OpenAI Responses API with web search, validates against ParishPackSchema + citation checker, stores versioned packs with audit trail.

**Autonomous Loop:**
- **Observe:** (Weekly Sunday 4 AM) For each jurisdiction x SKU combination: check if current parish pack is > 7 days old
- **Decide:** Is the pack stale? Did change detection find relevant updates this week?
- **Act:** Regenerate pack via OpenAI with web search. Store new version. Mark old as superseded. If change detection found material changes, annotate pack with "updated based on [change summary]."
- **Guardrails:**
  - 7-day staleness threshold prevents over-generation
  - Old versions kept (never deleted) for rollback
  - Token usage logged per generation. Monthly budget alert if > $X
  - If generation fails, keep serving previous version (graceful degradation)
  - Max 3 regeneration attempts before marking jurisdiction as "needs manual review"

---

## 9. ARTIFACT GENERATION

**Status: WIRED.** POST/GET API routes at `/api/deals/[id]/artifacts`, download via signed URL at `/api/deals/artifacts/[artifactId]/download`. Auto-triggers TRIAGE_PDF on triage completion. Generate dropdown in UI. Versioned storage.

**Autonomous Loop:**
- **Observe:** Deal reaches specific stage milestones
- **Decide:** Which artifact is needed at this stage?

| Stage | Auto-generate |
|-------|--------------|
| TRIAGE_DONE | Triage PDF report |
| SUBMITTED | Submission checklist PDF |
| HEARING | Hearing deck PPTX |
| EXIT_MARKETED | Exit package PDF + Buyer teaser PDF |

- **Act:** Generate artifact → store in Supabase → create Artifact DB record → attach to deal → notify human: "Hearing deck ready for review. [Download]"
- **Guardrails:**
  - All auto-generated artifacts are DRAFT status until human approves
  - Human can regenerate with edits (versioning tracks all iterations)
  - Artifacts never sent externally without human approval
  - Content validation: AI reviews generated content for factual consistency with deal data before finalizing

---

## 10. BUYER OUTREACH (Marketing)

**Status: WIRED.** `handleBuyerOutreach` + `handleTriageBuyerMatch` in `lib/automation/buyerOutreach.ts`. On `deal.statusChanged` to EXIT_MARKETED: matches buyers by SKU + jurisdiction, filters cool-off/duplicates, creates review task with eligible buyer list. On `triage.completed` with ADVANCE: flags potential buyer interest early. NEVER auto-sends.

**Today:** Manual buyer creation, manual outreach logging.

**Autonomous Loop:**
- **Observe:** Deal reaches EXIT_MARKETED status with buyer teaser generated
- **Decide:** Which buyers match this deal? (SKU interest, parish, price range, past purchase history)
- **Act:** Generate personalized outreach emails per matched buyer. Queue for human review: "5 buyer outreach emails drafted for [Deal X]. [Review & Send] [Edit] [Skip]"
- **Guardrails:**
  - **Never auto-send emails** — always human-approved
  - CAN-SPAM compliance: unsubscribe link, physical address
  - Rate limit: Max 20 outreach emails per deal per week
  - Duplicate detection: Don't contact same buyer about same deal twice
  - Cool-off period: Don't contact a buyer more than 2x per month across all deals

---

## 11. THREE DEAD AGENTS (Design, Tax, Market Intel)

**Status: WIRED.** Design agent now has 6 tools (deal context, property search, parcel details, zoning matrix, flood screening, soils screening). Tax agent has 4 tools (deal context, property search, parcel details, web search). Market Intel still needs dedicated tools but can use web search through coordinator handoff.

**Previously:** These agents had ZERO tools wired. They could only recite general knowledge.

**Autonomous Loops Needed:**

### Design Agent
- **Tools needed:** Property DB access (site dimensions, setbacks), zoning matrix (height/density limits), cost estimation library
- **Loop:** When deal reaches CONCEPT stage, auto-generate test-fit study: building footprint, parking count, impervious coverage %, setback compliance
- **Guardrails:** All outputs labeled "PRELIMINARY — not for construction"

### Tax Strategist Agent
- **Tools needed:** Deal context access, web search (IRS guidance), artifact generation (tax memos)
- **Loop:** When deal reaches APPROVED stage, auto-generate tax strategy memo: 1031 exchange eligibility, cost segregation opportunity, entity structure recommendation
- **Guardrails:** All outputs include "consult licensed CPA before acting" disclaimer

### Market Intel Agent
- **Tools needed:** Property DB, web search, deal context
- **Loop:** Weekly market pulse: absorption rates, new permits filed, competitor activity in target parishes
- **Guardrails:** Source attribution on all claims. Flag low-confidence data points.

---

## 12. DEPLOYMENT & OPS

**Status: WIRED.** `lib/automation/ops.ts` provides `isMigrationSafe()` (10 destructive pattern checks), `evaluateHealth()` (5 critical env vars), `shouldAlertOnFailure()` (consecutive failure threshold). Used by deployment tooling and health checks.

**Today:** Push to main → auto-deploy via Vercel. DB migrations manual. Seed manual.

| Operation | Autonomous Design | Guardrail |
|-----------|-------------------|-----------|
| **DB migrations** | Auto-run on deploy (add to Vercel build command) | Require migration review on PR. Never auto-run destructive migrations (DROP TABLE, etc.) |
| **DB seed** | Auto-run on first deploy per environment | Upsert-only (already safe). Add env detection to skip in prod |
| **Health monitoring** | Auto-alert on degraded `/api/health` response | Slack/PagerDuty integration. Auto-rollback if health check fails 3x consecutively |
| **Property DB refresh** | Annual auto-import from assessor data feeds | Staging import first. Row count validation (reject if < 90% of previous count). Human approval before prod swap |
| **CRON_SECRET rotation** | Auto-rotate quarterly | Generate new secret → update Vercel env → verify both crons succeed → delete old secret |

---

## The Full Map: 12 Automation Loops — ALL WIRED

| # | Loop | Status | Handler File | Event Trigger |
|---|------|--------|-------------|---------------|
| 1 | Deal Intake | WIRED | `intake.ts` | `intake.received` |
| 2 | Parcel Enrichment | WIRED | `enrichment.ts` | `parcel.created` |
| 3 | Auto-Triage | WIRED | `triage.ts` | `parcel.enriched` |
| 4 | Task Execution | WIRED | `taskExecution.ts` | `task.created`, `task.completed` |
| 5 | Stage Advancement | WIRED | `advancement.ts` | `task.completed`, `deal.statusChanged` |
| 6 | Document Processing | WIRED | `documents.ts` | `upload.created` |
| 7 | Change Detection | WIRED | cron route | Daily 6 AM |
| 8 | Parish Pack Refresh | WIRED | cron route | Weekly Sunday 4 AM |
| 9 | Artifact Generation | WIRED | API routes | POST trigger + auto on triage |
| 10 | Buyer Outreach | WIRED | `buyerOutreach.ts` | `deal.statusChanged`, `triage.completed` |
| 11 | Dead Agent Revival | WIRED | `agents/index.ts` | Design: 6 tools, Tax: 4 tools |
| 12 | Ops Automation | WIRED | `ops.ts` | Migration safety, health, alerting |

### Event → Handler Registry (handlers.ts)

| Event | Handler(s) |
|-------|-----------|
| `parcel.created` | `handleParcelCreated` (enrichment) |
| `parcel.enriched` | `handleTriageReadiness` (triage) |
| `task.created` | `handleTaskCreated` (task execution) |
| `task.completed` | `handleTaskCompleted` (quality), `handleAdvancement` (stage) |
| `deal.statusChanged` | `handleStatusChangeReminder` (advancement), `handleBuyerOutreach` (buyer) |
| `upload.created` | `handleUploadCreated` (documents) |
| `triage.completed` | `handleTriageBuyerMatch` (buyer) |
| `intake.received` | `handleIntakeReceived` (intake) |

### API Routes with Event Dispatch

| Route | Events Dispatched |
|-------|------------------|
| `POST /api/deals/[id]/parcels` | `parcel.created` |
| `PATCH /api/deals/[id]` | `deal.statusChanged` (when status changes) |
| `POST /api/deals/[id]/triage` | `triage.completed` |
| `POST /api/deals/[id]/tasks` | `task.created` |
| `PATCH /api/deals/[id]/tasks` | `task.completed` (when status → DONE) |
| `POST /api/deals/[id]/tasks/[taskId]/run` | `task.completed` (after agent finishes) |
| `POST /api/deals/[id]/uploads` | `upload.created` |

### Test Coverage

14 test suites, 302 tests — all in `lib/automation/__tests__/`:
- `config.test.ts`, `events.test.ts`, `gates.test.ts`, `notifications.test.ts`, `taskAllowlist.test.ts`
- `enrichment.test.ts`, `ops.test.ts`, `handlers.test.ts`
- `triage.test.ts`, `taskExecution.test.ts`, `documents.test.ts`
- `advancement.test.ts`, `buyerOutreach.test.ts`, `intake.test.ts`

---

## The Fundamental Design Tension

The system has a clear philosophy embedded in its architecture: **agents advise, humans decide at capital commitment points**. The 11 deal statuses represent increasingly irreversible commitments (money, reputation, legal exposure). The automation frontier should respect this:

- **Pre-TRIAGE_DONE**: Full autonomy is safe. Enrichment, scoring, screening — all reversible, all data-only.
- **TRIAGE_DONE → PREAPP**: First human gate. Committing staff time to pre-application work.
- **PREAPP → SUBMITTED**: Second gate. Committing to jurisdiction engagement (reputation risk).
- **HEARING → APPROVED**: Third gate. Public record. No takebacks.
- **EXIT_MARKETED → EXITED**: Final gate. Capital disposition.

**The right answer isn't "automate everything" — it's automate observation and preparation, gate decisions at capital commitment points.**

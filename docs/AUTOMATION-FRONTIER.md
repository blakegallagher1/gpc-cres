# The Automation Frontier: Entitlement OS

## Current State: "Guided Autonomy"

The system is a **consultation tool, not an autonomous deal machine**. Agents advise, humans decide. Every deal requires ~44 manual trigger points across its lifecycle. Here's every place a human intervenes, what an autonomous loop would look like, and what guardrails keep it safe.

---

## 1. DEAL INTAKE & CREATION

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

**Today:** Cron job exists but is **completely stubbed out**. No monitoring happening.

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

**Today:** Cron job exists but is **completely stubbed out**. No packs being generated.

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

**Today:** Package is fully implemented but **not wired to any trigger**. No API route, no agent tool, no UI button.

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

**Today:** These agents have ZERO tools wired. They can only recite general knowledge.

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

**Today:** Push to main → auto-deploy via Vercel. DB migrations manual. Seed manual.

| Operation | Autonomous Design | Guardrail |
|-----------|-------------------|-----------|
| **DB migrations** | Auto-run on deploy (add to Vercel build command) | Require migration review on PR. Never auto-run destructive migrations (DROP TABLE, etc.) |
| **DB seed** | Auto-run on first deploy per environment | Upsert-only (already safe). Add env detection to skip in prod |
| **Health monitoring** | Auto-alert on degraded `/api/health` response | Slack/PagerDuty integration. Auto-rollback if health check fails 3x consecutively |
| **Property DB refresh** | Annual auto-import from assessor data feeds | Staging import first. Row count validation (reject if < 90% of previous count). Human approval before prod swap |
| **CRON_SECRET rotation** | Auto-rotate quarterly | Generate new secret → update Vercel env → verify both crons succeed → delete old secret |

---

## The Full Map: 12 Automation Loops

| # | Loop | Observe | Decide | Act | Human Gate |
|---|------|---------|--------|-----|------------|
| 1 | Deal Intake | Inbound emails/feeds | Match GPC criteria | Create deal + notify | 24h veto window |
| 2 | Parcel Enrichment | New parcel added | Match confidence | Auto-apply or ask human | Low-confidence matches |
| 3 | Auto-Triage | Enriched parcels ready | All parcels complete | Score + route (KILL/HOLD/ADVANCE) | KILL confirmation |
| 4 | Task Execution | New TODO tasks | Agent-executable? | Run agent + mark DONE | Non-executable tasks |
| 5 | Stage Advancement | All stage tasks DONE | Criteria met | Suggest advancement | **Always (post-triage)** |
| 6 | Document Processing | New upload | Classify + extract | Categorize + update deal | Low-confidence classification |
| 7 | Change Detection | Daily URL scan | Content changed? | Snapshot + alert if material | Material change review |
| 8 | Parish Pack Refresh | Weekly staleness check | Pack > 7 days old | Regenerate via AI | Failure/budget alerts |
| 9 | Artifact Generation | Stage milestones | Which artifact needed | Generate draft | Approval before external use |
| 10 | Buyer Outreach | EXIT_MARKETED status | Match buyers | Draft emails | **Always (before send)** |
| 11 | Dead Agent Revival | Stage-specific triggers | What analysis needed | Generate memos/studies | Disclaimer on all outputs |
| 12 | Ops Automation | Deploy/health events | Healthy? | Alert/rollback | Destructive migrations |

---

## The Fundamental Design Tension

The system has a clear philosophy embedded in its architecture: **agents advise, humans decide at capital commitment points**. The 11 deal statuses represent increasingly irreversible commitments (money, reputation, legal exposure). The automation frontier should respect this:

- **Pre-TRIAGE_DONE**: Full autonomy is safe. Enrichment, scoring, screening — all reversible, all data-only.
- **TRIAGE_DONE → PREAPP**: First human gate. Committing staff time to pre-application work.
- **PREAPP → SUBMITTED**: Second gate. Committing to jurisdiction engagement (reputation risk).
- **HEARING → APPROVED**: Third gate. Public record. No takebacks.
- **EXIT_MARKETED → EXITED**: Final gate. Capital disposition.

**The right answer isn't "automate everything" — it's automate observation and preparation, gate decisions at capital commitment points.**

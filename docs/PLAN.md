# Entitlement OS v1.0 — Implementation Plan (Revised)

Last reviewed: 2026-02-19


Generated: 2026-02-05
Revised: 2026-02-05 — Recentered on conversational agent architecture

---

## Design Philosophy

**The old Python system had the right interaction model**: broad specialist agents, a coordinator that routes natural language, conversational back-and-forth. **The Entitlement OS spec had the right domain logic**: parish packs, evidence capture, artifact generation, change detection.

This plan merges both. The primary interface is a **chat** — you talk to a Coordinator that delegates to specialist agents. The entitlement-specific capabilities (parish packs, evidence vault, triage scoring, artifact generation) are **tools those agents can call**, not rigid pipelines you trigger with buttons.

**You talk. Agents work. Tools execute. Artifacts appear.**

---

## Current State Assessment

### What Exists Today

| Component | Status | Details |
|-----------|--------|---------|
| **apps/web/** | 40% | Next.js 16 + React 19 + Supabase auth. Old dashboard UI (agents, workflows, deal-room, screening). Has a working `CopilotPanel.tsx` that streams to backend via SSE — this is our chat prototype. |
| **packages/db/** | 70% | Prisma schema complete (13 models, all enums). No migrations generated. |
| **packages/shared/** | 70% | Zod schemas (ParishPack, ParcelTriage, ArtifactSpec), citation validator, SHA-256 hash, storage keys, Temporal types. |
| **packages/openai/** | 50% | Responses API wrapper, retry logic, types. Missing: agent definitions, structured outputs, tool configs. |
| **packages/evidence/** | 60% | Snapshot fetcher, text extractor. Missing: Supabase upload, DB writes, hash comparison. |
| **packages/artifacts/** | 60% | PPTX + PDF generators, HTML templates (stubs). Missing: template content, versioning. |
| **apps/worker/** | 5% | Empty skeleton. No package.json. |
| **infra/docker/** | 100% | Postgres 16 + Temporal dev server + UI. Ready. |
| **legacy/python/** | Reference | 12 agents with domain knowledge, scoring algorithms, EBR zoning matrix, prompts. Frozen. |

---

## Architecture: Agent-First, Tools-Second

### How It Works

```
You: "I've got a 12-acre parcel on Airline Hwy, zoned A-1.
      I want to do flex industrial. What's my path?"

  → Coordinator receives message
  → Routes to: Legal Agent (zoning check) + Research Agent (parcel lookup)
  → Legal Agent calls [zoning_matrix_lookup] tool → "A-1 is prohibited for flex industrial"
  → Legal Agent calls [parish_pack_lookup] tool → "EBR requires rezoning or variance"
  → Research Agent calls [web_search] tool → parcel data, flood zone, ownership
  → Research Agent calls [evidence_snapshot] tool → stores sources
  → Coordinator synthesizes → presents options

You: "What about outdoor storage instead?"

  → Coordinator routes to Legal Agent
  → Legal Agent calls [zoning_matrix_lookup] → "A-1 conditional use for outdoor storage"
  → Legal Agent calls [parish_pack_lookup] → "CUP process: pre-app, submit, hearing"
  → Returns: recommended path, timeline, fees (all cited)

You: "Run the triage and build me a hearing deck"

  → Coordinator routes to Risk Agent (flood + environmental)
  → Risk Agent calls [flood_zone_lookup], [evidence_snapshot]
  → Coordinator runs [parcel_triage_score] with all gathered data
  → Coordinator triggers [generate_artifact] for HEARING_DECK_PPTX
  → Returns: triage result (GREEN/YELLOW/RED) + download link for deck
```

### The Agent Layer (OpenAI Agents SDK — TypeScript)

Port the 12-agent architecture using `@openai/agents` (the TypeScript Agents SDK, now production-ready on npm). This gives us:

- **Agents** with system prompts, model configs, and tool lists
- **Handoffs** — Coordinator delegates to specialists, specialists can delegate to each other
- **Guardrails** — input/output validation before agent execution
- **Function tools** — any TypeScript function becomes a callable tool with Zod schema
- **Tracing** — built-in observability for debugging

**Agents (v1.0):**

| Agent | Model | Role | Key Tools |
|-------|-------|------|-----------|
| **Coordinator** | GPT-5.2 | Routes requests, synthesizes multi-agent results, manages deal context | `get_deal_context`, `update_deal_status`, `create_task` |
| **Legal / Entitlements** | GPT-5.2 | Zoning analysis, permit tracking, entitlement path planning | `zoning_matrix_lookup`, `parish_pack_lookup`, `analyze_zoning_entitlements`, `create_permit_record` |
| **Research** | GPT-5.2 | Parcel research, market data, comparables | `web_search`, `search_parcels`, `research_parcel`, `evidence_snapshot` |
| **Risk** | GPT-5.1 | Flood, environmental, market risk assessment | `flood_zone_lookup`, `environmental_check`, `evidence_snapshot` |
| **Finance** | GPT-5.2 | Pro formas, debt sizing, deal economics | `build_proforma`, `size_debt`, `run_sensitivity` |
| **Deal Screener** | GPT-5.1 | Parcel triage scoring (KILL/HOLD/ADVANCE) | `parcel_triage_score`, `hard_filter_check` |
| **Design** | GPT-5.1 | Site planning, development capacity | `calculate_development_capacity`, `estimate_construction_cost` |
| **Operations** | GPT-5.1 | Scheduling, budgets, contractor evaluation | `create_schedule`, `track_costs` |
| **Marketing** | GPT-5.1 | Buyer outreach, offering memos, teasers | `generate_listing`, `create_offering_memo`, `build_buyer_list` |
| **Tax Strategist** | GPT-5.1 | IRC guidance, 1031 exchanges, depreciation | `lookup_irc_reference`, `web_search` |
| **Market Intel** | GPT-5.1 | Competitor tracking, absorption, economic indicators | `web_search`, `market_snapshot` |

Agents not needed for v1.0 (Design, Operations, Marketing, Tax, Market Intel) ship with basic prompts and tools — they work in chat but don't have the deep entitlement-specific tooling. They grow over time as you use them and discover what's missing.

### The Tools Layer (Entitlement-Specific Capabilities)

These are TypeScript functions that agents call. They're where the real work happens:

**Data tools** (read/write Prisma):
- `get_deal_context(dealId)` — deal + parcels + tasks + latest triage + artifacts
- `update_deal_status(dealId, status)` — move deal through pipeline
- `create_task(dealId, task)` — add task to deal
- `zoning_matrix_lookup(zoningCode, proposedUse)` — check EBR UDC matrix
- `parish_pack_lookup(jurisdictionId, sku, section?)` — retrieve current parish pack

**AI tools** (call OpenAI with structured output):
- `parcel_triage_score(parcelData, parishPack)` — ported scoring algorithm + OpenAI analysis → KILL/HOLD/ADVANCE
- `analyze_zoning_entitlements(parcel, jurisdiction)` — structured zoning analysis with citations
- `generate_parish_pack(jurisdictionId, sku)` — full parish pack generation with web_search

**Evidence tools** (capture + store):
- `evidence_snapshot(url)` — fetch, hash, store in Supabase, return metadata
- `flood_zone_lookup(address)` — FEMA lookup + evidence capture
- `compare_evidence_hash(sourceId)` — detect changes since last snapshot

**Artifact tools** (generate files):
- `generate_artifact(dealId, type)` — produce PDF/PPTX, upload to Supabase, return signed URL

**Background tools** (long-running, use Temporal):
- `refresh_parish_pack(jurisdictionId, sku)` — triggers Temporal workflow, returns when done
- `run_change_detection(jurisdictionId)` — check all seed sources for changes
- `generate_all_artifacts(dealId)` — batch artifact generation

### The Orchestration Layer (Temporal — Background Only)

Temporal is NOT the primary orchestration. Agents are. Temporal handles only the things that genuinely need durable execution:

1. **Parish pack refresh** — fetches multiple URLs, calls OpenAI, validates, stores versions. Takes minutes. Can fail partway and needs to resume.
2. **Change detection** — nightly/weekly scheduled job scanning government websites. Must be reliable.
3. **Batch artifact generation** — generating 5 PDFs + 1 PPTX for a deal. Can be queued.
4. **Evidence bulk capture** — snapshotting 20+ URLs for a new jurisdiction setup.

When an agent calls `refresh_parish_pack()`, it starts a Temporal workflow and either:
- Waits for completion (if the user is in a chat asking for it), or
- Returns immediately with a "I've kicked that off, I'll let you know when it's done" message

### The Chat Interface (Primary UI)

The chat is the main way you interact with the system. It replaces clicking buttons on a dashboard.

**Capabilities:**
- Freeform natural language input
- Streaming responses (agent thinking + tool calls visible)
- Inline structured results (triage scores render as cards, not raw JSON)
- File attachments (upload a survey PDF, agent ingests it)
- Deal context awareness (chat within a deal → all messages scoped to that deal)
- Artifact downloads inline (agent generates a hearing deck → download link in chat)
- Multi-turn conversation (ask follow-ups, refine, dig deeper)
- Agent suggestions ("I notice you haven't run flood risk yet — want me to check?")

---

## What to Port from Legacy Python

| Legacy Asset | Port To | Priority |
|---|---|---|
| **`tools/screening.py` scoring algorithm** | `packages/shared/src/scoring/` as a function tool | CRITICAL |
| **`gpc_agents/legal.py` EBR UDC zoning matrix** | `packages/db/seed/ebr-zoning.json` + `zoning_matrix_lookup` tool | CRITICAL |
| **`prompts/agent_prompts.py` all 12 agent prompts** | Agent definitions in `packages/openai/src/agents/` | HIGH |
| **`gpc_agents/risk.py` flood/environmental logic** | `flood_zone_lookup` + `environmental_check` tools | HIGH |
| **`gpc_agents/entitlements.py` permit lifecycle** | `create_permit_record` + `analyze_zoning_entitlements` tools | HIGH |
| **`gpc_agents/coordinator.py` routing logic** | Coordinator agent handoff configuration | HIGH |
| **`gpc_agents/research.py` parcel research** | `research_parcel` + `search_parcels` tools | MEDIUM |
| **`gpc_agents/finance.py` pro forma + waterfall** | `build_proforma` + `size_debt` tools | MEDIUM |
| **`tools/financial_calcs.py` IRR/NPV/DSCR** | `packages/shared/src/finance/` utility functions | MEDIUM |
| **`gpc_agents/deal_screener.py` weight config** | Scoring config in `packages/shared/` | HIGH |

---

## Phased Build Plan

### Phase 0 — Foundations

**Goal**: Monorepo builds, DB initializes, local dev works.

**Deliverables:**

0a. **Generate Prisma migrations + seed**
- Run `pnpm db:migrate` to create initial migration from schema
- Seed script: 3 jurisdictions, seed sources, EBR zoning matrix, test org/user

0b. **Bootstrap `apps/worker/`**
- Create `package.json` with Temporal SDK deps
- Create minimal worker entry point (connects to Temporal, registers empty workflow/activity stubs)
- Wire into `pnpm dev` (runs web + worker concurrently)

0c. **CI pipeline**
- `.github/workflows/ci.yml`: install → lint → typecheck → test → build

0d. **Environment**
- Verify `.env.example`, document Supabase bucket setup

**Acceptance**: `pnpm install && pnpm dev` starts web + worker. `pnpm db:migrate && pnpm db:seed` creates tables + seed data.

---

### Phase 1 — Agent System + Chat Interface

**Goal**: You can open the app, type a message, and a Coordinator agent routes it to specialist agents that respond with real answers.

This is the most important phase. Everything else builds on top of a working agent chat.

**Deliverables:**

1a. **Agent definitions (`packages/openai/src/agents/`)**

Using `@openai/agents` TypeScript SDK:

- Define Coordinator agent with handoffs to all specialists
- Define Legal/Entitlements agent with system prompt ported from legacy `prompts/agent_prompts.py`
- Define Research agent with system prompt + `web_search` tool
- Define Risk agent with system prompt
- Define Finance agent with system prompt
- Define Deal Screener agent with system prompt
- Stub remaining agents (Design, Operations, Marketing, Tax, Market Intel) with prompts but minimal tools
- Configure model selection per agent (GPT-5.2 for Coordinator/Legal/Research/Finance, GPT-5.1 for others)

Each agent gets:
- System prompt (ported from legacy)
- Model config
- Tool list (starts minimal, grows in later phases)
- Handoff targets

1b. **Chat API route (`apps/web/app/api/chat/route.ts`)**

- `POST /api/chat` — accepts message + optional `dealId` context
- Authenticates Supabase session, scopes by org
- Runs the Coordinator agent with the user's message
- Streams response back via SSE (ReadableStream)
- Stores conversation history in DB (new `conversations` + `messages` tables in Prisma)
- If `dealId` provided, injects deal context into the Coordinator's prompt
- Supports resume endpoints:
  - `POST /api/chat/tool-approval`
  - `POST /api/chat/resume`
- Run-state resumption uses serialized checkpoint envelopes in `runs.serialized_state`.
- Runtime API/event contract is documented in `docs/chat-runtime.md`.

1c. **Chat UI (`apps/web/app/chat/`)**

- Full-screen chat interface (primary page, not a side panel)
- Message input with send button
- Streaming response display (tokens appear as they arrive)
- Agent attribution (show which agent is responding: "Legal Agent is analyzing...")
- Tool call visibility (collapsible: "Called zoning_matrix_lookup → A-1 prohibited for flex industrial")
- Deal selector (optional — scope conversation to a deal)
- Conversation history sidebar (past conversations, resumable)
- `/` — home page routes to chat (this IS the app)

1d. **Basic data tools for agents**

Wire minimal tools so agents can do something useful from day one:
- `get_deal_context(dealId)` — read deal + parcels from Prisma
- `create_deal(name, sku, jurisdictionId)` — create a new deal via chat
- `create_task(dealId, title, description)` — add tasks via chat
- `zoning_matrix_lookup(zoningCode, proposedUse)` — query seed data
- `web_search` — OpenAI built-in, domain-filtered to .gov sites

**Acceptance**: Open app → type "What zoning do I need for flex industrial in EBR?" → Coordinator routes to Legal agent → Legal agent calls zoning_matrix_lookup → returns answer with zoning codes. Type "Create a deal for 123 Main St, outdoor storage" → deal created in DB.

---

### Phase 2 — Evidence System + Research Tools

**Goal**: Agents can research parcels, capture evidence, and every source is snapshotted and hashed.

**Deliverables:**

2a. **Complete `packages/evidence/`**
- `snapshot.ts`: Playwright headless fetch → HTML + text extract
- `hash.ts`: SHA-256 of normalized content
- `upload.ts`: Store in Supabase Storage with deterministic keys
- `compare.ts`: Hash comparison for change detection

2b. **Evidence tools for agents**
- `evidence_snapshot(url)` — fetch + hash + store, return metadata. Agents call this whenever they rely on a source.
- `research_parcel(address)` — comprehensive parcel lookup (ownership, zoning, flood zone, utilities) using web_search + evidence capture
- `flood_zone_lookup(address)` — FEMA lookup with evidence snapshot of source
- `search_parcels(criteria)` — search available parcels by location/size/zoning

2c. **Evidence UI**
- `/evidence` — browse captured sources, view snapshots, see change history
- In chat: when an agent cites a source, the citation links to the stored evidence snapshot (not the live URL)

2d. **Port Research + Risk domain logic**
- Research agent: parcel research methodology from `legacy/python/gpc_agents/research.py`
- Risk agent: flood zone classification, SFHA determination, Phase I ESA triggers from `legacy/python/gpc_agents/risk.py`
- Environmental risk scoring logic as a tool function

**Acceptance**: Ask "Research the parcel at 7800 Airline Hwy" → Research agent calls web_search + evidence_snapshot → returns parcel data with stored evidence → evidence appears in `/evidence` browser. Ask "What's the flood risk?" → Risk agent calls flood_zone_lookup → returns FEMA zone with evidence link.

---

### Phase 3 — Parish Packs + Triage Scoring

**Goal**: Agents can generate and reference parish-specific knowledge, and score parcels.

**Deliverables:**

3a. **Parish pack generation tool**
- `generate_parish_pack(jurisdictionId, sku)` — calls OpenAI Responses API with:
  - ParishPack Zod schema (strict structured output)
  - web_search tool (domain-filtered to jurisdiction's official domains)
  - file_search tool (Entitlement Kit vector store)
  - `include: ["web_search_call.action.sources", "file_search_call.results"]`
  - Evidence capture for all consulted sources
  - Citation validation (reject if key fields lack sources)
- Stores versioned pack in `parish_pack_versions` table
- Long-running → wrap as Temporal activity called by `refresh_parish_pack` tool

3b. **Parish pack lookup tool**
- `parish_pack_lookup(jurisdictionId, sku, section?)` — retrieve current pack from DB
- Agents reference this when answering entitlement questions
- If pack is stale (>30 days), agent suggests refreshing

3c. **Triage scoring tools**
- Port `legacy/python/tools/screening.py` scoring algorithm to TypeScript:
  - `scoreFromBands()` — band-based scoring
  - `hardFilterCheck()` — SFHA/contamination/prohibited-zoning/utilities fail conditions
  - `computeTriageScore()` — weighted aggregation with missing-data handling
- `parcel_triage_score(parcelData, parishPack)` tool:
  - Calls OpenAI for structured ParcelTriage output (KILL/HOLD/ADVANCE, risk scores, disqualifiers)
  - Runs ported scoring algorithm against the AI output
  - Returns combined result: AI analysis + numeric score + tier (Green/Yellow/Red/Gray)

3d. **Parish pack + triage in chat**
- Ask "What's the CUP process in EBR for outdoor storage?" → Legal agent calls parish_pack_lookup → returns process with cited fees, deadlines, requirements
- Ask "Triage this parcel" (in deal context) → Coordinator gathers data → calls parcel_triage_score → renders triage card in chat (decision badge, risk radar, score breakdown)

3e. **Populate seed sources for 3 parishes**
- EBR, Ascension, Livingston official URLs in `jurisdiction_seed_sources`

**Acceptance**: Ask "Refresh the EBR parish pack for flex industrial" → agent triggers generation → pack stored with citations → subsequent questions reference it. Ask "Triage my deal" → scoring runs → GREEN/YELLOW/RED result with breakdown.

---

### Phase 4 — Deal Management + CRUD

**Goal**: Full deal lifecycle management, driven by chat and supplemented by UI pages.

**Deliverables:**

4a. **Deal management tools for agents**
- `create_deal(name, sku, jurisdiction, parcels[])` — full deal creation
- `update_deal_status(dealId, status)` — move through pipeline
- `get_deal_summary(dealId)` — current state, latest triage, tasks, artifacts
- `list_deals(filters?)` — "show me all my active deals"
- `add_parcel_to_deal(dealId, address, apn?)` — attach parcel
- `create_task(dealId, title, pipelineStep, dueAt?)` — add task
- `update_task(taskId, status)` — mark done/blocked
- `add_buyer(name, company, skuInterests[], jurisdictions[])` — add to buyer DB
- `search_buyers(sku?, jurisdiction?)` — find buyers for a deal
- `log_outreach(dealId, buyerId, channel, notes)` — record contact

4b. **Deal UI pages (supplement to chat)**
- `/deals` — deal list with status/SKU/jurisdiction filters
- `/deals/[id]` — deal detail with tabs (overview, parcels, tasks, artifacts, evidence, chat)
- `/deals/[id]/chat` — deal-scoped chat (every message has deal context injected)
- `/buyers` — buyer database
- `/jurisdictions` — jurisdiction list with pack freshness indicators

4c. **Navigation restructure**
- Chat is the home page (`/`)
- Sidebar: Chat, Deals, Buyers, Jurisdictions, Evidence
- Old dashboard pages removed or parked under `/legacy`

**Acceptance**: Chat: "Create a deal for 456 Oak St, truck parking, EBR" → deal created. "Show me my deals" → list returned. Navigate to `/deals/[id]` → see full deal detail. Deal-scoped chat → all messages know about this deal.

---

### Phase 5 — Artifact Generation

**Goal**: Agents can generate PDFs and PPTXs on demand, downloadable from chat.

**Deliverables:**

5a. **Artifact generation tools**
- `generate_artifact(dealId, artifactType)` — generates file, uploads to Supabase Storage, returns signed download URL
  - TRIAGE_PDF: HTML template → Playwright print-to-PDF
  - HEARING_DECK_PPTX: PptxGenJS with deal facts + conditions
  - SUBMISSION_CHECKLIST_PDF: Parish-pack-driven checklist
  - EXIT_PACKAGE_PDF: Approval summary + evidence appendix
  - BUYER_TEASER_PDF: One-page deal teaser
- Deterministic versioning: same inputs = same version (idempotent)
- Changed inputs = v+1

5b. **Complete HTML/PPTX templates**
- Fill stub templates with real layouts, branding, data binding
- Templates accept typed context objects

5c. **Artifacts in chat**
- Ask "Build me a hearing deck for this deal" → agent generates PPTX → download card appears in chat
- Ask "Generate the exit package" → PDF generated → inline download
- `/deals/[id]/artifacts` tab shows all generated artifacts with version history

**Acceptance**: In deal-scoped chat: "Generate the hearing deck" → PPTX created → download link in chat. "Generate submission checklist" → PDF created. Re-running with same data returns same version.

---

### Phase 6 — Background Automation (Temporal)

**Goal**: Parish packs stay fresh automatically. Long-running tasks don't block the chat.

**Deliverables:**

6a. **Temporal workflows**
- `ParishPackRefreshWorkflow` — called by `refresh_parish_pack` tool. Fetches seed sources, snapshots evidence, generates pack, validates, stores.
- `ChangeDetectionWorkflow` — scheduled nightly. Compares hashes for all seed sources. Triggers refresh if changed.
- `BulkArtifactWorkflow` — generates multiple artifacts for a deal in sequence.

6b. **Temporal schedules**
- Nightly: change detection for all jurisdictions
- Weekly: full parish pack refresh (failsafe)

6c. **Agent awareness of background tasks**
- When an agent triggers a Temporal workflow, it can either wait (short tasks) or notify you later (long tasks)
- "I've kicked off the parish pack refresh. I'll let you know when it's done." → notification in chat when workflow completes
- Deal detail page shows active background tasks

**Acceptance**: Parish pack refresh runs as Temporal workflow (survives crashes). Nightly change detection runs on schedule. Chat shows "task running" and notifies on completion.

---

### Phase 7 — Polish + Hardening

**Goal**: Production-ready for internal use.

**Deliverables:**

7a. **Chat UX polish**
- Structured result rendering (triage cards, score breakdowns, artifact download cards, evidence links)
- Suggested actions ("Based on this triage, would you like me to generate the hearing deck?")
- Agent thinking indicators (which agent, which tools called)
- Error recovery ("That tool call failed. Want me to try a different approach?")
- Mobile-responsive chat

7b. **Agent improvements**
- Agent memory within a deal (past triage results, previous research, conversation history fed as context)
- Agent suggestions for new agents ("This looks like a tax structuring question — I don't have a deep tax tool yet. Want me to outline what a specialized tax agent would need?")
- Multi-agent synthesis (Coordinator summarizes when multiple agents contribute)

7c. **Production hardening**
- Sentry (web + worker)
- Structured logging
- Security review (org_id scoping, signed URL expiration, API key isolation)
- Idempotency verification
- Rate limit handling

**Acceptance**: Internal team uses the system daily for real deals. Chat is the primary interface. Artifacts are generated and downloaded. Parish packs stay current.

---

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 16, React 19, Tailwind, shadcn/ui | Already in place |
| **Chat Streaming** | SSE via Next.js Route Handlers | CopilotPanel.tsx already proves this pattern |
| **Agent Framework** | `@openai/agents` (TypeScript SDK) | Handoffs, guardrails, function tools, tracing — mirrors the old Python agent architecture |
| **AI Models** | GPT-5.2 (Coordinator, Legal, Research, Finance), GPT-5.1 (others) | Best reasoning where it matters, cost-effective elsewhere |
| **AI API** | OpenAI Responses API | Agentic loop, web_search, file_search, structured outputs |
| **Structured Outputs** | Zod → zodTextFormat → strict JSON schema | Guaranteed conformance |
| **Database** | Supabase PostgreSQL via Prisma | Schema exists, type-safe |
| **Background Jobs** | Temporal (parish pack refresh, change detection, bulk artifact gen) | Durable execution for long-running tasks only |
| **Evidence Capture** | Playwright headless + SHA-256 + Supabase Storage | Already a dependency, zero additional cost |
| **Artifact Generation** | PptxGenJS + Playwright print-to-PDF | Already scaffolded |
| **File Storage** | Supabase Storage (private buckets, signed URLs) | Existing project |
| **Auth** | Supabase Auth | Already configured, needed for Storage security |
| **Testing** | Vitest (unit), Playwright (e2e) | TypeScript-native |
| **CI** | GitHub Actions | Standard |

---

## What Changed From the Previous Plan

| Previous Plan | Revised Plan |
|---|---|
| Temporal workflows as primary orchestration | **Agents** as primary orchestration, Temporal for background only |
| Button-driven UI (click "Run Triage") | **Chat-driven UI** (type "triage this parcel") |
| Narrow scope (entitlement flips only) | **Broad agent system** with entitlement tools as the deepest capability |
| 8 rigid pipeline phases | **Conversational flow** — agents decide what to do based on what you ask |
| No conversational interface | **Chat is the home page** |
| OpenAI Agents SDK deferred to "future" | **OpenAI Agents SDK (TypeScript) adopted now** as the core architecture |
| All 12 agents rebuilt from scratch | **12 agents ported** from legacy Python prompts + logic |
| Old dashboard discarded | **Old CopilotPanel pattern** used as chat prototype |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Agent routing misses the right specialist | Coordinator prompt engineering + keyword hints in handoff descriptions (proven pattern from legacy system) |
| Chat latency (multi-agent round trips) | Stream tokens as they arrive. Show "Legal Agent is analyzing..." while waiting. Parallel agent calls where possible. |
| Agents hallucinate parish process details | Parish pack tool returns cited, validated data. Citation validator rejects unsourced claims. Evidence snapshots prove sources existed. |
| Long-running tasks block chat | Temporal for background work. Agent says "I've kicked that off" and notifies when done. |
| Tool sprawl (too many tools per agent) | Each agent gets only its relevant tools. Coordinator has handoffs, not tools. Keep tool count per agent under 10. |
| OpenAI rate limits during heavy use | Retry with backoff in `packages/openai/retry.ts`. Temporal activity retries for background jobs. |
| Conversation context grows too large | Session-backed compaction + deduplication (`apps/web/lib/chat/session.ts`) plus deal context injection. |

---

## Open Questions

1. **Firecrawl vs. Playwright-only for evidence capture?** Playwright is free and already installed. Firecrawl gives cleaner output but adds cost. Start with Playwright?

2. **Temporal Cloud vs. self-hosted?** Only needed for background jobs now (not primary orchestration). Self-hosted via Docker Compose might be sufficient for v1.0.

3. **Conversation storage** — implemented in Prisma (`conversations`, `messages`) with session runtime wrappers for compaction/deduplication.

4. **Which parish to build first?** EBR has the most legacy domain knowledge. Start there.

5. **How visible should tool calls be in chat?** Options: (a) always show, (b) collapsible, (c) hidden. Collapsible seems right — power user can see what happened, but it doesn't clutter the conversation.

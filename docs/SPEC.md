# Entitlement OS v1.0

Source-of-truth build plan for: Next.js (TypeScript) + Postgres + Temporal + OpenAI Responses API + Supabase Storage

This document is the authoritative spec for what we are building. It includes architecture, data model, workflows, API contracts, prompts/schemas, storage layout, security model, deployment, testing, and a phased delivery plan.

## 0) Decisions and assumptions

### Final stack decisions (locked)

- Frontend + API: Next.js (TypeScript), App Router
- System of record: Postgres (single database)
- Orchestration: Temporal (Temporal Cloud recommended)
- AI runtime: OpenAI Responses API (not Chat Completions)
- Artifact storage + evidence vault: Supabase Storage (private buckets, signed URLs)
- Auth: Supabase Auth (fits Storage security + private buckets model; you can swap later)

### Operating principle (what the software optimizes for)

You are not building "a real estate app."
You are building a certainty-manufacturing machine:

- Approved / near-approved dirt
- Citations for every process claim
- Repeatable entitlement packets
- Buyer-ready exit packages

### Explicit assumptions (so we don't stall)

- Primary user is you + small internal team (multi-tenant-ready, but not public SaaS on day 1).
- No vertical construction workflows in v1 (we stop at approvals + deal exit package).
- Parish processes must be current -> we implement automatic refresh + change detection with evidence snapshots.
- We will store all "what we relied on" (sources + timestamps + snapshots) to defend decisions later.

## 1) Product scope

### 1.1 Core entities you manage

- Deals (an entitlement flip effort)
- Parcels (one or multiple per deal)
- Jurisdictions (EBR, Ascension, Livingston + optional municipalities)
- SKUs (3 entitlement products)
- Parish Packs (the living knowledge base of process truth + schedules + fees + notice rules)
- Tasks (pipeline steps 1-8)
- Artifacts (triage sheets, hearing decks, exit package PDFs)
- Buyers/Contacts + Outreach (pre-sell system)
- Evidence (URLs + retrieved snapshots + hashes)

### 1.2 SKUs (non-negotiable)

- Light Industrial / Small-Bay Flex
- Outdoor Storage / Contractor Yards / Laydown
- Truck/Trailer Parking (secured, no fueling/repair)

### 1.3 Parish coverage (v1)

- East Baton Rouge Parish (EBR)
- Ascension Parish
- Livingston Parish

### 1.4 "Done" definition (v1)

A deal is operationally "done" in the app when:

- Triage is produced (kill/hold/advance)
- Parish Pack is current (freshness within configured window)
- A complete entitlement plan + submission checklist + hearing deck + exit package is generated and stored
- A 30-buyer pre-sell list exists for that SKU and parish

## 2) System architecture (high level)

### 2.1 Components

#### Next.js Web App

- UI
- Auth session management
- CRUD API (Deals, Tasks, Buyers, Artifacts, Evidence)
- "Start workflow" endpoints (thin layer)

#### Temporal Worker Service (Node/TypeScript)

- Runs workflows (triage, parish pack refresh, artifact generation, buyer list builds)
- Performs all long-running and retryable work
- Calls OpenAI API
- Fetches and snapshots source pages/PDFs
- Generates artifacts and uploads to Supabase Storage

#### Postgres

- Single source of truth (status, entities, versions, audit)

#### Supabase Storage

Private buckets for:

- artifacts
- evidence snapshots (HTML/PDF/text)
- uploads (surveys, drawings, etc)

Buckets are private by default; access is controlled (RLS in Supabase's model).

#### OpenAI Responses API

- Structured outputs (strict JSON schema)
- Web search tool for real-time parish research
- File search tool over OpenAI vector stores for your internal "entitlement kit"
- Capture citations/sources from tool calls via include

## 3) Repo structure (monorepo)

```
entitlement-os/
  apps/
    web/                 # Next.js app
    worker/              # Temporal Worker (Node TS)
  packages/
    db/                  # Prisma schema + migrations + seed scripts
    shared/              # Zod schemas, enums, types, utilities
    openai/              # Responses API wrapper + schemas + prompt library
    artifacts/           # PPTX/PDF generators
    evidence/            # Fetch/snapshot/extract utilities
  infra/
    docker/              # local dev (postgres + temporal dev)
    terraform/           # optional IaC
  docs/
    SPEC.md              # this document (source of truth)
  AGENTS.md              # Codex project instructions
  .agents/skills/        # Codex skills library
```

## 4) Data model (Postgres) — canonical schema

We will use Prisma for migrations + type generation, but the underlying schema is defined here as source of truth.

### 4.1 Enums

- sku_type: SMALL_BAY_FLEX | OUTDOOR_STORAGE | TRUCK_PARKING
- deal_status: INTAKE | TRIAGE_DONE | PREAPP | CONCEPT | NEIGHBORS | SUBMITTED | HEARING | APPROVED | EXIT_MARKETED | EXITED | KILLED
- task_status: TODO | IN_PROGRESS | BLOCKED | DONE | CANCELED
- artifact_type: TRIAGE_PDF | PARISH_PACK_PDF | SUBMISSION_CHECKLIST_PDF | HEARING_DECK_PPTX | EXIT_PACKAGE_PDF | BUYER_TEASER_PDF
- evidence_type: WEB_PAGE | PDF | IMAGE | TEXT_EXTRACT
- run_type: TRIAGE | PARISH_PACK_REFRESH | ARTIFACT_GEN | BUYER_LIST_BUILD | CHANGE_DETECT

### 4.2 Tables (minimum v1)

#### orgs

- id uuid pk
- name text
- created_at timestamptz

#### users

- id uuid pk (matches Supabase auth user id)
- email text
- created_at timestamptz

#### org_memberships

- org_id uuid fk -> orgs
- user_id uuid fk -> users
- role text (owner|admin|member)
- created_at timestamptz
- UNIQUE (org_id, user_id)

#### jurisdictions

- id uuid pk
- org_id uuid fk
- name text (e.g., "East Baton Rouge Parish")
- kind text (parish|city)
- state text (LA)
- timezone text (America/Chicago)
- official_domains text[] (allowlist)
- created_at timestamptz

#### jurisdiction_seed_sources (what we consider "official starting points")

- id uuid pk
- jurisdiction_id uuid fk
- purpose text (forms|fees|schedule|ordinance|applications)
- url text
- active boolean
- created_at timestamptz

#### deals

- id uuid pk
- org_id uuid fk
- name text
- sku sku_type
- jurisdiction_id uuid fk
- status deal_status
- target_close_date date null
- notes text null
- created_by uuid fk -> users
- created_at timestamptz
- updated_at timestamptz

#### parcels

- id uuid pk
- org_id uuid fk
- deal_id uuid fk -> deals
- address text
- apn text null
- lat numeric null
- lng numeric null
- acreage numeric null
- current_zoning text null
- future_land_use text null
- utilities_notes text null
- created_at timestamptz

#### tasks

- id uuid pk
- org_id uuid fk
- deal_id uuid fk
- title text
- description text null
- status task_status
- due_at timestamptz null
- owner_user_id uuid null
- pipeline_step int (1-8)
- created_at timestamptz

#### buyers

- id uuid pk
- org_id uuid fk
- name text
- company text null
- email text null
- phone text null
- buyer_type text (operator|developer|investor|broker)
- sku_interests sku_type[]
- jurisdiction_interests uuid[] (array of jurisdiction ids)
- notes text null
- created_at timestamptz

#### outreach

- id uuid pk
- org_id uuid fk
- deal_id uuid fk
- buyer_id uuid fk
- channel text (call|email|text|in_person)
- status text (planned|sent|completed|no_response|not_interested)
- last_contact_at timestamptz null
- next_followup_at timestamptz null
- notes text null

#### runs (immutable log of every workflow execution)

- id uuid pk
- org_id uuid fk
- run_type run_type
- deal_id uuid null
- jurisdiction_id uuid null
- sku sku_type null
- status text (running|succeeded|failed|canceled)
- started_at timestamptz
- finished_at timestamptz null
- error text null
- openai_response_id text null
- input_hash text null
- output_json jsonb null
- serialized_state jsonb null (SDK run-state checkpoints for interruption/resumption)

#### evidence_sources (canonical URL record)

- id uuid pk
- org_id uuid fk
- url text unique per org
- domain text
- title text null
- is_official boolean
- first_seen_at timestamptz

#### evidence_snapshots (what we captured at time X)

- id uuid pk
- org_id uuid fk
- evidence_source_id uuid fk
- retrieved_at timestamptz
- http_status int
- content_type text
- content_hash text
- storage_object_key text (Supabase path)
- text_extract_object_key text null
- run_id uuid fk -> runs

#### parish_pack_versions (versioned jurisdiction truth; never overwritten)

- id uuid pk
- org_id uuid fk
- jurisdiction_id uuid fk
- sku sku_type
- version int
- status text (draft|current|superseded|invalid)
- generated_at timestamptz
- generated_by_run_id uuid fk -> runs
- pack_json jsonb (STRICT schema output)
- UNIQUE (jurisdiction_id,sku,version)

#### artifacts

- id uuid pk
- org_id uuid fk
- deal_id uuid fk
- artifact_type artifact_type
- version int
- storage_object_key text
- created_at timestamptz
- generated_by_run_id uuid fk -> runs
- UNIQUE (deal_id,artifact_type,version)

## 5) Storage design (Supabase Storage)

### 5.1 Buckets (all private)

Supabase buckets are private by default; private bucket access is controlled via policies.

- artifacts/
- evidence/
- uploads/

### 5.2 Object key conventions (deterministic for idempotency)

#### Artifacts

`artifacts/{orgId}/deals/{dealId}/{artifactType}/v{version}/{filename}`

#### Evidence snapshots

`evidence/{orgId}/sources/{sourceId}/snapshots/{retrievedAtISO}/{contentHash}.{ext}`

`evidence/{orgId}/sources/{sourceId}/extracts/{retrievedAtISO}/{contentHash}.txt`

### 5.3 Access pattern

- Worker uploads with service role credentials.
- Web app never exposes buckets publicly.
- Web app generates signed URLs for authorized users to view/download files. Supabase supports signed URLs.

Uploads (user-provided) use server-side signed upload or direct upload via policy (v2 feature; optional). Upload APIs are provided in supabase-js.

## 6) Temporal architecture (the machine)

### 6.1 Why Temporal is mandatory for "optimal"

Entitlement OS is a long-horizon, failure-prone process: web pages change, meetings slip, tasks re-run, artifacts regenerate.

Temporal gives you: durable execution, retries, schedules, visibility, and idempotent workflow control.

### 6.2 Temporal determinism rule

No network calls in workflows. External calls happen in Activities.

Temporal's guidance: Activities execute in standard Node.js environment and may be retried repeatedly, so idempotency matters.

### 6.3 Workflows (v1)

#### W1) DealIntakeWorkflow(dealId)

Purpose: Move from intake -> triage completed + initial task plan created.

Steps:

- Activity: LoadDealAndParishPack(dealId)
- Activity: RunParcelTriage(dealId) -> saves triage JSON into runs.output_json, updates deal status.
- Activity: GenerateInitialTaskPlan(dealId) -> creates tasks for steps 1-8 with due dates where possible.
- Activity: QueueArtifactGeneration(dealId, ["TRIAGE_PDF"])

End.

#### W2) JurisdictionRefreshWorkflow(jurisdictionId, sku)

Purpose: Keep parish pack current with citations + evidence snapshots.

Steps:

- Activity: FetchSeedSources(jurisdictionId)
- For each URL:
  - Activity: FetchAndSnapshotSource(url) (stores in Supabase + DB)
  - Activity: ExtractText(url) (HTML->text, PDF->text)
- Activity: GenerateParishPackWithOpenAI(jurisdictionId, sku)
  - Uses extracted texts + web_search tool for gaps
  - Returns strict JSON with sources for every claim
  - Captures web_search sources via include
- Activity: ValidateParishPackSchemaAndCitations()
- Activity: PromoteToCurrentVersion() (mark previous current as superseded)

#### W3) ArtifactGenerationWorkflow(dealId, artifactSet)

Generates:

- submission checklist PDF
- hearing deck PPTX
- exit package PDF
- buyer teaser PDF

Artifacts are deterministic and versioned.

#### W4) ChangeDetectionWorkflow(jurisdictionId)

Daily/weekly:

- Re-fetch seed sources -> compare content_hash -> if changed:
  - trigger JurisdictionRefreshWorkflow for all SKUs

#### W5) BuyerPresellWorkflow(dealId)

Builds/validates "30 buyer list"
Creates outreach tasks + drafts
Doesn't auto-send (v1)

### 6.4 Temporal schedules

- Nightly: Change detection for all jurisdictions
- Weekly: Full refresh regardless of change (failsafe)
- Daily: Scorecard KPI generation

## 7) OpenAI integration (Responses API) — exact contract

### 7.1 Why Responses API (not Chat Completions)

OpenAI recommends Responses for new projects.

### 7.2 Data retention posture

Default store is true in Responses API.

Our plan: set store: false and persist everything we need in our own DB + Storage. (You can flip if you want dashboard replay.)

### 7.3 Tooling we use

- web_search tool enabled in Requests for parish packs and "process truth."
- file_search tool enabled over OpenAI vector stores for internal kit.
  - Tool accepts vector_store_ids.

### 7.4 Capturing citations/sources (required)

We must capture:

- web_search_call.action.sources
- file_search_call.results

Responses supports this via include.

### 7.5 Structured outputs (no brittle parsing)

We use Structured Outputs with strict JSON Schema so downstream automation never breaks.

### 7.6 Models (default policy)

We will keep models configurable, but these defaults are optimal:

- Parish Packs / legal-ish process extraction: gpt-5.2 with reasoning.effort: high (or xhigh when conflicting sources).
- Hard investigations / messy, long tasks: gpt-5.2 pro in background mode if needed.
- Cheap, high-volume drafting (outreach templates, summaries): gpt-5 mini (still using schemas where possible).

### 7.7 Rate limits + retries (required)

Handle 429 and 5xx with exponential backoff + jitter.

Temporal retries are not enough: we still implement client-level backoff to behave well and reduce wasted runs.

## 8) OpenAI vector stores ("Entitlement Kit" memory)

### 8.1 What goes into the kit

- Your standard conditions packages per SKU
- Your hearing deck boilerplate slides
- Your parcel triage worksheet templates
- Past successful approvals, notes, and packets
- Any local consultant checklists and SOPs

### 8.2 Implementation

- Upload files to OpenAI File API
- Create vector store
- Add files to vector store
- Use file_search with vector_store_ids

Vector stores power file_search.

### 8.3 Sync strategy (important)

Source of truth for files remains in repo + Supabase uploads.

A nightly Temporal job ensures OpenAI vector store is updated to match:

- if file hash changed -> re-upload and re-attach

## 9) Domain workflows mapped to your 1-8 pipeline

We will represent each step as both:

- a deal status milestone, and
- a task group template.

### Step 1) Parcel triage (24 hours)

System outputs:

- Triage JSON (strict schema)
- Triage PDF artifact
- Auto-created tasks for missing info

### Step 2) Pre-app staff call

System outputs:

- Pre-app call agenda (generated)
- Pre-filled staff questions (SKU + parish-specific)
- Call note capture form (structured)
- "Path confirmed" toggle -> updates deal status

### Step 3) Concept plan v1 (72 hours)

System outputs:

- Engineer brief (site plan needs)
- Conditions draft v1 (SKU standardized + site deltas)
- Upload slot for civil concept PDF

### Step 4) Neighbor strategy

System outputs:

- Abutter list template + meeting log
- Outreach scripts (non-spam)
- "objection register" + mitigation tracker

### Step 5) Submit packet

System outputs:

- Parish-specific checklist (from Parish Pack)
- "Packet completeness" validator (all required docs uploaded)
- Deadline dates calculated from meeting calendar

### Step 6) Hearing playbook (10-slide deck)

System outputs:

- Hearing deck PPTX generated with deal-specific facts and conditions

### Step 7) Exit package

System outputs:

- Exit one-pager PDF (approval summary + conditions + plan)
- Evidence appendix (citations and snapshots index)

### Step 8) Pre-sell list

System outputs:

- 30-buyer list validator
- Buyer teaser PDF (one page)
- Outreach task cadence (no auto-send in v1)

## 10) API surface (Next.js route handlers)

### 10.1 CRUD endpoints (v1)

- POST /api/deals
- GET /api/deals
- GET /api/deals/:id
- PATCH /api/deals/:id
- POST /api/deals/:id/run-triage
  - starts Temporal DealIntakeWorkflow (or triage child workflow)
- POST /api/jurisdictions/:id/refresh?sku=...
  - starts JurisdictionRefreshWorkflow
- POST /api/deals/:id/generate-artifacts
  - starts ArtifactGenerationWorkflow
- GET /api/artifacts/:id/signed-url
  - returns signed URL from Supabase

### 10.2 "No direct DB access" rule

Clients never talk to Postgres directly. Only Next API and worker do.

## 11) Canonical JSON schemas (key outputs)

### 11.1 ParishPack.schema.json (core)

Minimum required sections:

- jurisdiction
- sku
- paths (CUP / rezoning / variance applicability + recommended)
- meeting_cadence (types, times, locations, deadlines)
- application_requirements (required docs + checklists)
- fees (each fee item + sources)
- notice_rules (+ sources)
- links (official pages)
- sources_summary (deduped URLs)
- generated_at, schema_version

Every field that is a "process claim" must include sources: string[] URLs.
We enforce this in validators.

### 11.2 ParcelTriage.schema.json

- decision: KILL|HOLD|ADVANCE
- recommended_path: CUP|REZONING|VARIANCE|UNKNOWN
- risk scores for: access, drainage, adjacency, env, utilities, politics
- disqualifiers[]
- next_actions[] (task templates)
- assumptions[]

### 11.3 ArtifactSpec.schema.json

- artifact_type
- sections[] with structured content and citations where applicable

Ensures artifacts can be regenerated deterministically

## 12) Evidence capture: "prove it later" system

### 12.1 Evidence rules

Whenever we rely on a source to generate a Parish Pack:

- we store the URL,
- we store a retrieved snapshot (HTML/PDF),
- we store a text extract,
- we hash content,
- we store tool-provided citations from OpenAI web search.

This is what makes the OS defensible.

### 12.2 How we get sources from OpenAI tool calls

Responses supports include with web_search_call.action.sources and file_search_call.results.
We store those results in runs.output_json and also normalize into evidence_sources.

## 13) Artifact generation (PPTX/PDF) — deterministic pipeline

### 13.1 Templates live in code

`/packages/artifacts/templates/`

- hearing_deck.ts (pptx builder)
- exit_package.html (html template -> PDF)
- submission_checklist.html -> PDF
- triage_report.html -> PDF

### 13.2 Rendering strategy

- PPTX: PptxGenJS
- PDF: Playwright "print to PDF" (HTML -> PDF)

deterministic, brandable, consistent

### 13.3 Artifact versioning

Artifacts are versioned by:

the deal's current data hash + pack version + template version
If any changes -> create v+1.

## 14) Security model

### 14.1 Secrets

- OpenAI API key: worker only
- Supabase service role key: worker only
- Next.js uses Supabase anon key for auth/session, but not privileged operations.

### 14.2 Authorization

Every table has org_id.

Every API route validates:

- session user
- membership in org
- access to deal/jurisdiction by org_id

### 14.3 Storage security

Buckets private by default; access controlled via policies.

We generate signed URLs for authorized downloads.

### 14.4 AI safety / correctness guardrails

For parish-process outputs:

- allowlist domains in prompt + post-validation
- reject packs with missing sources
- flag any pack where non-official sources dominate

## 14.5 Chat runtime contracts (implemented)

- `POST /api/chat`
  - Starts or continues chat execution.
  - Streams SSE events (text deltas, tool lifecycle, agent switches, summary/done).
- `POST /api/chat/tool-approval`
  - Accepts `{ runId, toolCallId, action }`.
  - Resumes pending approval state and returns emitted events.
- `POST /api/chat/resume`
  - Accepts `{ runId }`.
  - Rehydrates a serialized checkpoint envelope from `runs.serialized_state` (or pending approval fallback) and resumes execution.

Checkpoint persistence semantics:

- Tool completion checkpoints are persisted when SDK state is available.
- Approval-pending and final-result boundaries persist serialized checkpoint envelopes.
- Checkpoints are stored in `runs.serialized_state` as JSON envelopes containing:
  - serialized state string
  - checkpoint kind/time metadata
  - run and correlation context

Reference runtime contract:

- `docs/chat-runtime.md` is the API/event contract source for chat runtime behavior.

## 15) Reliability and failure modes (and what we do about them)

### 15.1 OpenAI rate limits / transient failures

Retry with exponential backoff.

Temporal activity retries configured with:

- maximum attempts
- backoff coefficient
- non-retryable errors for schema violations

### 15.2 Non-deterministic web sources

Pages change without notice -> we snapshot + hash.

If hash changes -> create new parish pack version.

### 15.3 "Hallucinated fee/deadline"

Blocked by:

- strict JSON schema + required sources
- validator rejects if key fields lack citations
- allowlist policy and "official-only" preference

## 16) Observability (must-have, not optional)

Structured logs from worker:

- run_id, workflow_id, activity_name, duration_ms

Store:

- OpenAI response id (when available) in runs.openai_response_id

Error reporting: Sentry (web + worker)

Metrics:

- runs/day
- success rate
- avg time per pack refresh
- "packs invalid due to missing citations" count

## 17) Deployment (optimal, low-ops)

### 17.1 Recommended hosting

- Temporal Cloud (managed)
- Supabase project (Auth + Storage + Postgres)
- Next.js deployed on a Node runtime (Vercel is fine if Node functions are used; no Edge-only constraints)
- Temporal Worker deployed as a long-running container (Fly.io / AWS ECS / Render)

### 17.2 Local dev

Docker Compose:

- Postgres
- Temporal dev server + Temporal Web UI

Use Supabase local (optional) or dev Supabase project for Storage/Auth.

## 18) Codex App usage (how we build this efficiently)

This is how we run development like a small team with parallel streams.

Use worktrees to run independent build threads in parallel.

Put all build rules in AGENTS.md so Codex behaves consistently across threads.

Package repeatable workflows (DB schema, Temporal scaffolding, OpenAI wrapper, artifact gen) into agent skills.

## 19) Build plan (start to finish) — phases + acceptance criteria

### Phase 0 — Foundations (infra + repo)

Deliverables:

- Monorepo created with apps/packages structure
- Supabase project created (Auth + Storage + Postgres)
- Temporal Cloud namespace configured
- Secrets stored in proper env var management
- CI pipeline (lint, typecheck, unit tests)

Acceptance:

- apps/web runs locally
- apps/worker connects to Temporal + Postgres

### Phase 1 — Data model + CRUD UI (Deals/Tasks/Buyers)

Deliverables:

- Prisma schema + migrations
- Deals CRUD screens
- Tasks board per deal
- Buyers CRUD + outreach log

Acceptance:

- You can create a deal, attach parcel, create tasks, add buyers

### Phase 2 — Evidence system (snapshots + hashing + storage)

Deliverables:

- Evidence fetcher (HTML + PDF)
- Snapshot upload to Supabase evidence bucket
- Text extraction stored
- Evidence tables populated

Acceptance:

Given a URL, the system stores:

- evidence_source
- evidence_snapshot
- snapshot file + extracted text

### Phase 3 — OpenAI wrapper + strict schemas + validators

Deliverables:

- OpenAI Responses client wrapper
- Standard retry/backoff logic
- Schema validation layer (Zod + JSON schema)
- "Missing citations" validator

Acceptance:

A test run produces valid JSON and fails if sources are missing
Structured outputs and Responses contract implemented.

### Phase 4 — Parish Pack generation (EBR/Ascension/Livingston)

Deliverables:

- Jurisdiction seed sources table populated for all 3 parishes
- JurisdictionRefreshWorkflow live
- Parish pack UI viewer (field-by-field + sources)

Acceptance:

Clicking "Refresh Parish Pack" produces:

- new pack version
- citations linked
- evidence snapshots created

Web search tool enabled where needed.

### Phase 5 — Deal Intake Workflow (triage + initial plan)

Deliverables:

- DealIntakeWorkflow wired
- Triage schema output + UI
- Initial task plan generation

Acceptance:

POST /api/deals/:id/run-triage:

- completes
- updates deal status
- creates tasks

### Phase 6 — Artifact Factory (PDF + PPTX)

Deliverables:

- Triage PDF generator
- Hearing deck PPTX generator
- Exit package PDF generator
- Signed URL download in UI

Acceptance:

For a deal, you can generate and download:

- hearing deck
- exit package
- submission checklist

### Phase 7 — Change detection + automatic refresh

Deliverables:

- ChangeDetectionWorkflow scheduled
- Diff viewer (what changed in sources / pack versions)
- Alerting (email/slack optional)

Acceptance:

If an official page changes:

- system creates new pack version
- flags what changed

### Phase 8 — Production hardening

Deliverables:

- Sentry, logs, metrics
- Backups + restore runbook
- Load test: 100 refresh runs/day
- Security review checklist

Acceptance:

- Worker can retry safely
- No duplicated artifacts on retries
- Evidence trail always present

## 20) What you can do immediately (Day 1 execution checklist)

- Create Supabase project + buckets (artifacts, evidence, uploads)
- Stand up Temporal Cloud namespace
- Initialize repo + AGENTS.md + skills
- Build DB + CRUD UI
- Ship Evidence snapshot system
- Ship Parish Pack workflow + validator
- Ship artifact generation
- Ship change detection

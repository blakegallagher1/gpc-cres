# Entitlement OS: AGI for CRE — Implementation Plan

You are an elite full-stack engineer and CRE domain expert. You are building **Entitlement OS**, an AI-powered operating system for commercial real estate investment and development. The platform already has strong infrastructure: 13 agents with 26+ tools, 12 automation loops, 18 data models, 560K parcels, and a rich UI with 30+ routes built on **Next.js 15, React 19, TypeScript, Supabase (Postgres), and Tailwind CSS**.

Your mission is to transform this from a reactive chat-plus-database into an **autonomous intelligence platform** that works on deals while the user sleeps. You will implement the 9 capabilities below **in priority order**, completing each phase before moving to the next.

---

## SHARED INFRASTRUCTURE CONVENTIONS

**These decisions are locked in. Every phase must follow them. Establish these patterns in Phase 1 so all subsequent phases inherit them automatically.**

### Standard Table Columns
Every new table MUST include these columns unless there is an explicit reason not to:
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
created_by    UUID REFERENCES auth.users(id),  -- nullable only for system-generated rows
```
- Add a Postgres trigger on every new table to auto-update `updated_at` on row modification. If a shared trigger function already exists, reuse it. If not, create one in the first migration and reuse across all phases:
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
- All `id` columns are UUID, never serial/integer.
- All timestamps are `TIMESTAMPTZ`, never `TIMESTAMP`.
- All jsonb columns should have a NOT NULL DEFAULT '{}' or DEFAULT '[]' as appropriate — never allow null jsonb.

### Row-Level Security (RLS)
- Enable RLS on every new table.
- Default policy: `user_id = auth.uid()` for user-scoped tables.
- For shared/system tables (e.g., `market_data_points`), create appropriate read policies.
- Always test that RLS works by verifying queries succeed from the Supabase client (authenticated) and fail from raw SQL without role.

### Service Class Pattern
All backend business logic lives in service classes, never inline in API routes. Follow this structure:

```typescript
// File: lib/services/[service-name].service.ts

import { createClient } from '@/lib/supabase/server'  // or however the project creates server clients
import { type Database } from '@/types/supabase'

export class ExampleService {
  private supabase: ReturnType<typeof createClient>

  constructor(supabase?: ReturnType<typeof createClient>) {
    this.supabase = supabase ?? createClient()
  }

  async doSomething(params: DoSomethingInput): Promise<DoSomethingOutput> {
    // Implementation
  }
}
```

**Rules:**
- One service class per domain (NotificationService, ArtifactService, PortfolioAnalyticsService, etc.)
- Services accept a Supabase client in the constructor (for dependency injection in tests) but default to creating one
- Services throw typed errors (extend a base `AppError` class if one exists, or create one)
- Services never import Next.js request/response objects — they are framework-agnostic
- API routes are thin wrappers: parse input (Zod), call service, return response
- **Before creating a new service, check if an existing service covers that domain and extend it instead**

### API Route Pattern
All API routes follow this structure:

```typescript
// File: app/api/[resource]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ExampleService } from '@/lib/services/example.service'

const inputSchema = z.object({ /* ... */ })

export async function GET(request: NextRequest) {
  try {
    const params = inputSchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const service = new ExampleService()
    const result = await service.doSomething(params)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 })
    }
    // Match existing error handling pattern in the codebase
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Rules:**
- Zod validation on ALL inputs (query params, body, path params)
- Consistent error response shape: `{ error: string, details?: any }`
- Return appropriate HTTP status codes (200, 201, 400, 401, 404, 500)
- **Explore existing API routes first** to match any project-specific middleware, auth checks, or response patterns already in use

### Background Job Pattern
All scheduled/recurring jobs follow this structure:

```typescript
// File: lib/jobs/[job-name].job.ts

import { NotificationService } from '@/lib/services/notification.service'

export interface JobResult {
  success: boolean
  processed: number
  errors: string[]
  duration_ms: number
}

export class ExampleJob {
  private notificationService: NotificationService

  constructor() {
    this.notificationService = new NotificationService()
  }

  async execute(): Promise<JobResult> {
    const start = Date.now()
    const errors: string[] = []
    let processed = 0

    try {
      // Job logic here
      // On meaningful results, create notifications via NotificationService
      processed = /* count */
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }

    return {
      success: errors.length === 0,
      processed,
      errors,
      duration_ms: Date.now() - start,
    }
  }
}
```

**Rules:**
- Every job returns a `JobResult` with success/failure, items processed, errors, and duration
- Jobs are stateless — all state comes from the database
- Jobs use services for business logic, never query the DB directly with raw SQL
- Jobs write to the `automation_events` table (created in Phase 7, but the pattern should anticipate it — use a logging helper that writes to the table if it exists, logs to console if it doesn't)
- Jobs create notifications for user-relevant outcomes
- **Scheduling**: Explore the existing codebase for cron/scheduling patterns first. If `node-cron` or similar exists, use it. If not, create a `lib/jobs/scheduler.ts` that registers all jobs with their cron expressions, using `node-cron`. Expose a `POST /api/jobs/[job-name]/run` endpoint for manual triggering during development.
- **Idempotency**: Jobs must be safe to run multiple times. Use `last_run_at` tracking and deduplication logic to prevent double-processing.

### React Component Conventions
- **Data fetching**: Use the project's existing pattern (server components, SWR, React Query, or tRPC — explore first). If no clear pattern exists, use SWR for client-side data fetching with proper loading/error states.
- **State management**: For complex feature state (financial model, map layers, filters), use Zustand stores. For simple component state, use `useState`/`useReducer`. Explore for existing Zustand stores first.
- **File structure**: Components specific to a feature go in the feature's directory. Shared/reusable components go in `components/ui/` or wherever the project keeps them. Explore first.
- **Loading states**: Every async data display must show a skeleton or spinner while loading. Never show a blank area.
- **Empty states**: Every list/feed must have an empty state message with a call-to-action (e.g., "No notifications yet. Set up smart alerts to get started.").
- **Error states**: Every data-fetching component must handle errors gracefully with a retry option.
- **Realtime subscriptions**: For any data that should update in real-time (notifications, automation events), use Supabase Realtime channels. Clean up subscriptions in `useEffect` return.

### Supabase Realtime Pattern
```typescript
// Standard pattern for real-time subscriptions
useEffect(() => {
  const channel = supabase
    .channel('channel-name')
    .on('postgres_changes', {
      event: 'INSERT',  // or '*' for all events
      schema: 'public',
      table: 'table_name',
      filter: `user_id=eq.${userId}`,  // scope to current user
    }, (payload) => {
      // Handle the change
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [userId])
```

### Type Exports
- All shared types (database row types, API input/output types, enums) live in `types/` at the project root (or wherever the project keeps types — explore first)
- Generate Supabase types after each migration: `supabase gen types typescript --local > types/supabase.ts` (or the project's equivalent command)
- Zod schemas double as runtime validators AND type sources: `type Input = z.infer<typeof inputSchema>`
- Never define the same shape twice — if a Zod schema exists, derive the type from it

### Agent Tool Registration
When adding new tools to existing agents:
```typescript
// Explore existing agent tool definitions first:
// grep -r "tools\|toolDefinitions\|functions" --include="*.ts" packages/agents/
// Match whatever pattern they use. Example:
{
  name: "tool_name",
  description: "Clear description of what this tool does and WHEN to use it",
  parameters: {
    type: "object",
    properties: { /* fully typed */ },
    required: [ /* list required params */ ]
  },
  handler: async (params) => {
    const service = new RelevantService()
    return await service.relevantMethod(params)
  }
}
```
- Tool handlers call service classes, never contain business logic directly
- Tool descriptions must be specific enough that the LLM knows when to invoke them vs. similar tools
- Always add the new tool to the agent's system prompt if the prompt lists available tools

### Migration File Naming
```
YYYYMMDDHHMMSS_descriptive_name.sql
```
Example: `20260210120000_create_notifications_table.sql`

- One migration per logical change (a table and its indexes = one migration; two unrelated tables = two migrations)
- Always include a `-- down` section or separate down migration per project convention

### Commit Convention
```
feat(phase-N-capability): short description

- Detail 1
- Detail 2
```
Examples:
- `feat(phase-1a-notifications): create notifications table, service, and API routes`
- `feat(phase-1a-notifications): add NotificationBell component with realtime subscription`
- `feat(phase-1a-command-center): build command center page with daily briefing widget`

---

## CRITICAL RULES

1. **Explore before coding.** Before implementing ANY capability, run `find` and `grep` to understand the existing file structure, data models, API routes, agent definitions, and UI components relevant to that capability. Never duplicate what exists — extend it.
2. **Respect existing patterns.** Match the project's existing conventions for: API route structure, Supabase query patterns, agent tool registration, automation handler patterns, component styling (Tailwind + any design system in use), and error handling. The Shared Infrastructure section above provides defaults — but if the existing codebase does something differently, **match the codebase, not this document.**
3. **Database migrations first.** For any new tables or columns, create Supabase migration files in the established migration directory. Include `up` and `down` migrations. Never modify existing tables destructively.
4. **Type safety everywhere.** All new code must be fully typed TypeScript. No `any` types. Generate Zod schemas for API inputs. Export shared types from a central types location.
5. **Incremental commits.** After completing each sub-feature within a capability, commit with a descriptive message following conventional commits format above.
6. **Test critical paths.** Write integration tests for any new API routes and unit tests for financial calculation functions. Use the project's existing test framework.
7. **No stubbing.** Every feature must be functional, not placeholder. If a template says "TODO," fill it in. If a component renders mock data, wire it to real data.
8. **Shared Infrastructure first.** During Phase 1A, before building any features, establish the shared patterns: the `update_updated_at_column()` trigger function, the base error class, the job scheduler (if none exists), and verify the type generation pipeline works. All subsequent work builds on this foundation.

---

## PHASE 1: PROACTIVE DEAL INTELLIGENCE
**Priority: CRITICAL | Complexity: Medium | Value: Highest**
*This is the single biggest gap — transform the system from "tool you check" to "system that tells you what to do."*

### 1A: Unified Notification & Intelligence Feed

**Explore first:**
```bash
# Understand existing activity/event patterns
grep -r "ActivityTimeline" --include="*.tsx" --include="*.ts" -l
grep -r "automation" --include="*.ts" -l packages/ app/
find . -path "*/events*" -o -path "*/notifications*" | head -30
grep -r "realtime\|subscribe\|channel" --include="*.ts" -l
# Understand existing service/API patterns to match conventions
find . -path "*/services*" -name "*.ts" | head -20
find . -path "*/api*" -name "route.ts" | head -20
grep -r "class.*Service" --include="*.ts" -l | head -10
```

**Shared Infrastructure Setup (do this FIRST in Phase 1A before any feature work):**
1. Create `update_updated_at_column()` trigger function migration if it doesn't exist
2. Create base `AppError` class if it doesn't exist (check for existing error patterns first)
3. Create `lib/jobs/scheduler.ts` if no scheduling infrastructure exists
4. Verify Supabase type generation works and document the command in the project README
5. Create `lib/services/` directory if it doesn't exist (it likely does — explore first)

**Database:**
- Create `notifications` table: `id, user_id, deal_id (nullable), type (enum: alert|opportunity|deadline|system|market), title, body, metadata (jsonb DEFAULT '{}'), priority (low|medium|high|critical), read_at (nullable timestamp), created_at, updated_at, created_by, action_url (nullable), source_agent (nullable)`
- Create `notification_preferences` table: `id, user_id, type, channel (in_app|email|both), enabled (boolean DEFAULT true), threshold_config (jsonb DEFAULT '{}'), created_at, updated_at`
- Enable RLS on both tables. Policy: users can only read/write their own notifications and preferences.
- Add Supabase Realtime publication on the `notifications` table
- Add indexes: `notifications(user_id, read_at)`, `notifications(user_id, created_at DESC)`, `notifications(deal_id)` where deal_id is not null

**Service:**
- `NotificationService` class (following the Shared Infrastructure service pattern):
  - `create(notification: CreateNotificationInput): Promise<Notification>`
  - `createBatch(notifications: CreateNotificationInput[]): Promise<Notification[]>`
  - `getAll(userId: string, filters: NotificationFilters): Promise<PaginatedResult<Notification>>`
  - `getUnreadCount(userId: string): Promise<number>`
  - `markRead(id: string): Promise<void>`
  - `markAllRead(userId: string): Promise<void>`
  - `dismiss(id: string): Promise<void>`

**API Routes:**
- `GET /api/notifications` — paginated, filterable by type/priority/read status, sorted newest-first
- `PATCH /api/notifications/[id]` — mark read, dismiss, snooze
- `POST /api/notifications/mark-all-read`
- `GET /api/notifications/unread-count` — lightweight polling endpoint
- `GET /api/intelligence/daily-briefing` — aggregates overnight activity into a structured briefing (new parcels matching criteria, deals needing attention, completed automations, market changes)

**UI Components:**
- `NotificationBell` — header icon with unread badge count, uses Supabase Realtime subscription for live updates
- `NotificationFeed` — dropdown panel from bell, grouped by time (Today, Yesterday, This Week), each notification shows: icon by type, title, time-ago, deal link if applicable, action buttons (mark read, go to deal, dismiss)
- `CommandCenter` page at `/command-center` — full-page intelligence dashboard:
  - **Daily Briefing** card: auto-generated morning summary (new opportunities, overnight enrichments, approaching deadlines, market alerts)
  - **Needs Attention** section: deals with overdue tasks, stalled pipeline stages, approaching deadlines
  - **Recent Automation Activity** section: timeline of automation events with status (success/failed/pending)
  - **Pipeline Snapshot** widget: visual funnel of current deal stages with counts and velocity
- Add `/command-center` to main navigation as the **default landing page**

**Backend Services:**
- Integrate NotificationService into ALL existing automation handlers — every automation event that currently only logs should also create a notification
- `DailyBriefingService` — runs on cron (or on first login of the day), queries last 24h of activity, uses an LLM call to synthesize a natural-language briefing with actionable recommendations

### 1B: Smart Alerts & Opportunity Surfacing

**Explore first:**
```bash
grep -r "screener\|triage\|score" --include="*.ts" -l
grep -r "cron\|schedule\|interval" --include="*.ts" -l
cat packages/agents/screener* # or wherever screener agent lives
grep -r "threshold\|criteria\|filter" --include="*.ts" -l
```

**Database:**
- Create `saved_searches` table: `id, user_id, name, criteria (jsonb DEFAULT '{}' — zoning codes, min/max acreage, min/max price, parishes, property types, custom filters), alert_enabled (boolean DEFAULT false), alert_frequency (realtime|daily|weekly), last_run_at (nullable), match_count (integer DEFAULT 0), created_at, updated_at, created_by`
- Create `opportunity_matches` table: `id, saved_search_id, parcel_id, match_score (numeric), matched_criteria (jsonb DEFAULT '{}'), seen_at (nullable timestamp), dismissed_at (nullable timestamp), created_at, updated_at`
- RLS: user-scoped via saved_search ownership

**API Routes:**
- `CRUD /api/saved-searches` — full CRUD with validation
- `POST /api/saved-searches/[id]/run` — manually execute a search
- `GET /api/opportunities` — all unseen matches across all saved searches, sorted by score

**Background Job:**
- `OpportunityScannerJob` (following the Shared Infrastructure job pattern) — runs every 6 hours (configurable):
  1. Load all active saved searches where `alert_enabled = true`
  2. For each, query the property DB (560K parcels) against the criteria
  3. Diff against previous matches to find NEW matches only
  4. Score matches using the existing screener agent's scoring logic
  5. Create `opportunity_matches` records for new matches
  6. Create notifications for matches above the user's threshold
- Register in the job scheduler

**UI:**
- `SavedSearchBuilder` component — form to define search criteria: parish multi-select, zoning code multi-select, acreage range slider, price range slider, property type checkboxes, proximity-to-infrastructure options
- `OpportunityFeed` section on Command Center — cards showing new matches with: parcel address, key metrics (acreage, zoning, price), match score, "View Parcel" and "Create Deal" action buttons
- Quick-action: clicking "Create Deal" from an opportunity match should pre-populate deal creation with all known parcel data

### 1C: Deadline Tracking & Escalation

**Explore first:**
```bash
grep -r "dueAt\|deadline\|reminder" --include="*.ts" -l
grep -r "advancement\|reminderAfter" --include="*.ts" -l
grep -r "task" --include="*.ts" -l app/api/
```

**Implementation:**
- `DeadlineMonitorJob` (following the Shared Infrastructure job pattern) — runs hourly:
  1. Query all tasks with `dueAt` in the next 72 hours that haven't been completed
  2. Create tiered notifications: 72h warning (low priority), 24h warning (medium), overdue (high), 48h+ overdue (critical)
  3. Deduplicate: don't re-notify for the same deadline at the same tier
  4. For critical overdue items, create an escalation record
- Add deadline visualization to deal pages: a timeline bar showing all upcoming deadlines with color coding (green > 72h, yellow 24-72h, red < 24h, black overdue)
- Add a `Deadlines` widget to Command Center showing all upcoming deadlines across all deals, sorted by urgency

---

## PHASE 2: DELIVERABLE GENERATION
**Priority: CRITICAL | Complexity: Medium | Value: Highest**
*Tangible time savings — the system produces investor-ready documents, not just data.*

### 2A: PDF Generation Engine

**Explore first:**
```bash
find . -path "*/artifacts*" -type f | head -30
grep -r "artifact\|template\|pdf\|pptx" --include="*.ts" -l
cat packages/artifacts/ # explore existing artifact infrastructure
grep -r "TRIAGE_PDF\|SUBMISSION_CHECKLIST\|BUYER_TEASER" --include="*.ts" -l
```

**Infrastructure:**
- Install and configure a PDF generation library. Evaluate what's already in `package.json`. If nothing adequate exists, use `@react-pdf/renderer` for React-based PDF templates (allows component-based PDF design with Tailwind-like styling) or `puppeteer` for HTML-to-PDF conversion. Choose based on existing patterns.
- Create a `packages/artifacts/templates/` directory with subdirectories per artifact type
- Create `ArtifactService` (following Shared Infrastructure service pattern) with methods: `generate(type, dealId, options?)` → returns Buffer, `generateAndStore(type, dealId)` → stores in Supabase Storage, returns URL

**Templates to implement (all must pull REAL data from the deal, parcels, triage, enrichment, and agent analysis):**

1. **Triage Report PDF** (`TRIAGE_PDF`):
   - Header: GPC branding, deal name, date, confidentiality notice
   - Executive Summary: 2-3 sentence AI-generated summary of the opportunity
   - Property Overview: address, acreage, zoning, flood zone, aerial image if available
   - Triage Scorecard: visual score display with breakdown by category (zoning fit, financial viability, risk level, strategic alignment)
   - Key Risks: bullet list from risk agent analysis
   - Financial Snapshot: quick pro forma summary (acquisition cost, estimated NOI, projected cap rate, estimated IRR)
   - Recommended Next Steps: actionable items based on triage outcome
   - Appendix: raw enrichment data, source citations

2. **Investment Memo PDF** (`INVESTMENT_MEMO_PDF`):
   - New artifact type — add to the enum/type definitions
   - 8-12 pages covering: Executive Summary, Investment Thesis, Property Description, Market Analysis (comps, absorption, demographics), Financial Analysis (detailed pro forma, sensitivity tables, return metrics), Risk Assessment, Development/Business Plan, Deal Structure, Appendices
   - Every section pulls from existing agent tools and deal data — nothing hardcoded
   - Use LLM calls (via the appropriate agent) to generate narrative sections, passing in structured data as context

3. **Buyer Teaser PDF** (`BUYER_TEASER_PDF`):
   - 2-page marketing document: hero image/map, property highlights, key financial metrics, investment highlights, contact info
   - Designed for distribution to potential buyers/investors

4. **Offering Memorandum PDF** (`OFFERING_MEMO_PDF`):
   - New artifact type
   - Comprehensive marketing package: 15-25 pages, professionally formatted
   - Sections: Confidentiality Agreement, Executive Summary, Property Description, Location Analysis (with maps), Tenant/Income Analysis, Financial Analysis, Market Overview, Demographics, Appendices

5. **Comparative Analysis PDF** (`COMP_ANALYSIS_PDF`):
   - New artifact type
   - Side-by-side comparison of 2-5 parcels or deals
   - Table format: rows = metrics (acreage, price, zoning, flood risk, estimated returns, pros/cons), columns = properties
   - AI-generated recommendation paragraph at the bottom

### 2B: Agent-Triggered Generation

**Implementation:**
- Add a `generate_artifact` tool to the Finance agent, Legal agent, and a new general-purpose Deliverables agent:
  ```typescript
  {
    name: "generate_artifact",
    description: "Generate a professional document (PDF/PPTX) for a deal",
    parameters: {
      type: "object",
      properties: {
        artifact_type: { enum: ["TRIAGE_PDF", "INVESTMENT_MEMO_PDF", "BUYER_TEASER_PDF", "OFFERING_MEMO_PDF", "COMP_ANALYSIS_PDF"] },
        deal_id: { type: "string" },
        options: { type: "object", description: "Type-specific options like comparison_deal_ids for COMP_ANALYSIS_PDF" }
      }
    }
  }
  ```
- Tool handler calls `ArtifactService.generateAndStore()` — following the convention that tool handlers call services
- When a user says "generate an investment memo for this deal" in chat, the agent should invoke this tool, generate the PDF, store it, and return a download link
- Add auto-generation triggers to automation handlers:
  - On triage completion → auto-generate TRIAGE_PDF
  - On deal advancing to "Marketing" stage → auto-generate BUYER_TEASER_PDF
  - Create notifications for completed artifact generation with download links

### 2C: PPTX Generation

- Add `pptx` generation capability using `pptxgenjs` or similar
- Implement `HEARING_DECK_PPTX` template: Planning Commission presentation with site plan, zoning analysis, community impact, request summary
- Implement `IC_DECK_PPTX` (Investment Committee): deal overview, market context, financial projections, risk matrix, recommendation, vote request

---

## PHASE 3: INTERACTIVE FINANCIAL MODELING
**Priority: CRITICAL | Complexity: High | Value: High**
*Replace Excel dependency with live, interactive financial tools in the browser.*

### 3A: Interactive Pro Forma Builder

**Explore first:**
```bash
grep -r "calculationTools\|pro_forma\|proforma\|debt_sizing" --include="*.ts" -l
cat [path to calculationTools.ts]
grep -r "finance\|Finance" --include="*.ts" -l packages/agents/
```

**Implementation:**
- Create `/deals/[id]/financial-model` page
- Build `ProFormaBuilder` component:
  - **Assumptions Panel** (left sidebar): editable inputs grouped by category:
    - Acquisition: purchase price, closing costs %, earnest money
    - Income: rent/SF or rent/unit, vacancy rate %, rent growth rate %, other income
    - Expenses: opex/SF or opex ratio, management fee %, capex reserves, insurance, taxes
    - Financing: LTV %, interest rate, amortization period, IO period, loan fees
    - Exit: hold period (years), exit cap rate, disposition costs %
  - **Results Dashboard** (main area): auto-updating metrics displayed as cards:
    - Levered IRR, Unlevered IRR, Equity Multiple, Cash-on-Cash (Year 1), Net Profit
    - Acquisition basis table
    - Annual cash flow table (hold period rows × NOI/debt service/cash flow columns)
    - Exit analysis (sale price, loan payoff, net proceeds)
  - All calculations must use the EXISTING `calculationTools.ts` functions — do NOT rewrite financial math. Wrap them in React hooks that re-execute on input changes.
  - Use `useMemo` and `useCallback` aggressively to keep recalculations performant
  - Debounce input changes (300ms) before recalculating

- **State management:** Use Zustand store for the financial model state (per Shared Infrastructure conventions). Persist assumptions to the deal record in Supabase (new `financial_model_assumptions` jsonb column on deals, or a dedicated table if the assumptions structure is complex enough to warrant it).

### 3B: Sensitivity & Scenario Analysis

- `SensitivityTable` component: 2D data table showing returns across two variable axes
  - Default: Exit Cap Rate (columns) × Rent Growth (rows), cell values = IRR
  - Dropdown selectors for both axes (any numeric assumption can be an axis)
  - Color-coded cells: green (above target IRR), yellow (marginal), red (below threshold)
- `TornadoChart` component: horizontal bar chart showing which assumptions have the most impact on IRR
  - For each assumption, calculate IRR at ±10% and ±20% of base case
  - Sort by range width (most sensitive at top)
  - Use Recharts (already likely in the project) or Chart.js
- `ScenarioManager`: save/load named scenarios (Base Case, Downside, Upside, Stress)
  - Each scenario is a complete set of assumptions stored as jsonb
  - Side-by-side comparison view of up to 3 scenarios

### 3C: Waterfall Distribution Modeling

- `WaterfallBuilder` component for GP/LP structures:
  - Define tranches: preferred return %, catch-up %, promote tiers with hurdle rates
  - Input: total equity, GP co-invest %, LP equity, hold period cash flows (from pro forma)
  - Output: annual distribution table showing LP/GP splits, cumulative returns, promote triggers
  - Visual waterfall chart showing how distributions flow through tiers
- Store waterfall structures per deal in a `deal_waterfall_structures` table (following standard table columns)

### 3D: Debt Comparison Tool

- `DebtComparison` component: side-by-side comparison of up to 4 loan structures
  - Input per loan: type (fixed/floating), rate, spread (if floating), IO period, amortization, term, fees, prepayment penalty structure
  - Output: total interest cost, average annual debt service, effective rate, prepayment cost at various exit years
  - Highlight the optimal structure based on the deal's expected hold period

---

## PHASE 4: DOCUMENT INTELLIGENCE
**Priority: HIGH | Complexity: High | Value: High**

### 4A: Document Processing Pipeline

**Explore first:**
```bash
grep -r "upload\|FileUpload\|document" --include="*.tsx" --include="*.ts" -l
grep -r "classify\|classification\|docType" --include="*.ts" -l
grep -r "evidence\|extractText\|OCR" --include="*.ts" -l
```

**Infrastructure:**
- Create `DocumentProcessingService` (following Shared Infrastructure service pattern):
  1. On file upload, classify document type (PSA, Phase I ESA, title commitment, survey, zoning letter, appraisal, lease, LOI, other) — use existing classification logic + enhance with LLM classification
  2. Extract text: PDF → use `pdf-parse` or `pdfjs-dist`; scanned PDFs → use Tesseract.js or call an OCR API; images → same OCR path
  3. Once text extracted, route to type-specific extraction agent
  4. Store extracted data as structured JSON in a `document_extractions` table: `id, document_id, deal_id, doc_type, extracted_data (jsonb DEFAULT '{}'), confidence (numeric), extracted_at (timestamptz), reviewed (boolean DEFAULT false), reviewed_by (nullable UUID), reviewed_at (nullable timestamptz), created_at, updated_at, created_by`
  5. Auto-populate deal fields from extracted data (with confidence thresholds — high confidence > 0.85 auto-fills, low confidence creates a review notification via NotificationService)

### 4B: Type-Specific Extractors

For each document type, create an extraction prompt that uses an LLM call with the document text and returns structured JSON:

1. **PSA Extractor**: purchase_price, earnest_money, due_diligence_period_days, dd_start_date, closing_date, contingencies[], seller_representations[], special_provisions[], buyer_entity, seller_entity
2. **Phase I ESA Extractor**: recs[], de_minimis_conditions[], historical_uses[], adjoining_property_concerns[], recommended_phase_ii (boolean), phase_ii_scope
3. **Title Commitment Extractor**: commitment_date, policy_amount, requirements[], exceptions[], easements[], liens[], encumbrances[]
4. **Survey Extractor**: total_acreage, dimensions, flood_zone, flood_zone_panel, easement_locations[], utility_locations[], setbacks{front, side, rear}, encroachments[]
5. **Zoning Letter Extractor**: current_zoning, permitted_uses[], conditional_uses[], dimensional_standards{max_height, lot_coverage, far, setbacks}, variance_required (boolean), overlay_districts[]
6. **Lease Extractor**: tenant_name, lease_type (NNN/gross/modified_gross), term_years, start_date, expiration_date, base_rent, escalation_structure, renewal_options[], tenant_improvements, expense_stops

**UI:**
- `DocumentExtractionReview` component: shows extracted fields side-by-side with the original document, allows user to correct/confirm each field
- On confirmation, extracted data flows into deal fields and enrichment records
- Badge on deal page showing "3 documents pending review"

---

## PHASE 5: SPATIAL ANALYSIS & RICH MAPPING
**Priority: HIGH | Complexity: Medium | Value: High**

### 5A: Enhanced Map Rendering

**Explore first:**
```bash
grep -r "leaflet\|mapbox\|Map\|map" --include="*.tsx" -l
grep -r "GeoJSON\|geometry\|polygon\|parcel_geometry" --include="*.ts" -l
grep -r "rpc_get_parcel_geometry\|rpc_zoning_lookup" --include="*.ts" -l
```

**Implementation:**
- Upgrade map components to render GeoJSON polygons from `rpc_get_parcel_geometry`, not just point markers
- Add layer control (Leaflet.Control.Layers or equivalent) with toggleable layers:
  - **Parcel Boundaries** — polygons colored by status (available, under contract, owned, pipeline deal)
  - **Zoning Overlay** — color-coded polygons by zoning category (industrial = purple, commercial = blue, residential = green, mixed = orange). Pull from `rpc_zoning_lookup` data
  - **Flood Zones** — overlay FEMA flood zone data. Color: Zone A = red, Zone AE = orange, Zone X = transparent. Pull from existing flood screening data per parcel
  - **Satellite/Aerial** — add satellite tile layer option (use ESRI World Imagery tiles: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` — free, no API key required)

### 5B: Analytical Map Tools

- **Measurement Tool**: click-to-measure distance and area on the map. Use Leaflet.Draw or similar
- **Comp Sale Map**: render `search_comparable_sales` results as map markers with price/SF labels. Color code by recency (last 6mo, 6-12mo, 12-24mo)
- **Heatmap Layer**: property price heatmap using `leaflet.heat` or similar. Aggregate parcel assessed values or sale prices into a heat intensity layer
- **Drive-Time / Isochrone**: integrate with a free routing API (OSRM or OpenRouteService) to show "everything within X minutes of this point." Render as a polygon overlay

### 5C: Prospecting Mode

- `ProspectingMap` page or mode:
  - User draws a polygon on the map (Leaflet.Draw)
  - System queries the property DB for all parcels with centroids inside the polygon
  - Filters panel: zoning codes, acreage range, assessed value range, flood zone exclusion
  - Results table below the map with sortable columns
  - Bulk actions: "Create deals from selected parcels", "Run batch triage on selected"
  - Save prospecting polygons as named search areas (store in `saved_searches` table from Phase 1B, extending the criteria jsonb to support polygon geometry)

---

## PHASE 6: CROSS-DEAL PORTFOLIO REASONING
**Priority: HIGH | Complexity: High | Value: High**

### 6A: Portfolio Analytics Engine

**Explore first:**
```bash
grep -r "portfolio" --include="*.tsx" --include="*.ts" -l
cat app/**/portfolio*
grep -r "aggregate\|rollup\|summary" --include="*.ts" -l
```

**Implementation:**
- Create `PortfolioAnalyticsService` (following Shared Infrastructure service pattern):
  - `getPortfolioSummary()`: total AUM, total equity deployed, weighted avg IRR, weighted avg cap rate, total SF/units/acres by SKU
  - `getConcentrationAnalysis()`: geographic (parish-level), SKU, vintage year, risk tier distributions with pie/bar charts
  - `getCapitalAllocation(availableEquity, maxDeals?)`: ranks pipeline deals by risk-adjusted return, suggests optimal allocation. Uses existing finance tools per deal + portfolio-level constraints
  - `get1031Matches(dispositionDealId)`: finds acquisition candidates in the pipeline that match 1031 timing requirements (45-day ID, 180-day close) and value ranges
  - `getPortfolioStressTest(scenario)`: re-runs pro formas for all active deals with modified assumptions (rate shock, vacancy spike, rent decline) and shows portfolio-level impact

**API Routes:**
- `GET /api/portfolio/analytics` — full portfolio summary
- `GET /api/portfolio/concentration` — concentration analysis
- `POST /api/portfolio/optimize` — capital allocation optimization
- `GET /api/portfolio/1031-matches/[dealId]` — 1031 exchange candidates
- `POST /api/portfolio/stress-test` — portfolio stress testing

**UI:**
- Enhance existing `/portfolio` page with:
  - Concentration risk charts (geographic, SKU, risk tier)
  - Capital allocation recommendation widget
  - 1031 exchange matcher (select a disposition deal → see matching acquisitions)
  - Portfolio stress test panel (select scenario → see impact across all deals)
- Add portfolio-level agent tool: `analyze_portfolio` that the Finance agent can call when asked portfolio questions. Tool handler calls `PortfolioAnalyticsService`.

---

## PHASE 7: WORKFLOW VISIBILITY
**Priority: HIGH | Complexity: Medium | Value: Medium**

### 7A: Automation Dashboard

**Explore first:**
```bash
grep -r "automation\|handler\|event" --include="*.ts" -l packages/
grep -r "runs\|AgentRun" --include="*.ts" -l
find . -path "*/workflows*" -type f | head -20
```

**Implementation:**
- Create `automation_events` table: `id, deal_id (nullable), handler_name, event_type, status (pending|running|completed|failed), input_data (jsonb DEFAULT '{}'), output_data (jsonb DEFAULT '{}'), error (text nullable), started_at (timestamptz), completed_at (nullable timestamptz), duration_ms (integer nullable), created_at, updated_at`
- Enable Realtime on this table
- Instrument ALL existing automation handlers to write to this table on start, completion, and failure. Create an `AutomationEventService` that wraps this:
  ```typescript
  const event = await automationEventService.start('enrichment', dealId, inputData)
  try {
    const result = await doWork()
    await automationEventService.complete(event.id, result)
  } catch (error) {
    await automationEventService.fail(event.id, error)
  }
  ```
- **Retroactively update all background jobs** (from Phase 1 and beyond) to use this service if they weren't already writing to `automation_events`
- Create `/automation` page:
  - **Live Feed**: real-time stream of automation events (use Supabase Realtime)
  - **Stats Bar**: total runs today, success rate, avg duration, failures requiring attention
  - **Handler Health**: table of all 12+ handlers showing last run time, success rate (7d), avg duration, status (healthy/degraded/failing)
  - **Failed Events**: filterable list of failures with error messages, retry button, "ignore" button
- **Deal-Level Automation Timeline**: on each deal page, add a collapsible timeline showing all automation events for that deal in chronological order, with status icons and expandable details

### 7B: Approval Workflows

**Explore first:**
```bash
grep -r "gates\|approval\|transition" --include="*.ts" -l
```

- Create `approval_requests` table: `id, deal_id, requested_by (UUID), stage_from, stage_to, status (pending|approved|rejected|changes_requested), reviewer_notes (text nullable), decided_by (nullable UUID), decided_at (nullable timestamptz), created_at, updated_at, created_by`
- Create `ApprovalService` following Shared Infrastructure pattern
- Create approval UI: when a deal tries to advance past a gate, show an approval request card with: deal summary, proposed transition, supporting data, approve/reject/request changes buttons
- Add approval request notifications via NotificationService
- Show pending approvals on Command Center

---

## PHASE 8: CONTINUOUS MARKET INTELLIGENCE
**Priority: MEDIUM | Complexity: High | Value: High**

### 8A: Automated Market Monitoring

**Explore first:**
```bash
grep -r "market\|comp\|comparable" --include="*.ts" -l packages/agents/
grep -r "evidence\|cron\|schedule" --include="*.ts" -l
```

**Implementation:**
- Create `market_data_points` table: `id, parish, data_type (comp_sale|listing|permit|vacancy|rent), source, data (jsonb DEFAULT '{}'), observed_at (timestamptz), created_at, updated_at`
- RLS: read access for all authenticated users (this is shared market data)
- Create `MarketMonitorJob` (following Shared Infrastructure job pattern) — runs daily:
  1. For each active parish in the user's deals/saved searches, scrape or API-query for:
     - New property listings (web search for parish assessor recent transfers)
     - Building permits filed (parish permit database if accessible)
  2. Store as `market_data_points`
  3. Compare against existing deal underwriting assumptions — if a comp sale invalidates a cap rate assumption, create a high-priority notification via NotificationService
  4. Generate weekly market digest notification

**UI:**
- `MarketIntelligence` page at `/market`:
  - Parish-level market dashboard: recent sales, active listings, permit activity
  - Comp sale tracker per deal: table + map of relevant comps with trend indicators
  - Market trends charts: time-series of price/SF, cap rates, days-on-market by parish/SKU (as data accumulates)

---

## PHASE 9: INSTITUTIONAL LEARNING
**Priority: MEDIUM | Complexity: High | Value: Highest Long-Term**

### 9A: Outcome Tracking

**Database:**
- Create `deal_outcomes` table: `id, deal_id (UNIQUE), actual_purchase_price (numeric nullable), actual_noi_year1 (numeric nullable), actual_exit_price (numeric nullable), actual_irr (numeric nullable), actual_equity_multiple (numeric nullable), actual_hold_period_months (integer nullable), exit_date (date nullable), exit_type (sale|refinance|1031|other nullable), kill_reason (text nullable), kill_was_correct (boolean nullable — retrospective assessment), notes (text nullable), created_at, updated_at, created_by`
- Create `assumption_actuals` table: `id, deal_id, assumption_name, projected_value (numeric), actual_value (numeric nullable), variance_pct (numeric nullable — computed), recorded_at (timestamptz), created_at, updated_at`

**Implementation:**
- When a deal moves to EXITED, prompt user to enter actual performance metrics (notification + modal on deal page)
- `OutcomeAnalysisService` (following Shared Infrastructure pattern):
  - Compare projected vs. actual across all exited deals
  - Calculate systematic biases: "You consistently overestimate rent growth by 1.2% and underestimate construction costs by 8%"
  - Feed bias corrections back into default assumptions for new pro formas (stored in a `default_assumptions` table or config)
- Triage calibration: track which triage tier (A/B/C/D) deals actually ended up in by outcome, show calibration chart on `/portfolio` page
- Add `get_historical_accuracy` tool to Finance agent so it can reference actual bias data when building new pro formas

### 9B: Knowledge Base & RAG

**Explore first:**
```bash
grep -r "vector\|embedding\|rag\|retrieval" --include="*.ts" -l
grep -r "pgvector\|similarity" --include="*.sql" --include="*.ts" -l
```

**Implementation:**
- Enable `pgvector` extension in Supabase if not already enabled
- Create `knowledge_embeddings` table: `id, content_type (deal_memo|agent_analysis|document_extraction|market_report|user_note), source_id (text — polymorphic reference), content_text (text), embedding vector(1536), metadata (jsonb DEFAULT '{}'), created_at, updated_at`
- Index: `CREATE INDEX ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`
- `KnowledgeIngestionService`:
  - On deal advancement/completion, embed the deal's analysis, memos, and extracted document data
  - On agent run completion (important runs), embed the conversation and key findings
  - Use OpenAI `text-embedding-3-small` or the project's existing embedding model
  - Chunk long documents into ~500 token segments with overlap
- Add `search_knowledge_base` tool to ALL agents (following agent tool registration conventions):
  ```typescript
  {
    name: "search_knowledge_base",
    description: "Search the firm's historical knowledge base for relevant past deals, analyses, and learnings. Use this when analyzing a new deal to find patterns from similar past deals.",
    parameters: {
      query: { type: "string", description: "Natural language search query" },
      content_types: { type: "array", items: { enum: ["deal_memo", "agent_analysis", "document_extraction", "market_report", "user_note"] }, description: "Optional filter by content type" },
      limit: { type: "number", default: 5 }
    }
  }
  ```
- This gives agents the ability to say "Based on 3 similar deals we've analyzed, the typical entitlement timeline in this parish is 6 months, not the stated 4 months"

---

## EXECUTION SEQUENCE

Complete each phase fully before moving to the next. Within each phase, work sub-sections in order (A, B, C, D).

**Check CLAUDE.md for the currently active phase. Only work on that phase unless explicitly instructed otherwise.**

After completing each sub-phase (e.g., 1A, 1B, 1C):
1. Run the full test suite and fix any failures
2. Verify all new API routes return correct data
3. Verify all new UI components render correctly with real data
4. Verify all new background jobs execute successfully
5. Regenerate Supabase types if any migrations were added
6. Commit with a sub-phase summary message

After completing each full phase (e.g., all of Phase 1):
1. All of the above, plus:
2. Create a brief CHANGELOG entry noting what was added
3. Verify no regressions in existing functionality
4. Report completion and await instruction to proceed to the next phase

**Start by reading CLAUDE.md for the currently active phase. Explore the codebase first. Then build.**

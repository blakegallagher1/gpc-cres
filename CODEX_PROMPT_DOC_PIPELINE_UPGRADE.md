# Codex Prompt: Document Processing Pipeline Upgrade

## Role

You are a senior full-stack TypeScript engineer upgrading the document processing pipeline in a Next.js 16 / Prisma / Supabase monorepo ("Entitlement OS") for a commercial real estate firm. The codebase uses pnpm workspaces, strict TypeScript, and deploys to Vercel.

## Context

The system processes CRE deal documents (PSAs, Phase I ESAs, appraisals, leases, surveys, zoning letters, title commitments, financing commitments, LOIs). The current pipeline lives primarily in `apps/web/lib/services/documentProcessing.service.ts` with supporting types in `apps/web/lib/validation/extractionSchemas.ts`, event-driven automation in `apps/web/lib/automation/documents.ts`, and a review UI in `apps/web/components/deals/DocumentExtractionReview.tsx`.

### Current Pipeline (What You're Replacing/Upgrading)

1. **Text extraction:** `unpdf` library — `extractText(buffer, { mergePages: true })` strips all layout, collapses tables into flat strings. Zero OCR capability. Scanned PDFs detected via heuristic (`< 100 chars/page`) but no fallback — processing continues with whatever garbled text was recovered.
2. **Classification:** 25+ regex rules against filenames (`ENHANCED_CLASSIFICATION_RULES` array), then falls back to `gpt-5-mini` LLM classification on first 3,000 chars when regex confidence < 0.85 or type = "other".
3. **Extraction:** `gpt-5-mini` with `temperature: 0` on first 12,000 chars of flat text. Per-doc-type prompts in `EXTRACTION_PROMPTS` record (10 types). Returns JSON validated against Zod schemas in `extractionSchemas.ts`.
4. **Storage:** `DocumentExtraction` Prisma model stores `extractedData` (JSONB), `rawText` (full text), `confidence` (Decimal 4,3), `docType`, review status. One extraction per upload (unique constraint on `uploadId`).
5. **Auto-fill:** High-confidence extractions (≥ 0.85) auto-populate deal/parcel fields. Lower confidence creates review notifications.
6. **Review UI:** `DocumentExtractionReview.tsx` shows field-by-field editable extraction with confidence badges. No source-text highlighting or page citations.

### Problems This Upgrade Solves

- **Scanned PDFs are dead ends.** Old deeds, wet-signed PSAs, legacy Phase I ESAs — common in CRE — return empty or garbled text.
- **Table extraction is destroyed.** Rent rolls, appraisal comp grids, and survey tables lose all spatial structure when `unpdf` merges pages into flat text. The LLM hallucinates or misreads data.
- **Classification is brittle.** Files named `Scan_00124.pdf` or `Document_Final_v3.pdf` default to "other" at 0.3 confidence. Regex can't help.
- **One model for all extraction is suboptimal.** A 2-page zoning letter and a 150-page appraisal both get `gpt-5-mini` with 12K char truncation. Complex docs need a frontier model; simple docs are fine with mini.
- **No source citations.** Reviewers see extracted values but can't verify where in the document they came from. Review is slow and error-prone.

---

## Upgrade Specification — Three Changes, In Order

### Upgrade 1: Replace `unpdf` with Google Document AI for Layout-Aware Parsing + OCR

**What:** Replace the `extractTextFromPdf()` function and its `unpdf` dependency with [Google Document AI](https://cloud.google.com/document-ai). Document AI provides layout-aware parsing with native OCR, table detection, and structured output — all via a REST API that works perfectly on Vercel serverless.

**Requirements:**

- Integrate Google Document AI's **Layout Parser** processor via the `@google-cloud/documentai` npm package (or direct REST calls to `https://documentai.googleapis.com/v1/...`). Use the Layout Parser processor type — it handles OCR, table extraction, and structural analysis in a single call.
- **Auth:** Use a GCP service account JSON key stored as a Vercel environment variable (`GOOGLE_DOCUMENT_AI_CREDENTIALS` — JSON string) and `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` for the processor resource name. Add these to the env var documentation in CLAUDE.md.
- Convert Document AI's response (which includes pages, paragraphs, tables, and bounding boxes) into structured Markdown output. Tables must render as Markdown tables. Headings must be `#`/`##`/`###`. Lists must be `-` items.
- **Do NOT use Docling** — it's Python-native and can't run on Vercel serverless. Do NOT create Python sidecar scripts. Google Document AI is the sole parser.
- The output format must be **Markdown** (not flat text). Tables must render as Markdown tables. Headings must be `#`/`##`/`###`. Lists must be `-` items.
- Replace the current `extractTextFromPdf(buffer: Buffer): Promise<string>` with a new function `parseDocumentToMarkdown(buffer: Buffer, filename: string): Promise<DocumentParseResult>` where:

```typescript
type DocumentParseResult = {
  markdown: string;           // Full document as structured Markdown
  pageCount: number;          // Total pages detected
  pages: PageContent[];       // Per-page content for citation support (Upgrade 3)
  isScanned: boolean;         // Whether OCR was required
  tableCount: number;         // Number of tables detected
  parseMethod: 'google-document-ai' | 'unpdf-fallback';
};

type PageContent = {
  pageNumber: number;
  markdown: string;           // This page's Markdown content
  charOffset: number;         // Character offset in the full markdown string
};
```

- Keep `unpdf` as a fallback if Google Document AI is unreachable or returns an error (wrap in try/catch, log the fallback).
- Delete the `isScannedPdf()` heuristic — Google Document AI handles scanned docs natively via built-in OCR.
- Update the `rawText` field stored in `DocumentExtraction` to contain Markdown instead of flat text. No schema migration needed (it's already a Text column), but add a new boolean column `parsedAsMarkdown` to the `DocumentExtraction` model so downstream code knows the format.
- Add Word document (.docx) support — Google Document AI supports DOCX processing natively.

**Files to modify:**
- `apps/web/lib/services/documentProcessing.service.ts` — replace `extractTextFromPdf`, update `processUpload` to use new parser
- `packages/db/prisma/schema.prisma` — add `parsedAsMarkdown Boolean @default(false)` to `DocumentExtraction`
- `apps/web/package.json` — add `@google-cloud/documentai` dependency, keep `unpdf` as fallback
- Create `apps/web/lib/services/documentParser.ts` — new module wrapping Google Document AI client with Markdown conversion logic
- `apps/web/.env.local` — add `GOOGLE_DOCUMENT_AI_CREDENTIALS` and `GOOGLE_DOCUMENT_AI_PROCESSOR_ID`

**Constraints:**
- Must work on Vercel serverless (no Docker, no Python, no long-running processes > 60s for Hobby, 300s for Pro)
- Google Document AI is the sole parser — do not evaluate or implement alternatives (no Docling, no Azure Document Intelligence)
- Total parse time budget: < 30 seconds for a 50-page PDF (Document AI typically returns in 5-15s)
- Preserve the fire-and-forget async pattern — parsing happens after the upload API responds

---

### Upgrade 2: Smart Model Routing for Classification and Extraction

**What:** Replace the single `gpt-5-mini` for both classification and extraction with a routing layer that picks the right model based on document complexity.

**Requirements:**

- **Classification stays on `gpt-5-mini`** — it's fast and cheap. But change the input: instead of first 3,000 chars of flat text, send the first 3 pages of Markdown (from `DocumentParseResult.pages[0..2]`). This gives the classifier table structure and headings, dramatically improving accuracy on generically-named files.
- **Remove regex as the primary classifier.** Invert the current logic: LLM classifies first (always, on all documents with ≥ 50 chars of content), then regex acts as a confidence boost/validation. If LLM and regex agree, boost confidence by 0.05 (cap at 0.98). If they disagree, use whichever has higher confidence but flag for review.
- **Add a complexity scorer** that runs after classification:

```typescript
type DocumentComplexity = 'simple' | 'moderate' | 'complex';

function assessComplexity(parseResult: DocumentParseResult, docType: DocType): DocumentComplexity {
  // simple: < 5 pages, 0 tables, non-table doc types (zoning_letter, loi)
  // moderate: 5-30 pages, or 1-3 tables, or doc types like lease, financing_commitment
  // complex: > 30 pages, or > 3 tables, or doc types like appraisal, psa, phase_i_esa
}
```

- **Route extraction to two model tiers** (not three — a middle tier adds billing complexity without meaningful accuracy gain):
  - `simple` + `moderate` → `gpt-5-mini` (cost-efficient, handles straightforward and mid-complexity docs well)
  - `complex` → `gpt-5.2` (frontier model for dense docs — matches our agent coordinator model; necessary for 100+ page appraisals, multi-table rent rolls, dense PSAs)
- **Increase the text window for extraction based on complexity:**
  - `simple`: first 12K chars of Markdown (current)
  - `moderate`: first 30K chars of Markdown (same model, bigger window)
  - `complex`: first 60K chars of Markdown (gpt-5.2 handles 200K+ context)
- **For complex documents with tables**, use a two-pass extraction strategy:
  1. First pass: Extract table data separately by sending each Markdown table to the LLM with a focused prompt ("Extract the rent roll entries from this table")
  2. Second pass: Extract narrative fields from the non-table Markdown
  3. Merge results

- Update the `EXTRACTION_PROMPTS` to instruct the LLM that the input is **Markdown** (not flat text) and that tables are formatted as Markdown tables.

**Files to modify:**
- `apps/web/lib/services/documentProcessing.service.ts` — add `assessComplexity()`, update `classifyWithLLM()` input, update `extractStructuredData()` with model routing
- `apps/web/lib/automation/config.ts` — add model routing config to `AUTOMATION_CONFIG.documents`

**Constraints:**
- Keep `gpt-5-mini` as the default/fallback if model routing logic fails
- Log the model used and complexity assessment for every extraction (for cost monitoring)
- Don't change the Zod validation schemas — output format stays identical
- Don't change the auto-fill logic — it consumes the same `extractedData` shape

---

### Upgrade 3: Page-Level Citations for Human Review

**What:** Add source citations (page number + text snippet) to every extracted field so the review UI can show reviewers exactly where each value came from.

**Requirements:**

- **Extend the extraction prompt** to return citations alongside each field. For every extracted value, the LLM should also return:

```typescript
type FieldCitation = {
  page: number;              // 1-indexed page number where the value was found
  snippet: string;           // 20-80 char verbatim snippet from the source text surrounding the value
  confidence: number;        // Field-level confidence (0.0-1.0)
};
```

- **New JSON output format from extraction LLM** (example for PSA):

```json
{
  "purchase_price": { "value": 2500000, "citation": { "page": 3, "snippet": "...purchase price of Two Million Five Hundred Thousand Dollars ($2,500,000.00)...", "confidence": 0.95 } },
  "earnest_money": { "value": 50000, "citation": { "page": 3, "snippet": "...earnest money deposit of $50,000...", "confidence": 0.92 } },
  "closing_date": { "value": "2026-04-15", "citation": { "page": 7, "snippet": "...closing shall occur on or before April 15, 2026...", "confidence": 0.88 } }
}
```

- **Store citations in a new JSONB column** on `DocumentExtraction`:
  - Add `fieldCitations Json? @default("{}") @map("field_citations") @db.JsonB` to the Prisma schema
  - This keeps `extractedData` in its current flat format (no breaking change to auto-fill, validation, or API consumers)
  - `fieldCitations` maps field names to `FieldCitation` objects

- **Update extraction logic** in `extractStructuredData()`:
  1. Send page-segmented Markdown (from `DocumentParseResult.pages`) so the LLM knows page boundaries
  2. Add citation instructions to every `EXTRACTION_PROMPTS` entry
  3. Parse the enriched response, split into `extractedData` (flat values) and `fieldCitations` (citation metadata)
  4. Validate `extractedData` against existing Zod schemas (unchanged)
  5. Store both columns

- **Update the review UI** (`DocumentExtractionReview.tsx`):
  - For each field, show a small "Page X" badge next to the value
  - On click/hover, show the citation snippet in a tooltip or expandable panel
  - If the raw Markdown is available, highlight the snippet in context
  - Show field-level confidence as a colored dot (green ≥ 0.85, yellow 0.6-0.84, red < 0.6)

- **Update the API responses:**
  - Add `fieldCitations` to `DocumentExtractionResponse` type
  - Include in GET `/api/deals/[id]/extractions` and GET `/api/deals/[id]/extractions/[extractionId]`
  - The PATCH endpoint should accept `fieldCitations` updates (for manual corrections)

**Files to modify:**
- `packages/db/prisma/schema.prisma` — add `fieldCitations` and `parsedAsMarkdown` columns
- `apps/web/lib/services/documentProcessing.service.ts` — update extraction prompts, parse citations, store both columns
- `apps/web/lib/validation/extractionSchemas.ts` — add `FieldCitation` Zod schema (for API validation, not for extraction output validation)
- `apps/web/components/deals/DocumentExtractionReview.tsx` — add citation display
- `apps/web/app/api/deals/[id]/extractions/route.ts` — include `fieldCitations` in response
- `apps/web/app/api/deals/[id]/extractions/[extractionId]/route.ts` — include and accept `fieldCitations`
- `apps/web/types/index.ts` — add `FieldCitation` type

**Constraints:**
- Citation snippets must be verbatim from the source Markdown (not LLM-generated paraphrases)
- If the LLM can't provide a citation for a field, `citation` should be `null` — don't block extraction
- Keep field-level confidence separate from document-level confidence
- The review UI changes should be additive — don't break existing field editing functionality

---

## Implementation Order

Execute these upgrades **sequentially** — each builds on the previous:

1. **Upgrade 1** (Google Document AI Parser) — creates `DocumentParseResult` with page-level Markdown that Upgrades 2 and 3 depend on
2. **Upgrade 2** (Model Routing) — uses structured Markdown from Upgrade 1 for better classification and extraction
3. **Upgrade 3** (Citations) — uses page-segmented Markdown from Upgrade 1 and the enriched extraction flow from Upgrade 2

## Database Migration

Create a single Prisma migration for all schema changes:

```prisma
// Add to DocumentExtraction model:
parsedAsMarkdown  Boolean  @default(false) @map("parsed_as_markdown")
fieldCitations    Json?    @default("{}") @map("field_citations") @db.JsonB
```

Run: `pnpm --filter @entitlement-os/db db:migrate` (generates migration SQL)

## Testing Requirements

- Update existing tests in `apps/web/lib/services/__tests__/` and `apps/web/lib/automation/__tests__/documents.test.ts` (Jest, not Vitest)
- Mock the Google Document AI client in tests (don't require actual API calls in CI)
- Add tests for:
  - Scanned PDF → Google Document AI OCR → Markdown → successful extraction
  - Complex document → routes to frontier model
  - Citation parsing and storage
  - Fallback to `unpdf` when primary parser fails
  - Complexity scoring logic

## Key Codebase Rules (From CLAUDE.md)

- Use `.nullable()` not `.optional()` for Zod tool parameters
- Use plain `z.string()` — never `z.string().url()` or `z.string().email()`
- Force-add `apps/web/lib/` files to git (root `.gitignore` has `lib/` pattern)
- Scope all DB queries with `orgId` for multi-tenant isolation
- Use fire-and-forget `.catch(() => {})` for event dispatch — never block API responses
- Use `import "server-only"` in any module that touches API keys
- Don't use Chat Completions API — use OpenAI Responses API (note: current code uses Chat Completions for document processing; this is the one exception, keep it as-is since it works and uses `response_format: { type: "json_object" }`)
- TypeScript strict mode. No `any`. Use `Record<string, unknown>` for dynamic objects.
- Tests use Jest with `jest.mock()`/`jest.requireMock()` pattern for Prisma mocking

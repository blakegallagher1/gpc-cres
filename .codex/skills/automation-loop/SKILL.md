---
name: automation-loop
description: Scaffold a new automation loop with handler, config, test, and ROADMAP entry
triggers:
  - "new automation"
  - "add automation loop"
  - "create loop"
  - "scaffold handler"
---

# Automation Loop Skill

Scaffold a complete automation loop following the Entitlement OS pattern:
handler + config + test + ROADMAP entry.

## Current Automation Loops (Reference)

The system has 12 existing loops — new loops must follow the same patterns:
- Parcel Ingestion, Flood Zone Overlay, Zoning Overlay
- Comp Pull, Valuation, Feasibility Scoring
- Due Diligence, Offer Generation, Portfolio Monitoring
- Evidence Fetch, Artifact Generation, Notification Dispatch

## Scaffold Workflow

When creating a new automation loop named `<loop-name>`:

### 1. Handler File
Create `apps/web/app/api/automation/<loop-name>/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { prisma } from "@entitlement-os/db";

// Input schema — strict validation
const InputSchema = z.object({
  org_id: z.string().uuid(),
  // ... loop-specific fields
}).strict();

export async function POST(req: Request) {
  const auth = await resolveAuth(req as NextRequest);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = auth.orgId;

  // Validate input
  const body = InputSchema.parse(await req.json());

  // Optional defensive scoping if body carries org_id
  if (body.org_id && body.org_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Example scoped ORM access
  const alreadyRun = await prisma.someTable.findFirst({
    where: { orgId },
  });
  void alreadyRun;

  // Idempotency check
  // ... check if this loop already ran for this input

  // Execute loop logic
  // ... implementation

  return NextResponse.json({ success: true });
}
```

### 2. Config Entry
Add to the automation config (if one exists) or document in ROADMAP:
- Loop name, trigger conditions, retry policy
- Cost ceiling (if AI calls involved)
- Idempotency key definition

### 3. Test File
Create `apps/web/app/api/automation/<loop-name>/route.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

describe("<loop-name> automation", () => {
  it("rejects unauthenticated requests", async () => { /* ... */ });
  it("rejects org-scoped mismatch requests", async () => { /* ... */ });
  it("validates input schema", async () => { /* ... */ });
  it("enforces idempotency", async () => { /* ... */ });
  it("executes loop logic correctly", async () => { /* ... */ });
});
```

### 4. ROADMAP Entry
Add to `ROADMAP.md`:
```markdown
- [ ] `<loop-name>` automation loop
  - Handler: `apps/web/app/api/automation/<loop-name>/route.ts`
  - Tests: written and passing
  - Auth: session + org_id scoped
  - Idempotent: yes (keyed on ...)
```

## Verification

After scaffolding, run the full MVP:
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Rules

- Every loop MUST have auth + org_id scoping
- Every loop MUST be idempotent
- Every loop MUST have at least 5 tests (auth, org, schema, idempotency, happy path)
- Every loop with AI calls MUST have cost ceilings
- Never create a loop without a ROADMAP entry

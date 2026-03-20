---
name: auth-pattern
description: Enforce consistent NextAuth + resolveAuth middleware across all API routes
triggers:
  - "auth pattern"
  - "fix auth"
  - "auth middleware"
  - "security audit"
---

# Auth Pattern Skill

Ensure every API route in Entitlement OS follows the canonical authentication
and authorization pattern.

## Canonical Pattern

Every `app/api/**/route.ts` handler MUST follow this exact sequence:

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET(req: Request) {
  // 1. Resolve actor + org from NextAuth/session token or approved tool token
  const auth = await resolveAuth(req as NextRequest);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = auth;

  // 4. ALL subsequent queries MUST scope by org_id
  const records = await prisma.someTable.findMany({
    where: { orgId },
  });

  return NextResponse.json(records);
}
```

## Audit Workflow

1. **Find all API routes:**
   ```
   rg --files --glob 'app/api/**/route.ts' apps/web/
   ```

2. **For each route, verify:**
   - [ ] Calls `resolveAuth(req)` and checks for null return
   - [ ] Returns 401 on missing auth context
   - [ ] Uses server-derived `orgId` from resolved auth
   - [ ] ALL queries include `.eq("org_id", orgId)` or equivalent
   - [ ] No raw SQL without org_id WHERE clause
   - [ ] No `createRouteHandlerClient()` usage in route handlers

3. **Flag violations:**
   - Missing `resolveAuth` check
   - Missing org_id scoping on any query
   - Using `supabaseAdmin` (service role) in route handlers
   - Passing org_id from client request body (must derive server-side)

4. **Fix pattern:**
   - Add missing auth checks following canonical pattern
   - Replace client-provided org_id with server-derived org_id
   - Add Zod validation for request body/params

## Rules

- org_id MUST be derived server-side from session, never from request
- Service role key is for server-only background jobs, never route handlers
- Fail closed: if auth check fails, return error, never proceed
- Storage access must use signed URLs only, never public URLs

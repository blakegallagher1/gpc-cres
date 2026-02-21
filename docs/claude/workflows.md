# Workflows

## Agent Tool Wiring Workflow

1. Define tool in `packages/openai/src/tools/<toolFile>.ts`
2. Export tool from `packages/openai/src/tools/index.ts`
3. Import tool into `packages/openai/src/agents/index.ts`
4. Add tool to agent-specific array (e.g., `coordinatorTools`, `financeTools`)
5. Wire tools in `createConfiguredCoordinator()` using `withTools(agent, toolArray)`

**Never** wire tools on module-level agent exports — they must be tool-free.

## Event Dispatch Pattern

1. Import handlers at route top: `import "@/lib/automation/handlers"`
2. Import dispatch function: `import { dispatchEvent } from "@/lib/automation/events"`
3. Read existing record state if dispatch depends on detecting a change
4. Perform DB mutation
5. Dispatch event with `.catch(() => {})`:
   ```typescript
   dispatchEvent({
     type: "parcel.created",
     payload: { parcelId, dealId, orgId }
   }).catch(() => {});
   ```
6. Return API response (never block on event dispatch)

## Property DB Search Normalization

Before searching property DB, normalize addresses:

```typescript
const normalized = address
  .replace(/'/g, '')  // Strip apostrophes
  .replace(/\s+/g, ' ')  // Collapse whitespace
  .trim();
```

## Vercel Deploy Procedure

1. Delete `apps/web/.next/` to avoid FUNCTION_PAYLOAD_TOO_LARGE
2. Run `vercel --archive=tgz` (repo >15K files)
3. Restore `apps/web/.env.local` after `vercel link` (it overwrites the file)
4. Verify env vars in Vercel dashboard

## Adding New Automation Handler

1. Create handler in `apps/web/lib/automation/<handlerName>.ts`
2. Export handler function matching signature: `(payload: EventPayload) => Promise<void>`
3. Register handler in `apps/web/lib/automation/handlers.ts`:
   ```typescript
   registerHandler("event.type", handlerFunction);
   ```
4. Write test suite in `apps/web/lib/automation/__tests__/<handlerName>.test.ts`
5. Dispatch event from relevant API routes
6. Update `docs/AUTOMATION-FRONTIER.md` with handler details

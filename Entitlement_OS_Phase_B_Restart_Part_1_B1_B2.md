# Entitlement OS – Phase B Restart: Part 1

Last reviewed: 2026-02-19

# Scope: B1 + B2 only

Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.

Implement only:
- B1. DealTerms (1:1 with Deal)
  - Prisma model + API route CRUD: `/api/deals/[id]/terms`
  - UI in deal detail as Acquisition Terms card
  - timeline milestone dates wiring where applicable
- B2. EntitlementPath (1:1 with Deal)
  - Prisma model + API route CRUD: `/api/deals/[id]/entitlement-path`
  - UI in deal detail as Entitlement card or sub-tab
  - ensure entitlement hearing dates are surfaced in Command Center deadlines

Constraints:
- Do not touch legacy routes.
- Keep Phase A unchanged.
- Enforce org scoping + auth on all reads/writes.
- No `any`, no `z.string().url()`.

After completion:
1. Run `pnpm lint`
2. Run `pnpm typecheck`
3. Run route-level tests for terms + entitlement-path (or create if missing) including:
   - 401 unauthorized
   - 403 org mismatch
   - 400 validation
   - 200 success path
4. Commit with focused message.

Report exactly:
- files changed
- tests run + pass/fail
- blockers (if any)

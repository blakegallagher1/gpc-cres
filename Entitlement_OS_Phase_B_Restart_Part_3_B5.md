# Entitlement OS – Phase B Restart: Part 3
# Scope: B5 only

Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.

Implement only:
- B5. DealRisk (many per Deal)
  - Prisma model + API route CRUD: `/api/deals/[id]/risks`
  - initialize from triage output where relevant
  - deal detail Risk Register card
  - portfolio heat-map input path as needed

Constraints:
- Do not touch legacy routes.
- Keep Phase A unchanged.
- Enforce org scope + auth checks.
- No `any`, no `z.string().url()`.

After completion:
1. Run `pnpm lint`
2. Run `pnpm typecheck`
3. Run targeted tests for risks route:
   - 401 unauthorized
   - 403 org mismatch
   - 400 invalid payload
   - 200 success path
4. Commit with focused message.

Report exactly:
- files changed
- tests run + pass/fail
- blockers (if any)

# Entitlement OS – Phase B Restart: Part 2
# Scope: B3 + B4 only

Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.

Implement only:
- B3. EnvironmentalAssessment (many per Deal)
  - Prisma model + API route CRUD: `/api/deals/[id]/environmental-assessments`
  - UI in deal detail Documents context
  - auto-populate from Phase I upload classification where applicable
- B4. DealFinancing (many per Deal)
  - Prisma model + API route CRUD: `/api/deals/[id]/financings`
  - deal detail UI for add/edit and financial model actual-vs-modeled comparison

Constraints:
- Do not touch legacy routes.
- Keep Phase A unchanged.
- Enforce org scope + auth checks.
- No `any`, no `z.string().url()`.

After completion:
1. Run `pnpm lint`
2. Run `pnpm typecheck`
3. Run targeted tests for environmental-assessments and financings routes:
   - 401 unauthorized
   - 403 org mismatch
   - 400 invalid payload
   - 200 success path
4. Commit with focused message.

Report exactly:
- files changed
- tests run + pass/fail
- blockers (if any)

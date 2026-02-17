# Entitlement OS – Phase B Restart: Part 5
# Scope: B7 only

Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.

Implement only:
- B7. PropertyTitle + PropertySurvey (1:1 each with Deal)
  - Prisma models
  - routes:
    - `/api/deals/[id]/property-title`
    - `/api/deals/[id]/property-survey`
  - surface in deal detail detail panes/cards

Constraints:
- Do not touch legacy routes.
- Keep Phase A unchanged.
- Enforce org scope + auth checks.
- No `any`, no `z.string().url()`.

After completion:
1. Run `pnpm lint`
2. Run `pnpm typecheck`
3. Run targeted tests for property-title and property-survey routes:
   - 401 unauthorized
   - 403 org mismatch
   - 400 invalid payload
   - 200 success path
4. Commit with focused message.

Report exactly:
- files changed
- tests run + pass/fail
- blockers (if any)

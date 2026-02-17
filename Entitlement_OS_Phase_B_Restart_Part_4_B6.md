# Entitlement OS – Phase B Restart: Part 4
# Scope: B6 only

Read CLAUDE.md, ROADMAP.md, and IMPLEMENTATION_PLAN.md first.

Implement only:
- B6. DealStakeholder (many per Deal)
  - Prisma model + API route CRUD: `/api/deals/[id]/stakeholders`
  - replace YAML-in-notes stakeholder pattern with structured model usage
  - surface stakeholders in deal detail Overview

Constraints:
- Do not touch legacy routes.
- Keep Phase A unchanged.
- Enforce org scope + auth checks.
- No `any`, no `z.string().url()`.

After completion:
1. Run `pnpm lint`
2. Run `pnpm typecheck`
3. Run targeted tests for stakeholders route:
   - 401 unauthorized
   - 403 org mismatch
   - 400 invalid payload
   - 200 success path
4. Commit with focused message.

Report exactly:
- files changed
- tests run + pass/fail
- blockers (if any)

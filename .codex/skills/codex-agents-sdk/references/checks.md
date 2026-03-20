# Required checks before handoffs

Use this checklist in Specialist instructions and PM gating logic:

- `ROADMAP.md` updated with the task id/status if applicable.
- `packages/` changes preserve existing security invariants:
  - auth/session checks on API routes
  - org_id scoping
  - strict Zod parsing on external/AI boundaries
- New migrations are non-destructive and reviewed.
- Handler-level changes include idempotency notes.
- Any AI-generated outputs include schema/validation pass expectation.

If any gate fails, specialist must fix and re-submit.

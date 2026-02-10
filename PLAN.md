# Plan

## Objectives
- Add GitHub Actions workflow `.github/workflows/automation-wave0.yml` with the exact Wave 0 automation test configuration requested.
- Validate the targeted automation tests locally and report pass/fail.
- Commit changes and open a PR since direct push to `main` is not available from this execution environment.

## Assumptions
- Direct pushes to `main` are not possible from this execution environment.
- `pnpm` is available or can be executed in this repo for test verification.

## Risks
- Local environment may not have all dependencies installed, causing test execution failures unrelated to the workflow file.
- Tests may depend on env vars/services not present in CI-like local context.

## Deliverables
- New workflow file at `.github/workflows/automation-wave0.yml`.
- Updated `PLAN.md` showing execution progress.
- A git commit and PR metadata submission.
- Test execution evidence with pass/fail status.

## Test Plan
- Run: `pnpm -C apps/web test -- lib/automation/__tests__`

## Rollback
- Revert the single commit introducing workflow and planning artifact.

## Timeline
1. ✅ Create plan and branch.
2. ✅ Add workflow file.
3. ✅ Run tests (currently failing due to unresolved workspace modules in Jest).
4. 🔄 Commit and open PR.

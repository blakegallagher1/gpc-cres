---
name: ci-fix
description: "Auto-fix CI/CD failures using headless Codex. Use when the user says fix ci, fix build, fix tests, autofix, or mentions a failing GitHub Actions run."
triggers:
  - "fix ci"
  - "fix build"
  - "fix tests"
  - "autofix"
  - "ci is broken"
  - "build failed"
  - "tests are failing"
---

# CI Auto-Fix Skill

Diagnose and fix CI failures using the autonomous pipeline.

## Quick Start

```bash
# Fix the latest CI failure on current branch:
./scripts/codex-auto/pipeline.sh fix

# Fix a specific commit:
./scripts/codex-auto/pipeline.sh fix <commit-sha>
```

## Workflow

1. **Diagnose** — Read the CI failure output:
   ```bash
   # Get the latest failed run
   gh run list --status failure --limit 1 --json databaseId,headBranch,conclusion
   gh run view <run-id> --log-failed 2>&1 | tail -100
   ```

2. **Categorize** the failure:
   | Type | Signal | Fix approach |
   |------|--------|-------------|
   | Type error | `TS2xxx` | Fix the type, run `pnpm typecheck` |
   | Lint | `eslint` / `Warning:` | Run `pnpm lint --fix`, commit |
   | Test | `FAIL` / `vitest` | Read failing test, fix code or snapshot |
   | Build | `next build` error | Check imports, missing env vars |
   | Prisma | `prisma generate` | Run `pnpm db:generate`, commit changes |

3. **Fix** — Use the pipeline runner which handles everything:
   ```bash
   ./scripts/codex-auto/pipeline.sh fix
   ```
   This runs `codex exec` in headless mode with the CI failure context, creates a fix branch, and opens a PR.

4. **Verify** — Check the fix PR:
   ```bash
   gh pr list --state open --search "codex-autofix"
   ```

## What Happens Under the Hood

The `pipeline.sh fix` command:
1. Reads `scripts/codex-auto/common.sh` for shared config
2. Runs `scripts/codex-auto/ci-fix.sh` which:
   - Fetches the failing CI log
   - Creates a `codex-autofix/<branch>` branch
   - Runs `codex exec` with the failure context + fix instructions
   - Commits the fix and opens a PR

## GitHub Action (Automatic)

`.github/workflows/codex-autofix.yml` triggers automatically when CI fails on non-main branches. It:
- Reads the failure log
- Runs `codex exec` with structured output (schema: `scripts/codex-auto/schemas/autofix-output.json`)
- Opens a fix PR if the fix compiles and passes tests

## Tips

- If the fix PR itself fails CI, run `pipeline.sh fix` again — it's idempotent
- Check logs: `scripts/codex-auto/logs/ci-fix-*/`
- For complex failures, add context: describe what you changed before CI broke

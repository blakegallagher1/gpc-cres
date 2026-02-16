#!/usr/bin/env bash
# ============================================================================
# sweep.sh — Quality sweep: type-hardening + auth audit + auto-PR
# ============================================================================
# Usage:
#   ./scripts/codex-auto/sweep.sh              # Run full sweep
#   ./scripts/codex-auto/sweep.sh types         # Only type-hardening
#   ./scripts/codex-auto/sweep.sh auth          # Only auth audit
#   ./scripts/codex-auto/sweep.sh lint          # Only lint + typecheck fixes
# ============================================================================

source "$(dirname "$0")/common.sh"
require_codex

MODE="${1:-all}"
TODAY=$(date +%Y%m%d)

# ---------- Type-hardening sweep ----------
run_type_sweep() {
  log_info "=== Type-Hardening Sweep ==="

  local prompt="You are running the type-hardening skill. Do the following:

1. Search the entire codebase for explicit any types:
   rg --type ts 'any' --stats
   Focus on packages/shared, packages/openai, packages/db, apps/web, apps/worker.

2. For each any you find:
   - Replace with the correct concrete type
   - If the correct type does not exist, create it in packages/shared/src/types/
   - Ensure all Zod schemas use .strict() where possible

3. After all fixes, run the full verification:
   pnpm lint && pnpm typecheck && pnpm test

4. If everything passes, create a branch and commit:
   git checkout -b auto/type-hardening-${TODAY}
   git add -A
   git commit -m 'chore: type-hardening sweep - eliminate any types'

5. Push and create a PR:
   git push -u origin HEAD
   gh pr create --title 'chore: type-hardening sweep' --body 'Automated type-hardening sweep by Codex. Replaced explicit any types with concrete types.'

Do NOT skip the test step. If tests fail, fix the failures before committing."

  run_codex_yolo "$prompt"
}

# ---------- Auth audit sweep ----------
run_auth_sweep() {
  log_info "=== Auth Pattern Audit ==="

  local prompt="You are running the auth-pattern skill. Do the following:

1. Find all API routes:
   find apps/web/app/api -name route.ts -type f

2. For each route, verify it follows the canonical auth pattern:
   - Creates Supabase client with createRouteHandlerClient
   - Calls getSession() and checks for null/error
   - Returns 401 on missing session
   - Retrieves org membership from org_members
   - Returns 403 on missing membership
   - ALL queries include .eq(org_id, orgId)
   - No service_role key usage
   - org_id is derived server-side, never from request body

3. Fix any violations by adding the missing auth checks.

4. After all fixes, run verification:
   pnpm lint && pnpm typecheck && pnpm test

5. If everything passes and there are changes:
   git checkout -b auto/auth-audit-${TODAY}
   git add -A
   git commit -m 'security: auth pattern audit - enforce org-scoped access'
   git push -u origin HEAD
   gh pr create --title 'security: auth pattern audit' --body 'Automated auth pattern audit by Codex. All API routes now enforce session + org_id scoping.'

If no violations found, just report that all routes pass the audit."

  run_codex_yolo "$prompt"
}

# ---------- Lint + typecheck fix sweep ----------
run_lint_sweep() {
  log_info "=== Lint & Typecheck Fix Sweep ==="

  local prompt="Fix all lint and typecheck errors in the project:

1. Run: pnpm lint 2>&1
   Fix every error reported.

2. Run: pnpm typecheck 2>&1
   Fix every type error reported.

3. Run: pnpm test
   If any tests broke from your fixes, fix those too.

4. If there are changes and all checks pass:
   git checkout -b auto/lint-fix-${TODAY}
   git add -A
   git commit -m 'chore: fix lint and typecheck errors'
   git push -u origin HEAD
   gh pr create --title 'chore: fix lint and typecheck errors' --body 'Automated lint/typecheck fix sweep by Codex.'

If no errors found, report clean."

  run_codex_yolo "$prompt"
}

# ---------- Dispatch ----------
case "$MODE" in
  types)
    run_type_sweep
    ;;
  auth)
    run_auth_sweep
    ;;
  lint)
    run_lint_sweep
    ;;
  all)
    run_type_sweep
    run_auth_sweep
    run_lint_sweep
    ;;
  *)
    log_error "Unknown mode: $MODE"
    echo "Usage: $0 [all|types|auth|lint]"
    exit 1
    ;;
esac

log_ok "Sweep complete. Check logs in $LOG_DIR"

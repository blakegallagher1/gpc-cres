#!/usr/bin/env bash
# ============================================================================
# ci-fix.sh — Auto-fix a failed CI run
# ============================================================================
# Usage:
#   ./scripts/codex-auto/ci-fix.sh 12345678        # Fix by GitHub run ID
#   ./scripts/codex-auto/ci-fix.sh latest           # Fix the latest failed run
#   ./scripts/codex-auto/ci-fix.sh                  # Same as 'latest'
# ============================================================================

source "$(dirname "$0")/common.sh"
require_codex

RUN_ID="${1:-latest}"

# Resolve 'latest' to actual run ID
if [[ "$RUN_ID" == "latest" ]]; then
  log_info "Finding latest failed CI run..."
  RUN_ID=$(cd "$REPO_ROOT" && gh run list --status failure --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
  if [[ -z "$RUN_ID" || "$RUN_ID" == "null" ]]; then
    log_warn "No failed CI runs found. Nothing to fix."
    exit 0
  fi
  log_info "Latest failed run: $RUN_ID"
fi

log_info "Fetching logs for run $RUN_ID..."
CI_LOGS=$(cd "$REPO_ROOT" && gh run view "$RUN_ID" --log-failed 2>&1 | tail -200)

if [[ -z "$CI_LOGS" ]]; then
  log_error "Could not fetch logs for run $RUN_ID"
  exit 1
fi

log_info "Sending failure context to Codex..."

PROMPT="A CI run failed. Your job is to fix it.

FAILED RUN ID: ${RUN_ID}

FAILURE LOGS (last 200 lines):
${CI_LOGS}

INSTRUCTIONS:
1. Analyze the failure logs above and identify the root cause(s).

2. Fix the code:
   - If it is a lint error, fix the lint violations
   - If it is a type error, fix the type issues
   - If it is a test failure, fix the failing tests or the code they test
   - If it is a build error, fix the build issue

3. Run the full MVP verification locally:
   pnpm lint && pnpm typecheck && pnpm test && pnpm build

4. If all pass, commit on the current branch:
   git add -A
   git commit -m 'fix: resolve CI failure from run ${RUN_ID}'
   git push

If the failure is in infrastructure (e.g., missing env vars, service outage), report what is wrong instead of trying to fix code."

run_codex_yolo "$PROMPT"

log_ok "CI fix complete. Check logs in $LOG_DIR"

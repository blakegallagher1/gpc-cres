#!/usr/bin/env bash
# ============================================================================
# review-pr.sh — Have Codex review an open PR
# ============================================================================
# Usage:
#   ./scripts/codex-auto/review-pr.sh 42          # Review PR #42
#   ./scripts/codex-auto/review-pr.sh latest       # Review latest open PR
# ============================================================================

source "$(dirname "$0")/common.sh"
require_codex

PR_NUM="${1:-latest}"

cd "$REPO_ROOT"

if [[ "$PR_NUM" == "latest" ]]; then
  log_info "Finding latest open PR..."
  PR_NUM=$(gh pr list --state open --limit 1 --json number --jq '.[0].number' 2>/dev/null)
  if [[ -z "$PR_NUM" || "$PR_NUM" == "null" ]]; then
    log_warn "No open PRs found."
    exit 0
  fi
fi

log_info "Reviewing PR #$PR_NUM..."

# Use codex exec review which is purpose-built for this
codex exec review \
  -C "$REPO_ROOT" \
  --full-auto \
  2>&1 | tee "${LOG_DIR}/${TIMESTAMP}-review-pr-${PR_NUM}.log"

log_ok "Review complete for PR #$PR_NUM"

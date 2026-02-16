#!/usr/bin/env bash
# ============================================================================
# run.sh — Quick-run any Codex prompt against gallagher-cres
# ============================================================================
# The simplest way to run Codex non-interactively on this project.
#
# Usage:
#   ./scripts/codex-auto/run.sh "add error handling to the deals page"
#   ./scripts/codex-auto/run.sh "fix the bug in apps/web/app/api/deals/route.ts"
#   echo "refactor the search component" | ./scripts/codex-auto/run.sh
# ============================================================================

source "$(dirname "$0")/common.sh"
require_codex

PROMPT="${1:-}"

# Read from stdin if no argument
if [[ -z "$PROMPT" ]]; then
  if [[ ! -t 0 ]]; then
    PROMPT=$(cat)
  fi
fi

if [[ -z "$PROMPT" ]]; then
  echo "Usage: $0 \"your prompt here\""
  echo "   or: echo \"your prompt\" | $0"
  exit 1
fi

log_info "Prompt: $PROMPT"
run_codex_yolo "$PROMPT"

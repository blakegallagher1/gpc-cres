#!/usr/bin/env bash
# ============================================================================
# run-entitlement-os-meta.sh
# Execute Entitlement_OS_Meta_Prompt.md through codex.
#
# Usage:
#   ./scripts/codex-auto/run-entitlement-os-meta.sh
#   ./scripts/codex-auto/run-entitlement-os-meta.sh /path/to/prompt.md
#   ./scripts/codex-auto/run-entitlement-os-meta.sh --danger
#   ./scripts/codex-auto/run-entitlement-os-meta.sh --prompt /path/to/prompt.md --danger
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROMPT_FILE="${REPO_ROOT}/Entitlement_OS_Meta_Prompt.md"
USE_YOLO=0

source "${SCRIPT_DIR}/common.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--prompt <path>] [--danger|--yolo]

Default prompt file:
  ${PROMPT_FILE}

Options:
  --prompt <path>    Path to markdown prompt file (defaults above)
  --danger|--yolo    Run codex with dangerously bypass approvals and sandbox
  -h, --help         Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt)
      PROMPT_FILE="$2"
      shift 2
      ;;
    --danger|--yolo)
      USE_YOLO=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      # Positional arg fallback: prompt path
      if [[ "$1" != --* ]]; then
        PROMPT_FILE="$1"
        shift
      else
        log_error "Unknown option: $1"
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ ! -f "$PROMPT_FILE" ]]; then
  log_error "Prompt file not found: $PROMPT_FILE"
  usage
  exit 1
fi

require_codex

PROMPT_TEXT="$(cat "$PROMPT_FILE")"

if [[ "$USE_YOLO" -eq 1 ]]; then
  run_codex_yolo "$PROMPT_TEXT"
else
  run_codex "$PROMPT_TEXT"
fi

#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USE_YOLO=0
source "${SCRIPT_DIR}/common.sh"

PROMPT_FILE="${REPO_ROOT}/Entitlement_OS_Phase_B.md"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--danger|--yolo] [--prompt <path>]

Default prompt file:
  ${PROMPT_FILE}

Options:
  --prompt <path>        Path to prompt markdown (optional override)
  --danger|--yolo        Run codex with dangerously bypass approvals and sandbox
  -h, --help             Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt)
      PROMPT_FILE="$2"; shift 2 ;;
    --danger|--yolo)
      USE_YOLO=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      log_error "Unknown option: $1"; usage; exit 1 ;;
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

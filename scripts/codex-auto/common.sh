#!/usr/bin/env bash
# ============================================================================
# common.sh — Shared utilities for Codex automation scripts
# ============================================================================
# Source this from other scripts:  source "$(dirname "$0")/common.sh"
# ============================================================================

set -euo pipefail

# Project root (gallagher-cres)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPTS_DIR="${REPO_ROOT}/scripts/codex-auto"
LOG_DIR="${REPO_ROOT}/scripts/codex-auto/logs"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Timestamp for log files
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# Colors (only if terminal supports them)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

log_info()  { echo -e "${BLUE}[INFO]${NC}  $(date +%H:%M:%S) $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $(date +%H:%M:%S) $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date +%H:%M:%S) $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date +%H:%M:%S) $*"; }

# Verify codex CLI is available
require_codex() {
  if ! command -v codex &>/dev/null; then
    log_error "codex CLI not found in PATH"
    log_error "Install: npm install -g @openai/codex"
    exit 1
  fi
  log_info "Using codex $(codex --version 2>/dev/null || echo 'unknown version')"
}

# Run codex exec with project defaults
# Usage: run_codex "prompt text" [extra flags...]
run_codex() {
  local prompt="$1"
  shift
  local logfile="${LOG_DIR}/${TIMESTAMP}-$(echo "$prompt" | tr ' ' '-' | head -c 40).log"

  log_info "Running codex exec..."
  log_info "Log: $logfile"

  codex exec \
    -C "$REPO_ROOT" \
    --full-auto \
    "$@" \
    "$prompt" \
    2>&1 | tee "$logfile"

  local exit_code=${PIPESTATUS[0]}
  if [[ $exit_code -eq 0 ]]; then
    log_ok "Codex completed successfully"
  else
    log_error "Codex exited with code $exit_code"
  fi
  return $exit_code
}

# Run codex exec in full danger mode (for git operations)
# Usage: run_codex_yolo "prompt text" [extra flags...]
run_codex_yolo() {
  local prompt="$1"
  shift
  local logfile="${LOG_DIR}/${TIMESTAMP}-$(echo "$prompt" | tr ' ' '-' | head -c 40).log"

  log_info "Running codex exec (full-access)..."
  log_info "Log: $logfile"

  codex exec \
    -C "$REPO_ROOT" \
    --dangerously-bypass-approvals-and-sandbox \
    "$@" \
    "$prompt" \
    2>&1 | tee "$logfile"

  local exit_code=${PIPESTATUS[0]}
  if [[ $exit_code -eq 0 ]]; then
    log_ok "Codex completed successfully"
  else
    log_error "Codex exited with code $exit_code"
  fi
  return $exit_code
}

# Parse the ROADMAP.md for the next Planned item
# Returns the R-XXX or DA-XXX identifier line
get_next_roadmap_item() {
  local roadmap="${REPO_ROOT}/ROADMAP.md"
  if [[ ! -f "$roadmap" ]]; then
    log_error "ROADMAP.md not found at $roadmap"
    return 1
  fi

  # Find the first item with Status: Planned (or **Status:** Planned)
  # Look for the ### header preceding the Planned status
  local item_header=""
  local in_item=false
  while IFS= read -r line; do
    if [[ "$line" =~ ^###\ .+ ]]; then
      item_header="$line"
      in_item=true
    elif $in_item && [[ "$line" =~ "Status:".*"Planned" ]]; then
      echo "$item_header"
      return 0
    fi
  done < "$roadmap"

  log_warn "No Planned items found in ROADMAP.md"
  return 1
}

log_info "Automation context: $REPO_ROOT"

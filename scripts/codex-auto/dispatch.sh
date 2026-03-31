#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PARALLEL=false
TASK_PATH=""
RESULTS_DIR=""

usage() {
  cat << 'EOF'
Usage: dispatch.sh [--parallel] <task-file-or-directory>

Options:
  --parallel    Run tasks without dependencies concurrently
  -h, --help    Show this help message

Task files are YAML matching scripts/codex-auto/schemas/task.schema.json
Examples:
  dispatch.sh scripts/codex-auto/tasks/task-001.yaml
  dispatch.sh scripts/codex-auto/tasks/
  dispatch.sh --parallel scripts/codex-auto/tasks/
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --parallel) PARALLEL=true; shift ;;
    -h|--help) usage ;;
    *) TASK_PATH="$1"; shift ;;
  esac
done

if [[ -z "$TASK_PATH" ]]; then
  log_error "Missing task file or directory"
  usage
fi

if [[ ! -e "$TASK_PATH" ]]; then
  log_error "Path not found: $TASK_PATH"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RESULTS_DIR="$LOG_DIR/dispatch-$TIMESTAMP"
mkdir -p "$RESULTS_DIR"

# Collect task files
TASK_FILES=()
if [[ -d "$TASK_PATH" ]]; then
  while IFS= read -r f; do
    TASK_FILES+=("$f")
  done < <(find "$TASK_PATH" -type f \( -name '*.yaml' -o -name '*.yml' \) | sort)
  if [[ ${#TASK_FILES[@]} -eq 0 ]]; then
    log_error "No YAML task files found in: $TASK_PATH"
    exit 1
  fi
else
  TASK_FILES=("$TASK_PATH")
fi

log_info "=== Codex Dispatch: ${#TASK_FILES[@]} task(s) ==="
log_info "Results: $RESULTS_DIR"
log_info ""

# Use file-based tracking (bash 3.x compatible — macOS ships bash 3)
COMPLETED_FILE="$RESULTS_DIR/.completed"
touch "$COMPLETED_FILE"
FAILED=0

extract_yaml_value() {
  local file="$1"
  local key="$2"
  # Extract simple scalar values (non-nested)
  grep "^${key}:" "$file" 2>/dev/null | head -1 | sed "s/^${key}: *//" | sed 's/^["'"'"']*//;s/["'"'"']*$//'
}

extract_yaml_array() {
  local file="$1"
  local key="$2"
  # Extract array items: key: [item1, item2] or key:\n  - item1\n  - item2
  awk "/^${key}:/ {found=1; next} found {if (/^[^ ]/) {found=0; exit} if (/^  *-/) print}" "$file" | sed 's/^[[:space:]]*-[[:space:]]*//' | sed 's/^["'"'"']*//;s/["'"'"']*$//'
}

run_task() {
  local taskfile="$1"

  # Extract fields from YAML
  local task_id task_title task_desc task_profile task_verify task_max_min

  task_id=$(extract_yaml_value "$taskfile" "id")
  task_title=$(extract_yaml_value "$taskfile" "title")
  task_desc=$(extract_yaml_value "$taskfile" "description")
  task_profile=$(extract_yaml_value "$taskfile" "profile")
  task_verify=$(extract_yaml_value "$taskfile" "verification_command")
  task_max_min=$(extract_yaml_value "$taskfile" "max_minutes")

  # Defaults
  task_profile="${task_profile:-feature}"
  task_max_min="${task_max_min:-15}"

  [[ -z "$task_id" ]] && { log_error "Missing 'id' in $taskfile"; return 1; }
  [[ -z "$task_title" ]] && { log_error "Missing 'title' in $taskfile"; return 1; }
  [[ -z "$task_desc" ]] && { log_error "Missing 'description' in $taskfile"; return 1; }

  local logfile="$RESULTS_DIR/${task_id}.log"
  local resultfile="$RESULTS_DIR/${task_id}.result.json"

  log_info "Task: $task_id | $task_title"
  log_info "  Profile: $task_profile | Timeout: ${task_max_min}m"

  # Check dependencies
  local deps_blocked=false
  while IFS= read -r dep; do
    [[ -z "$dep" ]] && continue
    if ! grep -qx "$dep" "$COMPLETED_FILE" 2>/dev/null; then
      log_warn "  BLOCKED: depends on task '$dep' (not completed)"
      echo '{"status":"blocked","reason":"dependency not met: '"$dep"'"}' > "$resultfile"
      return 1
    fi
  done < <(extract_yaml_array "$taskfile" "depends_on")

  # Build prompt from task fields
  local acceptance_criteria=""
  while IFS= read -r criterion; do
    [[ -z "$criterion" ]] && continue
    acceptance_criteria+="- $criterion"$'\n'
  done < <(extract_yaml_array "$taskfile" "acceptance_criteria")

  local prompt="Task: $task_title

$task_desc

Acceptance Criteria:
${acceptance_criteria}Rules:
- Only modify files in the task scope
- Run verification after implementation
- Do not refactor beyond what's needed
- Preserve existing auth and org-scoping patterns
- Do not delete or rename files without explicit approval"

  local timeout_sec=$((task_max_min * 60))
  local task_status="passed"
  local task_reason=""

  log_info "  Running codex exec (timeout ${task_max_min}m)..."

  if timeout "$timeout_sec" codex exec \
    -C "$REPO_ROOT" \
    --full-auto \
    "$prompt" \
    &> "$logfile"; then

    log_info "  Codex completed successfully"

    if [[ -n "$task_verify" ]]; then
      log_info "  Running verification: $task_verify"
      if eval "$task_verify" >> "$logfile" 2>&1; then
        log_ok "  PASS (verified)"
        echo '{"status":"passed","verified":true}' > "$resultfile"
      else
        log_error "  FAIL (verification command exited non-zero)"
        task_status="failed"
        task_reason="verification command failed"
        echo '{"status":"failed","verified":false,"reason":"'"$task_reason"'"}' > "$resultfile"
        return 1
      fi
    else
      log_ok "  PASS (no verification command)"
      echo '{"status":"passed","verified":false}' > "$resultfile"
    fi
  else
    local exit_code=$?
    if [[ $exit_code -eq 124 ]]; then
      log_error "  FAIL (timeout after ${task_max_min}m)"
      task_status="failed"
      task_reason="timeout"
    else
      log_error "  FAIL (codex exec exited with code $exit_code)"
      task_status="failed"
      task_reason="codex exec failed"
    fi
    echo '{"status":"'"$task_status"'","reason":"'"$task_reason"'"}' > "$resultfile"
    return 1
  fi
}

# Process tasks sequentially (--parallel flag reserved for future use)
for taskfile in "${TASK_FILES[@]}"; do
  task_id=$(extract_yaml_value "$taskfile" "id")

  if run_task "$taskfile"; then
    echo "$task_id" >> "$COMPLETED_FILE"
  else
    FAILED=$((FAILED + 1))
    log_warn "Task $task_id failed. Continuing with remaining tasks."
  fi
  log_info ""
done

# Summary
echo ""
log_info "=== Dispatch Complete ==="
log_info "  Total:  ${#TASK_FILES[@]}"
log_info "  Passed: $(( ${#TASK_FILES[@]} - FAILED ))"
log_info "  Failed: $FAILED"
log_info "  Results: $RESULTS_DIR"

# Generate summary JSON
cat > "$RESULTS_DIR/summary.json" << ENDJSON
{
  "timestamp": "$TIMESTAMP",
  "total": ${#TASK_FILES[@]},
  "passed": $(( ${#TASK_FILES[@]} - FAILED )),
  "failed": $FAILED,
  "results_dir": "$RESULTS_DIR"
}
ENDJSON

log_ok "Summary written to: $RESULTS_DIR/summary.json"

exit $FAILED

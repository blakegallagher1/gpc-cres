#!/usr/bin/env bash
# ============================================================================
# sentry-fix.sh — Pull unresolved Sentry errors and auto-fix with Codex
# ============================================================================
# Usage:
#   ./scripts/codex-auto/sentry-fix.sh                # Fix latest unresolved issue (both projects)
#   ./scripts/codex-auto/sentry-fix.sh web             # Only entitlement-os-web
#   ./scripts/codex-auto/sentry-fix.sh agents          # Only entitlement-os-agents
#   ./scripts/codex-auto/sentry-fix.sh SENTRY-ABC123   # Fix a specific Sentry issue by short ID
#   ./scripts/codex-auto/sentry-fix.sh --all           # Fix up to 5 unresolved issues
# ============================================================================

source "$(dirname "$0")/common.sh"
require_codex

MODE="${1:-latest}"

# ---------------------------------------------------------------------------
# Load Sentry auth token
# ---------------------------------------------------------------------------
ENV_FILE="${REPO_ROOT}/apps/web/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="${REPO_ROOT}/.env"
fi
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "No env file found (tried apps/web/.env.local and .env)"
  exit 1
fi

SENTRY_TOKEN=$(grep -E '^SENTRY_AUTH_TOKEN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [[ -z "$SENTRY_TOKEN" ]]; then
  log_error "SENTRY_AUTH_TOKEN not found in $ENV_FILE"
  exit 1
fi

ORG="gpc-ul"
API="https://sentry.io/api/0"
AUTH_HEADER="Authorization: Bearer ${SENTRY_TOKEN}"

# ---------------------------------------------------------------------------
# Determine which projects to scan
# ---------------------------------------------------------------------------
declare -a PROJECTS
case "$MODE" in
  web)
    PROJECTS=("entitlement-os-web")
    ;;
  agents)
    PROJECTS=("entitlement-os-agents")
    ;;
  *)
    PROJECTS=("entitlement-os-web" "entitlement-os-agents")
    ;;
esac

# ---------------------------------------------------------------------------
# Fetch a single issue by short ID (e.g., SENTRY-ABC123)
# ---------------------------------------------------------------------------
fetch_issue_by_id() {
  local short_id="$1"
  log_info "Fetching issue ${short_id}..."
  local resp
  resp=$(curl -sS -H "$AUTH_HEADER" "${API}/organizations/${ORG}/issues/?query=${short_id}&limit=1")
  echo "$resp"
}

# ---------------------------------------------------------------------------
# Fetch unresolved issues for a project
# ---------------------------------------------------------------------------
fetch_unresolved() {
  local project_slug="$1"
  local limit="${2:-1}"
  log_info "Fetching up to ${limit} unresolved issues from ${project_slug}..."
  local resp
  resp=$(curl -sS -H "$AUTH_HEADER" \
    "${API}/projects/${ORG}/${project_slug}/issues/?query=is:unresolved&sort=date&limit=${limit}")
  echo "$resp"
}

# ---------------------------------------------------------------------------
# Fetch the latest event for an issue (full stack trace)
# ---------------------------------------------------------------------------
fetch_latest_event() {
  local issue_id="$1"
  log_info "Fetching latest event for issue ${issue_id}..."
  local resp
  resp=$(curl -sS -H "$AUTH_HEADER" "${API}/issues/${issue_id}/events/latest/")
  echo "$resp"
}

# ---------------------------------------------------------------------------
# Extract error context from a Sentry event JSON
# ---------------------------------------------------------------------------
extract_error_context() {
  local event_json="$1"
  # Pull out: title, culprit, exception values with stack frames, tags, breadcrumbs
  echo "$event_json" | jq -r '
    "TITLE: " + (.title // "unknown") + "\n" +
    "CULPRIT: " + (.culprit // "unknown") + "\n" +
    "PLATFORM: " + (.platform // "unknown") + "\n" +
    "ENVIRONMENT: " + ((.tags // [] | map(select(.key=="environment")) | .[0].value) // "unknown") + "\n" +
    "TIMESTAMP: " + (.dateCreated // "unknown") + "\n\n" +
    "=== EXCEPTION ===\n" +
    (if .entries then
      (.entries[] | select(.type=="exception") |
        (.data.values // [] | map(
          "Type: " + (.type // "?") + "\n" +
          "Value: " + (.value // "?") + "\n" +
          "Stacktrace:\n" +
          (if .stacktrace then
            (.stacktrace.frames // [] | map(
              "  " + (.filename // "?") + ":" + ((.lineno // 0) | tostring) +
              " in " + (.function // "?") +
              (if .context then "\n    " + ([.context[][] | tostring] | join("\n    ")) else "" end)
            ) | join("\n"))
          else "  (no stacktrace)" end
        ) | join("\n\n"))
      ) // "No exception entries"
    else "No entries in event" end) + "\n\n" +
    "=== BREADCRUMBS (last 10) ===\n" +
    (if .entries then
      (.entries[] | select(.type=="breadcrumbs") |
        (.data.values // [] | last(10) | map(
          (.timestamp // "?") + " [" + (.category // "?") + "] " + (.message // .data // "?" | tostring)
        ) | join("\n"))
      ) // "No breadcrumbs"
    else "No entries" end)
  ' 2>/dev/null || echo "$event_json" | head -200
}

# ---------------------------------------------------------------------------
# Fix a single Sentry issue
# ---------------------------------------------------------------------------
fix_issue() {
  local issue_json="$1"
  local issue_id issue_title issue_culprit project_slug short_id

  issue_id=$(echo "$issue_json" | jq -r '.id')
  issue_title=$(echo "$issue_json" | jq -r '.title // "unknown"')
  issue_culprit=$(echo "$issue_json" | jq -r '.culprit // "unknown"')
  project_slug=$(echo "$issue_json" | jq -r '.project.slug // "unknown"')
  short_id=$(echo "$issue_json" | jq -r '.shortId // "unknown"')

  log_info "Fixing: [${short_id}] ${issue_title} (${project_slug})"

  # Fetch the full event with stack trace
  local event_json
  event_json=$(fetch_latest_event "$issue_id")

  # Extract readable error context
  local error_context
  error_context=$(extract_error_context "$event_json")

  local PROMPT="A Sentry error needs to be fixed. Here is the full error context:

SENTRY ISSUE: ${short_id}
PROJECT: ${project_slug}
TITLE: ${issue_title}
CULPRIT: ${issue_culprit}

ERROR DETAILS:
${error_context}

INSTRUCTIONS:
1. Analyze the error above. Identify the root cause from the stack trace and breadcrumbs.

2. Find and fix the code that caused this error:
   - Look at the file paths and line numbers in the stack trace
   - Read the relevant source files
   - Fix the bug (null checks, type errors, missing imports, logic errors, etc.)

3. If the error is in a dependency or external service (not our code), report what is wrong instead of trying to fix it.

4. After fixing, run verification:
   pnpm --filter ./apps/web build
   pnpm typecheck
   pnpm test

5. If all pass and you made changes, commit on the current branch:
   git add -A
   git commit -m 'fix: resolve Sentry issue ${short_id} - ${issue_title}'

6. Do NOT push. Just commit locally.

If you cannot determine the fix, explain what you found and what you think the issue is."

  run_codex_yolo "$PROMPT"

  # Mark as resolved in Sentry after successful fix
  local codex_exit=$?
  if [[ $codex_exit -eq 0 ]]; then
    log_info "Marking ${short_id} as resolved in Sentry..."
    curl -sS -X PUT \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      --data '{"status":"resolved"}' \
      "${API}/issues/${issue_id}/" > /dev/null
    log_ok "Issue ${short_id} marked as resolved"
  fi
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------

# Specific issue by short ID
if [[ "$MODE" =~ ^[A-Z]+-[A-Z0-9]+$ ]]; then
  ISSUES_JSON=$(fetch_issue_by_id "$MODE")
  ISSUE_COUNT=$(echo "$ISSUES_JSON" | jq 'length')
  if [[ "$ISSUE_COUNT" -eq 0 || "$ISSUES_JSON" == "[]" ]]; then
    log_warn "Issue ${MODE} not found"
    exit 0
  fi
  ISSUE=$(echo "$ISSUES_JSON" | jq '.[0]')
  fix_issue "$ISSUE"
  log_ok "Sentry fix complete. Check logs in $LOG_DIR"
  exit 0
fi

# Determine limit
LIMIT=1
if [[ "$MODE" == "--all" ]]; then
  LIMIT=5
fi

FOUND_ANY=false

for PROJECT in "${PROJECTS[@]}"; do
  ISSUES_JSON=$(fetch_unresolved "$PROJECT" "$LIMIT")
  ISSUE_COUNT=$(echo "$ISSUES_JSON" | jq 'length' 2>/dev/null || echo 0)

  if [[ "$ISSUE_COUNT" -eq 0 || "$ISSUES_JSON" == "[]" ]]; then
    log_info "No unresolved issues in ${PROJECT}"
    continue
  fi

  FOUND_ANY=true
  for i in $(seq 0 $((ISSUE_COUNT - 1))); do
    ISSUE=$(echo "$ISSUES_JSON" | jq ".[$i]")
    fix_issue "$ISSUE"
  done
done

if [[ "$FOUND_ANY" == "false" ]]; then
  log_ok "No unresolved Sentry issues found. All clear."
fi

log_ok "Sentry fix complete. Check logs in $LOG_DIR"

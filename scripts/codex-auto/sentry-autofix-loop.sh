#!/usr/bin/env bash
# ============================================================================
# sentry-autofix-loop.sh
# ============================================================================
# End-to-end reliability loop:
# 1) API smoke checks
# 2) Optional Atlas smoke checks (macOS only)
# 3) Pull unresolved Sentry issues
# 4) Run codex exec fixes iteratively until clear or max iterations reached
#
# Usage:
#   ./scripts/codex-auto/sentry-autofix-loop.sh
#   ./scripts/codex-auto/sentry-autofix-loop.sh --base-url https://gallagherpropco.com
#   ./scripts/codex-auto/sentry-autofix-loop.sh --use-atlas --max-iterations 5
#   ./scripts/codex-auto/sentry-autofix-loop.sh --max-issues-per-iteration 3
# ============================================================================

source "$(dirname "$0")/common.sh"
require_codex

BASE_URL="${BASE_URL:-https://gallagherpropco.com}"
MAX_ITERATIONS="${MAX_ITERATIONS:-3}"
MAX_ISSUES_PER_ITERATION="${MAX_ISSUES_PER_ITERATION:-2}"
USE_ATLAS="false"
SLEEP_BETWEEN_ITERS_SEC="${SLEEP_BETWEEN_ITERS_SEC:-10}"
PROJECTS=("entitlement-os-web" "entitlement-os-agents")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --max-issues-per-iteration)
      MAX_ISSUES_PER_ITERATION="$2"
      shift 2
      ;;
    --sleep)
      SLEEP_BETWEEN_ITERS_SEC="$2"
      shift 2
      ;;
    --use-atlas)
      USE_ATLAS="true"
      shift
      ;;
    --web-only)
      PROJECTS=("entitlement-os-web")
      shift
      ;;
    --agents-only)
      PROJECTS=("entitlement-os-agents")
      shift
      ;;
    *)
      log_error "Unknown flag: $1"
      exit 1
      ;;
  esac
done

if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]] || ! [[ "$MAX_ISSUES_PER_ITERATION" =~ ^[0-9]+$ ]]; then
  log_error "MAX_ITERATIONS and MAX_ISSUES_PER_ITERATION must be integers"
  exit 1
fi

if ! [[ "$SLEEP_BETWEEN_ITERS_SEC" =~ ^[0-9]+$ ]]; then
  log_error "SLEEP_BETWEEN_ITERS_SEC must be an integer"
  exit 1
fi

load_env_value() {
  local key="$1"
  local env_file=""
  if [[ -f "${REPO_ROOT}/apps/web/.env.local" ]]; then
    env_file="${REPO_ROOT}/apps/web/.env.local"
  elif [[ -f "${REPO_ROOT}/.env" ]]; then
    env_file="${REPO_ROOT}/.env"
  fi

  if [[ -z "$env_file" ]]; then
    echo ""
    return 0
  fi

  grep -E "^${key}=" "$env_file" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-$(load_env_value SENTRY_AUTH_TOKEN)}"
SENTRY_ORG="${SENTRY_ORG:-$(load_env_value SENTRY_ORG)}"
SENTRY_PROJECT="${SENTRY_PROJECT:-$(load_env_value SENTRY_PROJECT)}"

if [[ -z "$SENTRY_AUTH_TOKEN" || -z "$SENTRY_ORG" ]]; then
  log_error "Missing Sentry credentials. Need SENTRY_AUTH_TOKEN and SENTRY_ORG in env/.env files."
  exit 1
fi

if [[ -d "/home/controller/.codex" ]]; then
  if ! CODEX_HOME=/home/controller/.codex codex login status >/dev/null 2>&1; then
    log_warn "codex login status failed under CODEX_HOME=/home/controller/.codex."
    log_warn "Run: CODEX_HOME=/home/controller/.codex codex login"
    exit 1
  fi
else
  if ! codex login status >/dev/null 2>&1; then
    log_warn "codex login status failed under default CODEX_HOME."
    log_warn "Run: codex login"
    exit 1
  fi
fi

sanitize_json() {
  tr -d '\000-\011\013-\037'
}

api_smoke_check() {
  log_info "API smoke checks against ${BASE_URL}"

  local endpoints=(
    "/api/health"
    "/api/health/detailed"
    "/api/chat/conversations"
    "/api/portfolio/capital-deployment"
  )

  local failures=0
  for path in "${endpoints[@]}"; do
    local code
    code=$(curl -sS -o /tmp/codex-smoke-body.txt -w "%{http_code}" "${BASE_URL}${path}" || true)
    if [[ "$code" =~ ^(200|401|403)$ ]]; then
      log_ok "API ${path} -> ${code}"
    else
      log_warn "API ${path} -> ${code}"
      failures=$((failures + 1))
    fi
  done

  if [[ "$failures" -gt 0 ]]; then
    log_warn "API smoke had ${failures} non-OK endpoint(s)"
  else
    log_ok "API smoke passed"
  fi
}

atlas_smoke_check() {
  if [[ "$USE_ATLAS" != "true" ]]; then
    return 0
  fi

  if [[ "$(uname -s)" != "Darwin" ]]; then
    log_warn "Atlas smoke requested but host is not macOS; skipping."
    return 0
  fi

  export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
  local atlas_cli="$CODEX_HOME/skills/atlas/scripts/atlas_cli.py"

  if [[ ! -f "$atlas_cli" ]]; then
    log_warn "Atlas CLI not found at ${atlas_cli}; skipping Atlas smoke."
    return 0
  fi

  log_info "Running Atlas smoke checks"
  uv run --python 3.12 python "$atlas_cli" app-name >/dev/null
  uv run --python 3.12 python "$atlas_cli" tabs --json >/dev/null
  uv run --python 3.12 python "$atlas_cli" open-tab "${BASE_URL}" >/dev/null
  log_ok "Atlas smoke checks completed"
}

fetch_unresolved_issue_rows() {
  local project_slug="$1"
  curl -sS \
    -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
    "https://sentry.io/api/0/projects/${SENTRY_ORG}/${project_slug}/issues/?query=is:unresolved%20environment:production&per_page=25" \
    | sanitize_json \
    | jq -r '.[] | [.id, .shortId, .title, .level, .count, .lastSeen, .project.slug] | @tsv'
}

build_codex_issue_prompt() {
  local issue_id="$1"
  local short_id="$2"
  local title="$3"
  local project_slug="$4"

  local latest_event
  latest_event=$(curl -sS \
    -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
    "https://sentry.io/api/0/issues/${issue_id}/events/?per_page=1" \
    | sanitize_json)

  local detail
  detail=$(echo "$latest_event" | jq -r '
    if type=="array" and length>0 then
      .[0] |
      "Title: " + (.title // "unknown") + "\n" +
      "Culprit: " + (.culprit // "unknown") + "\n" +
      "Transaction: " + ((.tags // [] | map(select(.key=="transaction")) | .[0].value) // "unknown") + "\n" +
      "Release: " + ((.tags // [] | map(select(.key=="release")) | .[0].value) // "unknown") + "\n" +
      "Metadata: " + ((.metadata.value // .metadata.title // .message // "none")|tostring)
    else
      "No event payload available"
    end
  ')

  cat <<EOF
Fix Sentry issue ${short_id} in project ${project_slug}.

Sentry title: ${title}
Issue id: ${issue_id}

Environment override for this machine:
- Do NOT run CODEX_HOME=/home/controller/.codex checks.
- Do NOT run codex login --chatgpt.
- If auth must be checked, use: codex login status

Latest event details:
${detail}

Do this iteratively:
1) Find root cause in the codebase.
2) Apply a focused fix (no unrelated refactors).
3) Run verification: pnpm lint && pnpm typecheck && pnpm test && pnpm build.
4) Commit, push, create PR, and merge to main.
5) Reply with what changed and why this resolves ${short_id}.
EOF
}

fix_issue_with_codex() {
  local issue_id="$1"
  local short_id="$2"
  local title="$3"
  local project_slug="$4"

  log_info "Autofix start: ${short_id} (${project_slug})"
  local prompt
  prompt=$(build_codex_issue_prompt "$issue_id" "$short_id" "$title" "$project_slug")

  run_codex_yolo "$prompt" || {
    log_warn "Codex fix failed for ${short_id}"
    return 1
  }

  log_ok "Codex fix pass completed for ${short_id}"
  return 0
}

collect_all_unresolved() {
  local rows=()
  local project
  for project in "${PROJECTS[@]}"; do
    while IFS= read -r line; do
      [[ -n "$line" ]] && rows+=("$line")
    done < <(fetch_unresolved_issue_rows "$project")
  done
  printf '%s\n' "${rows[@]}"
}

log_info "Starting sentry-autofix-loop"
log_info "base_url=${BASE_URL} max_iterations=${MAX_ITERATIONS} max_issues_per_iteration=${MAX_ISSUES_PER_ITERATION}"

for ((iteration=1; iteration<=MAX_ITERATIONS; iteration++)); do
  log_info "=== Iteration ${iteration}/${MAX_ITERATIONS} ==="

  api_smoke_check
  atlas_smoke_check

  unresolved=()
  while IFS= read -r line; do
    unresolved+=("$line")
  done < <(collect_all_unresolved)

  if [[ "${#unresolved[@]}" -eq 0 ]] || [[ -z "${unresolved[0]:-}" ]]; then
    log_ok "No unresolved production issues in selected Sentry projects."
    exit 0
  fi

  log_warn "Found ${#unresolved[@]} unresolved issue(s)."
  for row in "${unresolved[@]}"; do
    log_info "  $row"
  done

  local_fixed=0
  for row in "${unresolved[@]}"; do
    [[ -z "$row" ]] && continue
    IFS=$'\t' read -r issue_id short_id title level count last_seen project_slug <<< "$row"
    fix_issue_with_codex "$issue_id" "$short_id" "$title" "$project_slug" || true
    local_fixed=$((local_fixed + 1))
    if [[ "$local_fixed" -ge "$MAX_ISSUES_PER_ITERATION" ]]; then
      break
    fi
  done

  if [[ "$iteration" -lt "$MAX_ITERATIONS" ]]; then
    log_info "Sleeping ${SLEEP_BETWEEN_ITERS_SEC}s before next iteration..."
    sleep "$SLEEP_BETWEEN_ITERS_SEC"
  fi
done

log_warn "Reached max iterations (${MAX_ITERATIONS}). Some issues may remain unresolved."
exit 1

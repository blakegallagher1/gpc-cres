#!/usr/bin/env bash
# ============================================================================
# monitoring.sh — Synthetic health check with Sentry integration
# ============================================================================
# Monitors the /api/health endpoint and reports status to Sentry using check-ins
# (or info level) instead of error level.
#
# Usage:
#   ./scripts/codex-auto/monitoring.sh              # Run health check (live mode)
#   ./scripts/codex-auto/monitoring.sh --sentry     # Report to Sentry via check-in
#   ./scripts/codex-auto/monitoring.sh --cron       # Run as cron job (quiet)
# ============================================================================

source "$(dirname "$0")/common.sh"

MODE="${1:-live}"
API_URL="${HEALTH_CHECK_URL:-https://entitlement-os-web.vercel.app/api/health}"
HEALTH_TOKEN="${HEALTHCHECK_TOKEN:-}"
SENTRY_ORG="gpc-ul"
SENTRY_PROJECT="entitlement-os-web"
SENTRY_CHECK_IN_ID="phase2-live-check"

# ---------------------------------------------------------------------------
# Call the health endpoint
# ---------------------------------------------------------------------------
call_health() {
  local url="$1"
  local token="$2"

  if [[ -z "$token" ]]; then
    log_warn "HEALTHCHECK_TOKEN not set — calling without auth"
    curl -sS -w '\n%{http_code}' "$url"
  else
    curl -sS -w '\n%{http_code}' \
      -H "x-health-token: $token" \
      "$url"
  fi
}

# ---------------------------------------------------------------------------
# Report check-in to Sentry (monitors page check-in heartbeat)
# ============================================================================
# This uses Sentry's Cron Monitoring (formerly "check-ins") feature.
# Instead of reporting an error event, we send a structured check-in event
# that shows the monitor is alive. Sentry will alert if the check-in is missed.
#
# Reference: https://docs.sentry.io/product/crons/
# ---------------------------------------------------------------------------
report_checkin_to_sentry() {
  local status="$1"  # "ok" or "error"
  local duration="$2"  # milliseconds

  if [[ -z "${SENTRY_TOKEN:-}" ]]; then
    log_warn "SENTRY_AUTH_TOKEN not found — skipping Sentry check-in"
    return
  fi

  local check_in_url="https://sentry.io/api/0/organizations/${SENTRY_ORG}/monitor-check-ins/"
  local response

  # Prepare check-in payload
  local payload=$(cat <<EOF
{
  "check_in_id": "${SENTRY_CHECK_IN_ID}-$(date +%s)",
  "monitor_slug": "${SENTRY_CHECK_IN_ID}",
  "status": "${status}",
  "duration": ${duration}
}
EOF
)

  log_info "Sending Sentry check-in (${status})..."
  response=$(curl -sS -w '\n%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${SENTRY_TOKEN:-}" \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "$check_in_url")

  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "201" || "$http_code" == "200" ]]; then
    log_ok "Check-in reported to Sentry (HTTP ${http_code})"
  else
    log_warn "Failed to report check-in (HTTP ${http_code}): $(echo "$body" | jq -r '.detail // .' 2>/dev/null | head -1)"
  fi
}

# ---------------------------------------------------------------------------
# Report info-level message to Sentry (fallback)
# ============================================================================
# If check-ins are not set up, this sends an info-level message instead
# of error level. Info-level events are not grouped as errors in Sentry.
# ---------------------------------------------------------------------------
report_message_to_sentry() {
  local message="$1"
  local status="$2"  # "ok" or "degraded"

  if [[ -z "${SENTRY_TOKEN:-}" ]]; then
    log_warn "SENTRY_AUTH_TOKEN not found — skipping Sentry message"
    return
  fi

  local issues_url="https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/"

  local payload=$(cat <<EOF
{
  "message": "${message}",
  "level": "info",
  "tags": {
    "phase": "phase2",
    "surface": "api",
    "monitor": "${SENTRY_CHECK_IN_ID}",
    "status": "${status}"
  },
  "environment": "production",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

  log_info "Sending info-level message to Sentry..."
  response=$(curl -sS -w '\n%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${SENTRY_TOKEN:-}" \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "$issues_url")

  local http_code=$(echo "$response" | tail -1)
  if [[ "$http_code" =~ ^2[0-9]{2}$ ]]; then
    log_ok "Info message sent to Sentry (HTTP ${http_code})"
  else
    log_error "Failed to send message to Sentry (HTTP ${http_code})"
  fi
}

# ---------------------------------------------------------------------------
# Main health check
# ---------------------------------------------------------------------------

start_time=$(date +%s%N)

log_info "Health check: ${API_URL}"
response=$(call_health "$API_URL" "$HEALTH_TOKEN")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

end_time=$(date +%s%N)
duration_ms=$(( (end_time - start_time) / 1000000 ))

log_info "HTTP ${http_code} — ${duration_ms}ms"

if [[ "$http_code" == "200" ]]; then
  status_label="ok"
  health_status=$(echo "$body" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
  log_ok "Health check passed (${health_status})"

  case "$MODE" in
    --sentry)
      report_checkin_to_sentry "ok" "$duration_ms"
      ;;
    --cron)
      # Quiet mode — only log if there's an issue
      :
      ;;
    *)
      log_ok "Phase 2 live-check complete"
      ;;
  esac
  exit 0
else
  status_label="error"
  log_error "Health check failed (HTTP ${http_code})"

  case "$MODE" in
    --sentry)
      report_checkin_to_sentry "error" "$duration_ms"
      ;;
    --cron)
      # Report to Sentry as info-level (not error)
      report_message_to_sentry "phase2-live-check: HTTP ${http_code}" "degraded"
      ;;
    *)
      # Interactive mode — also report to Sentry
      report_message_to_sentry "phase2-live-check: HTTP ${http_code}" "degraded"
      ;;
  esac
  exit 1
fi

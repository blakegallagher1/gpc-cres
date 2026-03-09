#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
DEFAULT_OUTPUT_DIR="${ROOT_DIR}/output/observability"
DEFAULT_ENV_FILE="${ROOT_DIR}/scripts/observability/.env.monitor-prod"
PID_FILE="${DEFAULT_OUTPUT_DIR}/monitor-prod.pid"
LOG_PATH_FILE="${DEFAULT_OUTPUT_DIR}/monitor-prod.logpath"
START_INFO_FILE="${DEFAULT_OUTPUT_DIR}/monitor-prod.startinfo"
LATEST_LOG_LINK="${DEFAULT_OUTPUT_DIR}/monitor-prod.latest.log"

usage() {
  cat <<'EOF'
Production observability monitor wrapper

Usage:
  start_monitor_prod.sh [command] [options]

Commands:
  start        Start the monitor in the background (default)
  stop         Stop the running monitor
  restart      Stop (if running) and start again
  status       Show monitor status, log path, and start metadata
  tail         Tail the current monitor log (Ctrl+C to exit)

Options:
  -c, --config <path>   Path to env file (default: scripts/observability/.env.monitor-prod)
  -o, --output <path>   Override output directory (default: output/observability)
  --once                 Run a single monitoring pass and exit
  -h, --help            Show this message

Environment shortcut variables:
  OBS_MONITOR_ENV_FILE  Override config file path (same as --config)
  OBS_OUTPUT_DIR        Override output dir (same as --output)
EOF
}

command="start"
LOOP_OVERRIDE="${LOOP_OVERRIDE-}"

if [[ $# -gt 0 && "$1" != "-"* ]]; then
  command="$1"
  shift
fi

CONFIG_FILE="${OBS_MONITOR_ENV_FILE:-${DEFAULT_ENV_FILE}}"
OUTPUT_DIR="${DEFAULT_OUTPUT_DIR}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --once)
      LOOP_OVERRIDE="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -n "${OBS_OUTPUT_DIR:-}" ]]; then
  if [[ "${OBS_OUTPUT_DIR}" = /* ]]; then
    OUTPUT_DIR="${OBS_OUTPUT_DIR}"
  else
    OUTPUT_DIR="${ROOT_DIR}/${OBS_OUTPUT_DIR}"
  fi
fi

PID_FILE="${OUTPUT_DIR}/monitor-prod.pid"
LOG_PATH_FILE="${OUTPUT_DIR}/monitor-prod.logpath"
START_INFO_FILE="${OUTPUT_DIR}/monitor-prod.startinfo"
LATEST_LOG_LINK="${OUTPUT_DIR}/monitor-prod.latest.log"

info() {
  echo "[monitor-wrapper] $*"
}

load_env_file() {
  if [[ -n "${CONFIG_FILE:-}" && -f "${CONFIG_FILE}" ]]; then
    info "loading env file ${CONFIG_FILE}"
    # shellcheck disable=SC1090
    set -a
    source "${CONFIG_FILE}"
    set +a
  else
    info "no env file found (expected ${CONFIG_FILE})"
  fi
}

ensure_output_dir() {
  mkdir -p "${OUTPUT_DIR}"
}

read_pid() {
  if [[ -f "${PID_FILE}" ]]; then
    cat "${PID_FILE}"
  fi
}

is_running() {
  local pid
  pid=$(read_pid || true)
  if [[ -n "${pid:-}" ]] && kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi
  return 1
}

env_present() {
  local names=("$@")
  local name value
  for name in "${names[@]}"; do
    value="${!name-}"
    if [[ -n "${value}" ]]; then
      return 0
    fi
  done
  return 1
}

write_start_info() {
  local stamp="$1"
  cat > "${START_INFO_FILE}" <<EOF
started_at=${stamp}
base_url=${BASE_URL:-https://gallagherpropco.com}
config_file=${CONFIG_FILE:-none}
output_dir=${OUTPUT_DIR}
auth_bearer=$(env_present OBS_AUTH_BEARER AUTH_BEARER MAP_SMOKE_AUTH_BEARER && echo "set" || echo "missing")
health_token=$(env_present OBS_HEALTH_TOKEN HEALTH_TOKEN HEALTHCHECK_TOKEN && echo "set" || echo "missing")
session_cookie=$(env_present OBS_SESSION_COOKIE SESSION_COOKIE AUTH_COOKIE && echo "set" || echo "missing")
log_file=$(cat "${LOG_PATH_FILE}")
pid=$(cat "${PID_FILE}")
EOF
}

preflight() {
  command -v pnpm >/dev/null || {
    echo "pnpm is required to run the monitor" >&2
    exit 1
  }

  ensure_output_dir

  if ! env_present OBS_AUTH_BEARER AUTH_BEARER MAP_SMOKE_AUTH_BEARER; then
    info "warning: AUTH_BEARER not set; authenticated API checks will be skipped"
  fi

  if ! env_present OBS_HEALTH_TOKEN HEALTH_TOKEN HEALTHCHECK_TOKEN; then
    info "warning: HEALTH_TOKEN not set; /api/health check will be skipped"
  fi

  if ! env_present OBS_SESSION_COOKIE SESSION_COOKIE AUTH_COOKIE; then
    info "warning: SESSION_COOKIE not set; protected page checks run in redirect-only mode"
  fi
}

cleanup_stale_pid() {
  if [[ -f "${PID_FILE}" ]]; then
    if is_running; then
      return
    fi
    rm -f "${PID_FILE}"
  fi
}

cleanup_stale_metadata() {
  if [[ -f "${START_INFO_FILE}" ]]; then
    if is_running; then
      return
    fi
    rm -f "${START_INFO_FILE}"
  fi
}

start_monitor() {
  local original_loop="${OBS_LOOP-}"
  cleanup_stale_pid
  if is_running; then
    info "monitor already running (pid=$(read_pid))"
    if [[ -f "${LOG_PATH_FILE}" ]]; then
      info "log: $(cat "${LOG_PATH_FILE}")"
    fi
    exit 0
  fi

  load_env_file
  preflight

  export OBS_MONITOR_ENV_FILE="${CONFIG_FILE}"
  if [[ -n "${LOOP_OVERRIDE}" ]]; then
    export OBS_LOOP="${LOOP_OVERRIDE}"
  elif [[ -n "${original_loop}" ]]; then
    export OBS_LOOP="${original_loop}"
  else
    export OBS_LOOP="${OBS_LOOP:-true}"
  fi
  export OBS_OUTPUT_DIR="${OUTPUT_DIR}"

  local stamp
  stamp=$(date -u +"%Y%m%d-%H%M%S")
  local log_file="${OUTPUT_DIR}/monitor-prod-${stamp}.log"

  local previous_dir
  previous_dir=$(pwd)
  cd "${ROOT_DIR}"
  nohup pnpm observability:monitor:prod > "${log_file}" 2>&1 &
  local pid=$!
  cd "${previous_dir}"
  echo "${pid}" > "${PID_FILE}"
  echo "${log_file}" > "${LOG_PATH_FILE}"
  ln -sf "${log_file}" "${LATEST_LOG_LINK}"
  write_start_info "${stamp}"

  info "started monitor pid=${pid}"
  info "log: ${log_file}"
  info "pid file: ${PID_FILE}"
  info "stop: ${BASH_SOURCE[0]} stop"
}

stop_monitor() {
  if ! is_running; then
    info "monitor not running"
    rm -f "${START_INFO_FILE}" "${PID_FILE}" "${LOG_PATH_FILE}"
    return
  fi

  local pid
  pid=$(read_pid)
  info "stopping monitor pid=${pid}"
  kill "${pid}" || true
  wait "${pid}" 2>/dev/null || true
  rm -f "${START_INFO_FILE}" "${PID_FILE}" "${LOG_PATH_FILE}"
}

status_monitor() {
  cleanup_stale_metadata
  if is_running; then
    info "monitor running pid=$(read_pid)"
  else
    info "monitor not running"
  fi

  if [[ -f "${LOG_PATH_FILE}" ]]; then
    info "log: $(cat "${LOG_PATH_FILE}")"
  fi

  if [[ -f "${START_INFO_FILE}" ]]; then
    info "start metadata:"
    cat "${START_INFO_FILE}"
  fi
}

tail_log() {
  if [[ ! -f "${LOG_PATH_FILE}" ]]; then
    echo "No log file recorded yet" >&2
    exit 1
  fi

  tail -f "$(cat "${LOG_PATH_FILE}")"
}

case "${command}" in
  start)
    start_monitor
    ;;
  stop)
    stop_monitor
    ;;
  restart)
    stop_monitor
    start_monitor
    ;;
  status)
    status_monitor
    ;;
  tail)
    tail_log
    ;;
  *)
    echo "Unknown command: ${command}" >&2
    usage
    exit 1
    ;;
esac

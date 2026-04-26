#!/usr/bin/env bash
set -euo pipefail

LABEL="${LABEL:-com.gpc.ops.sentinel}"
REPO_DIR="${OPS_SENTINEL_REPO_DIR:-/Users/gallagherpropertycompany/Documents/gallagher-cres}"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${REPO_DIR}/output/observability/ops-sentinel"
INTERVAL_SECONDS="${OPS_SENTINEL_INTERVAL_SECONDS:-300}"

mkdir -p "${LOG_DIR}"

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "${REPO_DIR}" &amp;&amp; pnpm ops:sentinel</string>
  </array>
  <key>StartInterval</key>
  <integer>${INTERVAL_SECONDS}</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/stderr.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/${UID}" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${UID}" "${PLIST_PATH}"
launchctl enable "gui/${UID}/${LABEL}"
launchctl kickstart -k "gui/${UID}/${LABEL}"

echo "[ops-sentinel] installed label=${LABEL} plist=${PLIST_PATH} intervalSeconds=${INTERVAL_SECONDS} logDir=${LOG_DIR}"

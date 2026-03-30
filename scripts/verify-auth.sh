#!/usr/bin/env bash
set -euo pipefail

# verify-auth.sh — Automated auth smoke test for gallagherpropco.com
# Replays the OAuth CSRF+signin+callback chain without a browser.
# Reports exactly where the failure occurs.
#
# Usage:  scripts/verify-auth.sh [--verbose]

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "${YELLOW}WARN${NC} $1"; }
info() { echo -e "     $1"; }

VERBOSE=false
[[ "${1:-}" == "--verbose" ]] && VERBOSE=true

# Prerequisites
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}FATAL:${NC} python3 required but not found"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo -e "${RED}FATAL:${NC} curl required but not found"; exit 1; }

FAILURES=0
BASE_URL="https://gallagherpropco.com"
TS_IP="${GPC_TAILSCALE_IP:-100.67.140.126}"
TMPDIR_AUTH=$(mktemp -d)
trap "rm -rf $TMPDIR_AUTH" EXIT

echo "=== Auth Chain Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# ─── 1. Infrastructure checks ───────────────────────────────────────────────

echo "--- Infrastructure ---"

# Gateway via Tailscale
if curl -sf --max-time 3 "http://$TS_IP:8000/health" -o /dev/null 2>/dev/null; then
    pass "Gateway reachable via Tailscale ($TS_IP:8000)"
    GW_PATH="tailscale"
elif curl -sf --max-time 5 "https://api.gallagherpropco.com/health" -o /dev/null 2>/dev/null; then
    pass "Gateway reachable via Cloudflare (Tailscale down)"
    GW_PATH="cloudflare"
else
    fail "Gateway unreachable on BOTH paths"
    GW_PATH="none"
fi

# Postgres via Tailscale
if nc -z -w3 "$TS_IP" 54323 2>/dev/null; then
    pass "PostgreSQL port open via Tailscale ($TS_IP:54323)"
else
    warn "PostgreSQL not reachable via Tailscale (may be expected if not on mesh)"
fi

# Gateway /db endpoint (the path Prisma uses from Vercel)
DB_TOKEN="${LOCAL_API_KEY:-${GATEWAY_API_KEY:-}}"
if [ -n "$DB_TOKEN" ]; then
    # Test proxy first, then direct
    for endpoint in "https://gateway.gallagherpropco.com/db" "https://api.gallagherpropco.com/db"; do
        HTTP_CODE=$(curl -s -o "$TMPDIR_AUTH/db_response.json" -w '%{http_code}' \
            --max-time 8 \
            -X POST \
            -H "Authorization: Bearer $DB_TOKEN" \
            -H "Content-Type: application/json" \
            --data '{"sql":"SELECT 1 as ok","args":[]}' \
            "$endpoint" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            pass "Gateway /db endpoint working ($endpoint → $HTTP_CODE)"
            break
        elif [ "$HTTP_CODE" = "401" ]; then
            warn "Gateway /db returned 401 ($endpoint) — bearer token rejected"
        elif [ "$HTTP_CODE" = "000" ]; then
            warn "Gateway /db timed out ($endpoint)"
        else
            warn "Gateway /db returned $HTTP_CODE ($endpoint)"
        fi
    done
else
    warn "No LOCAL_API_KEY or GATEWAY_API_KEY in env — skipping /db check"
fi

echo ""

# ─── 2. Auth provider check ─────────────────────────────────────────────────

echo "--- Auth Providers ---"

PROVIDERS_BODY=$(curl -s --max-time 5 "$BASE_URL/api/auth/providers" 2>/dev/null || echo "")
if echo "$PROVIDERS_BODY" | grep -q '"google"'; then
    pass "Google provider registered"
else
    fail "Google provider NOT found in /api/auth/providers"
    info "Response: ${PROVIDERS_BODY:0:200}"
fi

if echo "$PROVIDERS_BODY" | grep -q '"credentials"'; then
    pass "Credentials provider registered"
fi

echo ""

# ─── 3. CSRF + Signin flow ──────────────────────────────────────────────────

echo "--- OAuth Initiation ---"

# Get CSRF token + session cookie
CSRF_RESPONSE=$(curl -s --max-time 5 \
    -c "$TMPDIR_AUTH/cookies.txt" \
    "$BASE_URL/api/auth/csrf" 2>/dev/null || echo "")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('csrfToken',''))" 2>/dev/null || echo "")

if [ -n "$CSRF_TOKEN" ]; then
    pass "CSRF token obtained"
else
    fail "Could not get CSRF token"
    info "Response: ${CSRF_RESPONSE:0:200}"
    echo ""
    echo -e "${RED}$FAILURES check(s) failed.${NC} Auth chain broken at CSRF stage."
    exit 1
fi

# POST to signin/google — should return a redirect URL to Google
SIGNIN_RESPONSE=$(curl -s --max-time 5 \
    -b "$TMPDIR_AUTH/cookies.txt" \
    -c "$TMPDIR_AUTH/cookies.txt" \
    -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "x-auth-return-redirect: 1" \
    --data-urlencode "csrfToken=$CSRF_TOKEN" \
    --data-urlencode "callbackUrl=$BASE_URL/chat" \
    --data-urlencode "json=true" \
    "$BASE_URL/api/auth/signin/google" 2>/dev/null || echo "")

REDIRECT_URL=$(echo "$SIGNIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")

if echo "$REDIRECT_URL" | grep -q "accounts.google.com"; then
    pass "Signin POST → Google OAuth redirect URL generated"
    $VERBOSE && info "Redirect: ${REDIRECT_URL:0:120}..."
elif echo "$REDIRECT_URL" | grep -q "error="; then
    fail "Signin POST returned error redirect: $REDIRECT_URL"
else
    fail "Signin POST did not return Google redirect"
    info "Response: ${SIGNIN_RESPONSE:0:300}"
fi

echo ""

# ─── 4. Callback reachability (can't complete OAuth, but can test the endpoint) ──

echo "--- Callback Endpoint ---"

# NOTE: This tests callback REACHABILITY only, not the full post-callback DB provisioning.
# A real OAuth completion requires a valid Google auth code. If this passes but browser
# login still fails, the issue is in the DB provisioning during the callback (steps 1-4
# in the AGENTS.md "Debugging Auth / DB Connectivity" section).
CALLBACK_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    "$BASE_URL/api/auth/callback/google?error=test_probe" 2>/dev/null || echo "000")

if [ "$CALLBACK_CODE" = "302" ] || [ "$CALLBACK_CODE" = "200" ]; then
    pass "Callback endpoint responds ($CALLBACK_CODE) — route is wired"
elif [ "$CALLBACK_CODE" = "500" ]; then
    fail "Callback endpoint returns 500 — server error in callback handler"
elif [ "$CALLBACK_CODE" = "000" ]; then
    fail "Callback endpoint timed out — likely DB connectivity issue during callback"
else
    warn "Callback endpoint returned $CALLBACK_CODE (expected 302)"
fi

echo ""

# ─── 5. Session check ───────────────────────────────────────────────────────

echo "--- Session ---"

SESSION_BODY=$(curl -s --max-time 5 "$BASE_URL/api/auth/session" 2>/dev/null || echo "")
if echo "$SESSION_BODY" | grep -q '"user"'; then
    pass "Active session found (already logged in)"
else
    info "No active session (expected for unauthenticated test)"
fi

echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}Auth chain is healthy.${NC} If login still fails in the browser,"
    echo "the issue is likely in the post-Google callback (DB provisioning during OAuth)."
    echo ""
    echo "Next steps if browser login still fails:"
    echo "  1. ssh bg 'docker logs gateway --tail 30 2>&1 | grep /db'"
    echo "  2. Check Vercel env: LOCAL_API_KEY, GATEWAY_DATABASE_URL, AUTH_SECRET"
    echo "  3. psql -h $TS_IP -p 54323 -U postgres -d entitlement_os -c 'SELECT id,email FROM users LIMIT 5'"
else
    echo -e "${RED}$FAILURES check(s) failed.${NC} Fix infrastructure before changing auth code."
fi

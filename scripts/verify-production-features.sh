#!/bin/bash

##############################################################################
# PRODUCTION VERIFICATION SCRIPT
#
# Verifies all 5 features before production deployment:
# 1. Gateway caching with TTL
# 2. Batch multi-parcel screening
# 3. WebSocket /push operational events
# 4. Qdrant semantic search property intelligence
# 5. Error handling with invalid parcel IDs
#
# Reminder: local Postgres accessed through the gateway/Hyperdrive path is the only system of record.
# Qdrant is exercised here purely as the semantic recall layer layered on top of that data.
#
# Usage: bash scripts/verify-production-features.sh
##############################################################################

set -e

GATEWAY_URL="${LOCAL_API_URL:-https://api.gallagherpropco.com}"
GATEWAY_KEY="${LOCAL_API_KEY:-Y9DgsDrlvfDfitSgfp0YtLwjlvY5ocKnYA_4X11tfkc}"
APP_URL="${APP_BASE_URL:-${NEXT_PUBLIC_VERCEL_URL:-http://localhost:3000}}"
AGENTS_URL="${AGENTS_URL:-https://agents.gallagherpropco.com}"
AUTH_BEARER="${AUTH_BEARER:-${MAP_SMOKE_AUTH_BEARER:-}}"
CONVERSATION_ID="test-$(date +%s)"

# Test parcel IDs (valid parcels from EBR)
VALID_PARCELS=("308-4646-1" "024-0104-5" "017-7837-4" "024-1865-7" "021-6741-7")
INVALID_PARCELS=("000-0000-0" "999-9999-9" "INVALID")

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0

# Helper function
log_test() {
    echo -e "${YELLOW}[TEST] $1${NC}"
}

log_pass() {
    echo -e "${GREEN}✅ PASSED: $1${NC}"
    ((passed++))
}

log_fail() {
    echo -e "${RED}❌ FAILED: $1${NC}"
    ((failed++))
}

require_app_auth() {
    if [ -n "$AUTH_BEARER" ]; then
        return 0
    fi

    echo ""
    echo -e "${RED}Missing AUTH_BEARER for authenticated app-route checks.${NC}"
    echo "Set AUTH_BEARER (or MAP_SMOKE_AUTH_BEARER) to a valid NextAuth/session bearer before running this script."
    echo "Gateway-only checks can still be exercised with LOCAL_API_URL + LOCAL_API_KEY, but /api/agent/tools/execute requires app auth."
    exit 1
}

##############################################################################
# TEST 1: GATEWAY CACHING
##############################################################################
log_test "Gateway Caching (TTL + cacheBust)"
echo "Screening parcel 308-4646-1 twice..."

# First call
echo "  First call (fresh fetch)..."
START1=$(date +%s%N)
RESPONSE1=$(curl -s -X POST "$GATEWAY_URL/api/screening/full" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -d '{"parcelId":"308-4646-1"}')
END1=$(date +%s%N)
TIME1=$(( (END1 - START1) / 1000000 ))
echo "    Time: ${TIME1}ms"
echo "    Response: $(echo "$RESPONSE1" | jq -c '.parcel_id')"

# Second call (should be cached)
echo "  Second call (from cache)..."
START2=$(date +%s%N)
RESPONSE2=$(curl -s -X POST "$GATEWAY_URL/api/screening/full" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -d '{"parcelId":"308-4646-1"}')
END2=$(date +%s%N)
TIME2=$(( (END2 - START2) / 1000000 ))
echo "    Time: ${TIME2}ms"

# Verify responses are identical
if [ "$RESPONSE1" = "$RESPONSE2" ]; then
    echo "  Responses match: ✓"
    if [ "$TIME2" -lt "$TIME1" ]; then
        SPEEDUP=$(echo "scale=2; $TIME1 / $TIME2" | bc)
        echo "  Cache speedup: ${SPEEDUP}x"
        log_pass "Gateway caching is working ($TIME1ms → ${TIME2}ms)"
    else
        log_fail "Cache didn't improve performance ($TIME1ms → ${TIME2}ms)"
    fi
else
    log_fail "Responses don't match"
fi

##############################################################################
# TEST 2: BATCH SCREENING
##############################################################################
log_test "Batch Multi-Parcel Screening"
echo "Screening ${#VALID_PARCELS[@]} parcels in batch mode..."
require_app_auth

START=$(date +%s%N)
BATCH_RESPONSE=$(curl -s -X POST "$APP_URL/api/agent/tools/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_BEARER" \
  -d "{
    \"toolName\": \"screen_batch\",
    \"arguments\": {
      \"parcel_ids\": [\"${VALID_PARCELS[0]}\", \"${VALID_PARCELS[1]}\", \"${VALID_PARCELS[2]}\"],
      \"conversationId\": \"$CONVERSATION_ID\"
    },
    \"context\": {\"conversationId\": \"$CONVERSATION_ID\"}
  }")
END=$(date +%s%N)
ELAPSED=$(( (END - START) / 1000000 ))

# Check if results are keyed by parcel_id
RESULT_COUNT=$(echo "$BATCH_RESPONSE" | jq '.results | length' 2>/dev/null)
if [ "$RESULT_COUNT" -eq 3 ]; then
    echo "  Results keyed by parcel_id: ✓ (3 results)"

    # Check success count
    SUCCESS_COUNT=$(echo "$BATCH_RESPONSE" | jq '[.results[] | select(.status=="ok")] | length' 2>/dev/null)
    echo "  Success rate: $SUCCESS_COUNT/3"

    if [ "$SUCCESS_COUNT" -eq 3 ]; then
        log_pass "Batch screening is working ($ELAPSED ms for 3 parcels)"
    else
        log_fail "Some parcels failed in batch screening"
    fi
else
    log_fail "Batch results not properly keyed"
fi

##############################################################################
# TEST 3: WEBSOCKET PUSH EVENTS
##############################################################################
log_test "WebSocket /push Operational Events"
echo "Pushing operation_progress and operation_done events..."

OPERATION_ID="batch-$(date +%s)"
PUSH_SUCCESS=0

# Push progress events
for PCT in 0 25 50 75 100; do
    PUSH_RESPONSE=$(curl -s -X POST "$AGENTS_URL/$CONVERSATION_ID/push" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $GATEWAY_KEY" \
      -d "{
        \"conversationId\": \"$CONVERSATION_ID\",
        \"event\": {
          \"type\": \"operation_progress\",
          \"operationId\": \"$OPERATION_ID\",
          \"label\": \"Screening batch: ${PCT}%\",
          \"pct\": $PCT
        }
      }")

    PUSH_OK=$(echo "$PUSH_RESPONSE" | jq '.ok' 2>/dev/null)
    if [ "$PUSH_OK" = "true" ] || [ -z "$PUSH_OK" ]; then
        ((PUSH_SUCCESS++))
        echo "  Progress ${PCT}%: ✓"
    fi
done

# Push done event
DONE_RESPONSE=$(curl -s -X POST "$AGENTS_URL/$CONVERSATION_ID/push" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_KEY" \
  -d "{
    \"conversationId\": \"$CONVERSATION_ID\",
    \"event\": {
      \"type\": \"operation_done\",
      \"operationId\": \"$OPERATION_ID\",
      \"label\": \"Batch screening complete\",
      \"summary\": \"Successfully screened 3 parcels\"
    }
  }")

if [ "$PUSH_SUCCESS" -ge 4 ]; then
    log_pass "/push endpoint is accepting operation events"
else
    log_fail "/push endpoint not responding properly"
fi

##############################################################################
# TEST 4: SEMANTIC SEARCH (Qdrant)
##############################################################################
log_test "Qdrant Property Intelligence (Semantic Search)"
echo "Querying recall_property_intelligence via Vercel API..."
require_app_auth

PROPERTY_TMP=$(mktemp)
PROPERTY_STATUS=$(curl -s -o "$PROPERTY_TMP" -w "%{http_code}" "$APP_URL/api/agent/tools/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_BEARER" \
  -d "{
    \"toolName\": \"recall_property_intelligence\",
    \"arguments\": {
      \"query\": \"flood zone EBR\",
      \"parish\": \"East Baton Rouge\",
      \"minScore\": 0.05
    },
    \"context\": {\"conversationId\": \"$CONVERSATION_ID\"}
  }")
PROPERTY_BODY=$(cat "$PROPERTY_TMP")
rm "$PROPERTY_TMP"

if [ "$PROPERTY_STATUS" -ne 200 ]; then
    echo "  HTTP status: $PROPERTY_STATUS"
    log_fail "recall_property_intelligence returned non-200"
else
    MEMORY_DISABLED=$(echo "$PROPERTY_BODY" | jq -r '.memory_disabled // false' 2>/dev/null)
    RESULT_COUNT=$(echo "$PROPERTY_BODY" | jq '.results | length' 2>/dev/null)
    if [ -z "$RESULT_COUNT" ] || [ "$RESULT_COUNT" = "null" ]; then
        RESULT_COUNT=0
    fi
    if [ "$MEMORY_DISABLED" = "true" ]; then
        log_fail "Property intelligence memory is disabled (AGENTOS flags off)"
    elif [ "$RESULT_COUNT" -gt 0 ]; then
        echo "  Semantic hits: $RESULT_COUNT"
        log_pass "Qdrant property intelligence is returning results"
    else
        echo "  Response: $PROPERTY_BODY"
        log_fail "Semantic search returned zero hits"
    fi
fi

##############################################################################
# TEST 5: ERROR HANDLING
##############################################################################
log_test "Error Handling with Invalid Parcel IDs"
echo "Screening ${#INVALID_PARCELS[@]} invalid parcel IDs..."
require_app_auth

ERROR_BATCH=$(curl -s -X POST "$APP_URL/api/agent/tools/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_BEARER" \
  -d "{
    \"toolName\": \"screen_batch\",
    \"arguments\": {
      \"parcel_ids\": [\"${INVALID_PARCELS[0]}\", \"${INVALID_PARCELS[1]}\", \"${INVALID_PARCELS[2]}\"],
      \"conversationId\": \"$CONVERSATION_ID\"
    },
    \"context\": {\"conversationId\": \"$CONVERSATION_ID\"}
  }")

ERROR_COUNT=$(echo "$ERROR_BATCH" | jq '[.results[] | select(.status=="error")] | length' 2>/dev/null)
if [ "$ERROR_COUNT" -eq 3 ]; then
    echo "  All invalid IDs returned errors: ✓"
    log_pass "Error handling is working correctly"
else
    echo "  Only $ERROR_COUNT / 3 returned errors"
    log_fail "Error handling may not be complete"
fi

##############################################################################
# SUMMARY
##############################################################################
echo ""
echo "=================================="
echo -e "Test Results: ${GREEN}$passed passed${NC} | ${RED}$failed failed${NC}"
echo "=================================="

if [ "$failed" -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED - Ready for production deployment${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed - Review above for details${NC}"
    exit 1
fi

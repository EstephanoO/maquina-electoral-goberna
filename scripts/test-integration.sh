#!/usr/bin/env bash
#
# test-integration.sh - Integration test script for Goberna Platform
#
# Usage:
#   ./scripts/test-integration.sh [local|prod]
#
# Examples:
#   ./scripts/test-integration.sh local  # Test against localhost:3001
#   ./scripts/test-integration.sh prod   # Test against production VPS
#   ./scripts/test-integration.sh        # Defaults to local
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENV="${1:-local}"

if [[ "$ENV" == "prod" ]]; then
    BASE_URL="http://161.132.39.165"
    echo -e "${YELLOW}Testing against PRODUCTION: $BASE_URL${NC}"
else
    BASE_URL="http://localhost:3001"
    echo -e "${BLUE}Testing against LOCAL: $BASE_URL${NC}"
fi

API_URL="$BASE_URL/api"

# Test counters
PASSED=0
FAILED=0
TOTAL=0

# Helper functions
log_test() {
    ((TOTAL++))
    echo -e "\n${BLUE}[$TOTAL] $1${NC}"
}

log_pass() {
    ((PASSED++))
    echo -e "${GREEN}✓ PASS: $1${NC}"
}

log_fail() {
    ((FAILED++))
    echo -e "${RED}✗ FAIL: $1${NC}"
    echo -e "${RED}  Response: $2${NC}"
}

# Test a simple endpoint
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    log_test "$name"
    
    response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null || echo -e "\n000")
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$status" == "$expected_status" ]]; then
        log_pass "$name (HTTP $status)"
        echo "  Response: $(echo "$body" | head -c 200)"
        return 0
    else
        log_fail "$name - Expected $expected_status, got $status" "$body"
        return 1
    fi
}

# Test with auth header
test_auth_endpoint() {
    local name="$1"
    local url="$2"
    local token="$3"
    local expected_status="${4:-200}"
    
    log_test "$name"
    
    response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $token" "$url" 2>/dev/null || echo -e "\n000")
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$status" == "$expected_status" ]]; then
        log_pass "$name (HTTP $status)"
        echo "  Response: $(echo "$body" | head -c 200)"
        return 0
    else
        log_fail "$name - Expected $expected_status, got $status" "$body"
        return 1
    fi
}

# POST request
test_post() {
    local name="$1"
    local url="$2"
    local data="$3"
    local expected_status="${4:-200}"
    local extra_headers="${5:-}"
    
    log_test "$name"
    
    if [[ -n "$extra_headers" ]]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -H "$extra_headers" -d "$data" "$url" 2>/dev/null || echo -e "\n000")
    else
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null || echo -e "\n000")
    fi
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [[ "$status" == "$expected_status" ]]; then
        log_pass "$name (HTTP $status)"
        echo "  Response: $(echo "$body" | head -c 300)"
        echo "$body"
        return 0
    else
        log_fail "$name - Expected $expected_status, got $status" "$body"
        return 1
    fi
}

echo -e "\n${YELLOW}============================================${NC}"
echo -e "${YELLOW}   Goberna Platform Integration Tests${NC}"
echo -e "${YELLOW}============================================${NC}"

# ============================================
# 1. HEALTH CHECKS
# ============================================
echo -e "\n${YELLOW}--- 1. Health Checks ---${NC}"

test_endpoint "Health endpoint" "$API_URL/health"
test_endpoint "Ready endpoint" "$API_URL/ready"

# ============================================
# 2. PUBLIC ENDPOINTS
# ============================================
echo -e "\n${YELLOW}--- 2. Public Endpoints ---${NC}"

test_endpoint "Candidates list" "$API_URL/candidates"
test_endpoint "Config endpoint" "$API_URL/config"

# ============================================
# 3. AUTH FLOW
# ============================================
echo -e "\n${YELLOW}--- 3. Auth Flow ---${NC}"

# Generate unique test user
TIMESTAMP=$(date +%s)
TEST_EMAIL="integration_test_${TIMESTAMP}@example.com"
TEST_PASSWORD="TestPassword123!"

# Register
log_test "Register new user"
REGISTER_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"full_name\":\"Integration Test\"}" \
    "$API_URL/auth/register" 2>/dev/null || echo '{"error":"failed"}')

if echo "$REGISTER_RESPONSE" | grep -q "accessToken"; then
    log_pass "Register new user"
    echo "  Response: $(echo "$REGISTER_RESPONSE" | head -c 200)"
else
    # User might already exist, try login
    echo "  Register failed (user may exist), trying login..."
fi

# Login
log_test "Login"
LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
    "$API_URL/auth/login" 2>/dev/null || echo '{"error":"failed"}')

if echo "$LOGIN_RESPONSE" | grep -q "accessToken"; then
    log_pass "Login"
    ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
    echo "  Got access token: ${ACCESS_TOKEN:0:50}..."
else
    log_fail "Login" "$LOGIN_RESPONSE"
    # Try with known test user
    TEST_EMAIL="test_integration_1771285046@example.com"
    TEST_PASSWORD="Test123456!"
    
    LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
        "$API_URL/auth/login" 2>/dev/null || echo '{"error":"failed"}')
    
    if echo "$LOGIN_RESPONSE" | grep -q "accessToken"; then
        ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
        REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"refreshToken":"[^"]*"' | cut -d'"' -f4)
        echo "  Using fallback test user, got token"
    else
        echo "  Could not authenticate. Some tests will be skipped."
        ACCESS_TOKEN=""
        REFRESH_TOKEN=""
    fi
fi

# Test authenticated endpoints if we have a token
if [[ -n "${ACCESS_TOKEN:-}" ]]; then
    # Get user profile
    test_auth_endpoint "Get user profile (/auth/me)" "$API_URL/auth/me" "$ACCESS_TOKEN"
    
    # Refresh token
    if [[ -n "${REFRESH_TOKEN:-}" ]]; then
        log_test "Refresh token"
        REFRESH_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
            -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
            "$API_URL/auth/refresh" 2>/dev/null || echo '{"error":"failed"}')
        
        if echo "$REFRESH_RESPONSE" | grep -q "accessToken"; then
            log_pass "Refresh token"
            # Update token for subsequent tests
            ACCESS_TOKEN=$(echo "$REFRESH_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
        else
            log_fail "Refresh token" "$REFRESH_RESPONSE"
        fi
    fi
fi

# ============================================
# 4. CAMPAIGNS
# ============================================
echo -e "\n${YELLOW}--- 4. Campaigns ---${NC}"

if [[ -n "${ACCESS_TOKEN:-}" ]]; then
    # Get campaigns from user profile
    PROFILE_RESPONSE=$(curl -s -H "Authorization: Bearer $ACCESS_TOKEN" "$API_URL/auth/me" 2>/dev/null)
    CAMPAIGN_ID=$(echo "$PROFILE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [[ -n "$CAMPAIGN_ID" ]]; then
        test_auth_endpoint "Get campaign details" "$API_URL/campaigns/$CAMPAIGN_ID" "$ACCESS_TOKEN"
    else
        echo "  No campaign ID found in profile, skipping campaign tests"
    fi
else
    echo "  Skipping (no auth token)"
fi

# ============================================
# 5. FORM DEFINITIONS
# ============================================
echo -e "\n${YELLOW}--- 5. Form Definitions ---${NC}"

if [[ -n "${ACCESS_TOKEN:-}" ]]; then
    test_auth_endpoint "Get active form definitions" "$API_URL/form-definitions/active" "$ACCESS_TOKEN"
else
    echo "  Skipping (no auth token)"
fi

# ============================================
# 6. FORM SUBMISSION
# ============================================
echo -e "\n${YELLOW}--- 6. Form Submission ---${NC}"

log_test "Submit form"
FORM_PAYLOAD='{
    "nombre": "Integration Test",
    "telefono": "999888777",
    "fecha": "2026-02-16T12:00:00.000Z",
    "x": 279854,
    "y": 8661420,
    "zona": "18S",
    "candidate": "Test Candidate",
    "encuestador": "Test Script",
    "encuestador_id": "integration-test",
    "candidato_preferido": "Test",
    "client_id": "integration-test-'"$TIMESTAMP"'"
}'

FORM_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
    -d "$FORM_PAYLOAD" "$API_URL/forms" 2>/dev/null || echo -e "\n000")
FORM_STATUS=$(echo "$FORM_RESPONSE" | tail -n1)
FORM_BODY=$(echo "$FORM_RESPONSE" | sed '$d')

if [[ "$FORM_STATUS" == "200" ]] || [[ "$FORM_STATUS" == "201" ]] || [[ "$FORM_STATUS" == "202" ]]; then
    log_pass "Submit form (HTTP $FORM_STATUS)"
    echo "  Response: $(echo "$FORM_BODY" | head -c 200)"
else
    log_fail "Submit form - Got HTTP $FORM_STATUS" "$FORM_BODY"
fi

# ============================================
# 7. AGENT TRACKING
# ============================================
echo -e "\n${YELLOW}--- 7. Agent Tracking ---${NC}"

# Get agent token from environment or use placeholder
if [[ "$ENV" == "prod" ]]; then
    # In production, we need the real token
    AGENT_TOKEN="${AGENT_INGEST_TOKEN:-}"
    if [[ -z "$AGENT_TOKEN" ]]; then
        echo "  AGENT_INGEST_TOKEN not set, skipping tracking tests"
        echo "  Set it with: export AGENT_INGEST_TOKEN=<token>"
    fi
else
    # For local, use test token or skip
    AGENT_TOKEN="${AGENT_INGEST_TOKEN:-test-token}"
fi

if [[ -n "$AGENT_TOKEN" ]]; then
    test_endpoint "Agents health" "$API_URL/agents/health"
    
    log_test "Send agent location"
    LOCATION_PAYLOAD='{
        "agent_id": "integration-test-agent",
        "ts": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
        "lat": -12.0464,
        "lng": -77.0428,
        "accuracy": 10,
        "seq": '"$TIMESTAMP"'
    }'
    
    LOCATION_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -H "x-agent-token: $AGENT_TOKEN" \
        -d "$LOCATION_PAYLOAD" \
        "$API_URL/agents/location" 2>/dev/null || echo -e "\n000")
    LOCATION_STATUS=$(echo "$LOCATION_RESPONSE" | tail -n1)
    LOCATION_BODY=$(echo "$LOCATION_RESPONSE" | sed '$d')
    
    if [[ "$LOCATION_STATUS" == "200" ]] || [[ "$LOCATION_STATUS" == "202" ]]; then
        log_pass "Send agent location (HTTP $LOCATION_STATUS)"
    else
        log_fail "Send agent location - Got HTTP $LOCATION_STATUS" "$LOCATION_BODY"
    fi
    
    test_endpoint "Get live agents" "$API_URL/agents/live"
fi

# ============================================
# 8. METRICS (Admin only)
# ============================================
echo -e "\n${YELLOW}--- 8. Metrics ---${NC}"

test_endpoint "Metrics endpoint" "$API_URL/metrics"

# ============================================
# SUMMARY
# ============================================
echo -e "\n${YELLOW}============================================${NC}"
echo -e "${YELLOW}   Test Summary${NC}"
echo -e "${YELLOW}============================================${NC}"
echo -e "Total:  $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please check the output above.${NC}"
    exit 1
fi

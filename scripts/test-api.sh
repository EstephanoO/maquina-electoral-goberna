#!/usr/bin/env bash
#
# GOBERNA — API Smoke Test Script
# Tests every endpoint in the backend against a running instance.
#
# Usage:
#   ./scripts/test-api.sh                   # test localhost:3001
#   ./scripts/test-api.sh http://161.132.39.165  # test production
#
# Prerequisites:
#   - Backend running (bun run dev or docker compose up)
#   - DB seeded (bun run seed)
#   - jq installed
#
set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
PASS=0
FAIL=0
SKIP=0
ERRORS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────

log_pass() {
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC} $1"
}

log_fail() {
  FAIL=$((FAIL + 1))
  ERRORS+=("$1: $2")
  echo -e "  ${RED}FAIL${NC} $1 — $2"
}

log_skip() {
  SKIP=$((SKIP + 1))
  echo -e "  ${YELLOW}SKIP${NC} $1 — $2"
}

log_section() {
  echo ""
  echo -e "${CYAN}══ $1 ══${NC}"
}

# Expect HTTP status code
assert_status() {
  local desc="$1" expected="$2" actual="$3" body="$4"
  if [ "$actual" = "$expected" ]; then
    log_pass "$desc (HTTP $actual)"
  else
    log_fail "$desc" "expected $expected, got $actual — $(echo "$body" | head -c 200)"
  fi
}

# GET request
GET() {
  local path="$1"
  local headers="${2:-}"
  if [ -n "$headers" ]; then
    curl -s -w "\n%{http_code}" "$BASE_URL$path" $headers
  else
    curl -s -w "\n%{http_code}" "$BASE_URL$path"
  fi
}

# POST request
POST() {
  local path="$1" body="$2"
  local headers="${3:-}"
  if [ -n "$headers" ]; then
    curl -s -w "\n%{http_code}" -X POST "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -d "$body" $headers
  else
    curl -s -w "\n%{http_code}" -X POST "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -d "$body"
  fi
}

# PUT request
PUT() {
  local path="$1" body="$2"
  local headers="${3:-}"
  if [ -n "$headers" ]; then
    curl -s -w "\n%{http_code}" -X PUT "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -d "$body" $headers
  else
    curl -s -w "\n%{http_code}" -X PUT "$BASE_URL$path" \
      -H "Content-Type: application/json" \
      -d "$body"
  fi
}

# Parse response: body on stdout, status code returned
parse_response() {
  local response="$1"
  local body status
  status=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  echo "$body"
  return 0
}

get_status() {
  echo "$1" | tail -1
}

get_body() {
  echo "$1" | sed '$d'
}

# ═════════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  GOBERNA API Smoke Tests                              ║${NC}"
echo -e "${CYAN}║  Target: ${BASE_URL}$(printf '%*s' $((34 - ${#BASE_URL})) '')║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"

# ═════════════════════════════════════════════════════════════════════
log_section "HEALTH"
# ═════════════════════════════════════════════════════════════════════

RES=$(GET "/api/health")
STATUS=$(get_status "$RES")
BODY=$(get_body "$RES")
assert_status "GET /api/health" "200" "$STATUS" "$BODY"

RES=$(GET "/api/ready")
STATUS=$(get_status "$RES")
BODY=$(get_body "$RES")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "503" ]; then
  log_pass "GET /api/ready (HTTP $STATUS)"
else
  log_fail "GET /api/ready" "expected 200 or 503, got $STATUS"
fi

RES=$(GET "/api/agents/health")
STATUS=$(get_status "$RES")
BODY=$(get_body "$RES")
assert_status "GET /api/agents/health" "200" "$STATUS" "$BODY"

# ═════════════════════════════════════════════════════════════════════
log_section "PUBLIC ENDPOINTS"
# ═════════════════════════════════════════════════════════════════════

RES=$(GET "/api/candidates")
STATUS=$(get_status "$RES")
BODY=$(get_body "$RES")
assert_status "GET /api/candidates" "200" "$STATUS" "$BODY"

RES=$(GET "/api/config")
STATUS=$(get_status "$RES")
BODY=$(get_body "$RES")
assert_status "GET /api/config" "200" "$STATUS" "$BODY"

# ═════════════════════════════════════════════════════════════════════
log_section "AUTH — Login"
# ═════════════════════════════════════════════════════════════════════

# Login as admin
RES=$(POST "/api/auth/login" '{"email":"admin@goberna.pe","password":"Admin1234!"}')
STATUS=$(get_status "$RES")
BODY=$(get_body "$RES")
assert_status "POST /api/auth/login (admin)" "200" "$STATUS" "$BODY"

if [ "$STATUS" = "200" ]; then
  ADMIN_TOKEN=$(echo "$BODY" | jq -r '.access_token // empty')
  ADMIN_REFRESH=$(echo "$BODY" | jq -r '.refresh_token // empty')
  ADMIN_ID=$(echo "$BODY" | jq -r '.user.id // empty')
  CAMPAIGN_ID=$(echo "$BODY" | jq -r '.campaigns[0].id // empty')

  if [ -z "$ADMIN_TOKEN" ]; then
    log_fail "Admin login" "no access_token in response"
  else
    echo "  Token obtained. Admin ID: $ADMIN_ID"
    echo "  Campaign ID: $CAMPAIGN_ID"
  fi
else
  ADMIN_TOKEN=""
  ADMIN_REFRESH=""
  ADMIN_ID=""
  CAMPAIGN_ID=""
  log_skip "Remaining tests" "admin login failed"
fi

AUTH="-H \"Authorization: Bearer $ADMIN_TOKEN\""

# ── Login validation ─────────────────────────────────────────────────
RES=$(POST "/api/auth/login" '{"email":"bad@bad.com","password":"wrong"}')
STATUS=$(get_status "$RES")
assert_status "POST /api/auth/login (wrong creds)" "401" "$STATUS" "$(get_body "$RES")"

RES=$(POST "/api/auth/login" '{"email":"not-an-email"}')
STATUS=$(get_status "$RES")
assert_status "POST /api/auth/login (bad payload)" "400" "$STATUS" "$(get_body "$RES")"

# ═════════════════════════════════════════════════════════════════════
log_section "AUTH — Refresh & Me"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ]; then
  # Refresh
  if [ -n "$ADMIN_REFRESH" ]; then
    RES=$(POST "/api/auth/refresh" "{\"refresh_token\":\"$ADMIN_REFRESH\"}")
    STATUS=$(get_status "$RES")
    BODY=$(get_body "$RES")
    assert_status "POST /api/auth/refresh" "200" "$STATUS" "$BODY"
    # Update token
    NEW_TOKEN=$(echo "$BODY" | jq -r '.access_token // empty')
    if [ -n "$NEW_TOKEN" ]; then
      ADMIN_TOKEN="$NEW_TOKEN"
    fi
  fi

  # Me
  RES=$(GET "/api/auth/me" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/auth/me" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "AUTH — Register"
# ═════════════════════════════════════════════════════════════════════

RANDOM_EMAIL="testuser-$(date +%s)@test.com"
RES=$(POST "/api/auth/register" "{\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test12345!\",\"full_name\":\"Test User\"}")
STATUS=$(get_status "$RES")
BODY=$(get_body "$RES")
assert_status "POST /api/auth/register (open)" "201" "$STATUS" "$BODY"

# Verify pending status
USER_STATUS=$(echo "$BODY" | jq -r '.user.status // empty')
if [ "$USER_STATUS" = "pending" ]; then
  log_pass "Register: user status is 'pending'"
elif [ "$USER_STATUS" = "active" ]; then
  log_fail "Register: open registration" "expected pending, got active"
fi

# Duplicate email
RES=$(POST "/api/auth/register" "{\"email\":\"$RANDOM_EMAIL\",\"password\":\"Test12345!\",\"full_name\":\"Test User\"}")
STATUS=$(get_status "$RES")
assert_status "POST /api/auth/register (duplicate)" "409" "$STATUS" "$(get_body "$RES")"

# Invalid invitation
RES=$(POST "/api/auth/register" "{\"email\":\"inv-$(date +%s)@test.com\",\"password\":\"Test12345!\",\"full_name\":\"Test\",\"invitation_code\":\"BADCODE\"}")
STATUS=$(get_status "$RES")
assert_status "POST /api/auth/register (bad invitation)" "404" "$STATUS" "$(get_body "$RES")"

# ═════════════════════════════════════════════════════════════════════
log_section "CAMPAIGNS"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ]; then
  # List campaigns
  RES=$(GET "/api/campaigns" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/campaigns" "200" "$STATUS" "$(get_body "$RES")"

  if [ -n "$CAMPAIGN_ID" ]; then
    # Get single campaign
    RES=$(GET "/api/campaigns/$CAMPAIGN_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/campaigns/:id" "200" "$STATUS" "$(get_body "$RES")"

    # Campaign members
    RES=$(GET "/api/campaigns/$CAMPAIGN_ID/members" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/campaigns/:id/members" "200" "$STATUS" "$(get_body "$RES")"
  fi

  # 404 campaign
  RES=$(GET "/api/campaigns/00000000-0000-0000-0000-000000000000" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/campaigns/:id (404)" "404" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "FORM DEFINITIONS"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CAMPAIGN_ID" ]; then
  # List all
  RES=$(GET "/api/form-definitions" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/form-definitions" "200" "$STATUS" "$(get_body "$RES")"

  # Active for campaign
  RES=$(GET "/api/form-definitions/active?campaign_id=$CAMPAIGN_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/form-definitions/active" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "FORMS (legacy)"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CAMPAIGN_ID" ]; then
  RES=$(GET "/api/forms" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/forms" "200" "$STATUS" "$(get_body "$RES")"

  RES=$(GET "/api/forms/recent" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/forms/recent" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "FORM SUBMISSIONS (new)"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CAMPAIGN_ID" ]; then
  # POST single submission
  CLIENT_ID="test-$(date +%s)-$$"
  RES=$(POST "/api/form-submissions" "{\"client_id\":\"$CLIENT_ID\",\"data\":{\"nombre\":\"Test User\",\"telefono\":\"999999999\"}}" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  BODY=$(get_body "$RES")
  assert_status "POST /api/form-submissions" "201" "$STATUS" "$BODY"

  # POST single — duplicate client_id (idempotent, accepted=0)
  RES=$(POST "/api/form-submissions" "{\"client_id\":\"$CLIENT_ID\",\"data\":{\"nombre\":\"Duplicate\"}}" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  BODY=$(get_body "$RES")
  ACCEPTED=$(echo "$BODY" | jq -r '.accepted // empty')
  if [ "$STATUS" = "201" ] && [ "$ACCEPTED" = "0" ]; then
    log_pass "POST /api/form-submissions (dedupe: accepted=0)"
  else
    log_fail "POST /api/form-submissions (dedupe)" "expected 201 with accepted=0, got $STATUS accepted=$ACCEPTED"
  fi

  # POST batch
  BATCH_CID1="batch-$(date +%s)-1-$$"
  BATCH_CID2="batch-$(date +%s)-2-$$"
  RES=$(POST "/api/form-submissions/batch" "{\"submissions\":[{\"client_id\":\"$BATCH_CID1\",\"data\":{\"x\":1}},{\"client_id\":\"$BATCH_CID2\",\"data\":{\"x\":2}}]}" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  BODY=$(get_body "$RES")
  assert_status "POST /api/form-submissions/batch" "201" "$STATUS" "$BODY"

  # POST — bad payload (missing client_id)
  RES=$(POST "/api/form-submissions" "{\"data\":{\"nombre\":\"Bad\"}}" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  assert_status "POST /api/form-submissions (bad payload)" "400" "$STATUS" "$(get_body "$RES")"

  # GET endpoints
  RES=$(GET "/api/form-submissions" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/form-submissions" "200" "$STATUS" "$(get_body "$RES")"

  RES=$(GET "/api/form-submissions/recent" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/form-submissions/recent" "200" "$STATUS" "$(get_body "$RES")"

  RES=$(GET "/api/form-submissions/stats" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/form-submissions/stats" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "MEETS"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CAMPAIGN_ID" ]; then
  # Create meet
  STARTS_AT=$(date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "2026-03-01T10:00:00Z")
  RES=$(POST "/api/meets" "{\"campaign_id\":\"$CAMPAIGN_ID\",\"title\":\"Test Meet\",\"starts_at\":\"$STARTS_AT\",\"meet_type\":\"recoleccion\"}" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  BODY=$(get_body "$RES")
  assert_status "POST /api/meets" "201" "$STATUS" "$BODY"

  MEET_ID=$(echo "$BODY" | jq -r '.meet.id // empty')

  # List active
  RES=$(GET "/api/meets/active" "-H \"Authorization: Bearer $ADMIN_TOKEN\" -H \"x-campaign-id: $CAMPAIGN_ID\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/meets/active" "200" "$STATUS" "$(get_body "$RES")"

  # List by campaign
  RES=$(GET "/api/meets/campaign/$CAMPAIGN_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/meets/campaign/:id" "200" "$STATUS" "$(get_body "$RES")"

  if [ -n "$MEET_ID" ]; then
    # Get meet
    RES=$(GET "/api/meets/$MEET_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/meets/:id" "200" "$STATUS" "$(get_body "$RES")"

    # Summary
    RES=$(GET "/api/meets/$MEET_ID/summary" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/meets/:id/summary" "200" "$STATUS" "$(get_body "$RES")"

    # Participants
    RES=$(GET "/api/meets/$MEET_ID/participants" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/meets/:id/participants" "200" "$STATUS" "$(get_body "$RES")"

    # Update status
    RES=$(PUT "/api/meets/$MEET_ID/status" '{"status":"completed"}' "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "PUT /api/meets/:id/status" "200" "$STATUS" "$(get_body "$RES")"
  fi
fi

# ═════════════════════════════════════════════════════════════════════
log_section "ZONES"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CAMPAIGN_ID" ]; then
  # Create zone
  RES=$(POST "/api/zones" "{\"campaign_id\":\"$CAMPAIGN_ID\",\"name\":\"Zona Test\",\"center_lat\":-12.046,\"center_lng\":-77.042,\"radius_meters\":300}" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  BODY=$(get_body "$RES")
  assert_status "POST /api/zones" "201" "$STATUS" "$BODY"

  ZONE_ID=$(echo "$BODY" | jq -r '.zone.id // empty')

  # List by campaign
  RES=$(GET "/api/zones/campaign/$CAMPAIGN_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/zones/campaign/:id" "200" "$STATUS" "$(get_body "$RES")"

  # GeoJSON
  RES=$(GET "/api/zones/campaign/$CAMPAIGN_ID/geojson" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/zones/campaign/:id/geojson" "200" "$STATUS" "$(get_body "$RES")"

  if [ -n "$ZONE_ID" ]; then
    # Get single
    RES=$(GET "/api/zones/$ZONE_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/zones/:id" "200" "$STATUS" "$(get_body "$RES")"
  fi
fi

# ═════════════════════════════════════════════════════════════════════
log_section "INVITATIONS"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CAMPAIGN_ID" ]; then
  # Create invitation
  RES=$(POST "/api/invitations" "{\"campaign_id\":\"$CAMPAIGN_ID\",\"role\":\"agente_campo\",\"max_uses\":5,\"expires_in_hours\":24}" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  BODY=$(get_body "$RES")
  assert_status "POST /api/invitations" "201" "$STATUS" "$BODY"

  INV_CODE=$(echo "$BODY" | jq -r '.invitation.code // empty')
  INV_ID=$(echo "$BODY" | jq -r '.invitation.id // empty')

  # List by campaign
  RES=$(GET "/api/invitations/campaign/$CAMPAIGN_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/invitations/campaign/:id" "200" "$STATUS" "$(get_body "$RES")"

  if [ -n "$INV_CODE" ]; then
    # Validate code (public)
    RES=$(GET "/api/invitations/validate/$INV_CODE")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/invitations/validate/:code" "200" "$STATUS" "$(get_body "$RES")"

    # Register with invitation
    INV_EMAIL="inv-$(date +%s)@test.com"
    RES=$(POST "/api/auth/register" "{\"email\":\"$INV_EMAIL\",\"password\":\"Test12345!\",\"full_name\":\"Invited User\",\"invitation_code\":\"$INV_CODE\"}")
    STATUS=$(get_status "$RES")
    BODY=$(get_body "$RES")
    assert_status "POST /api/auth/register (with invite)" "201" "$STATUS" "$BODY"

    INV_USER_STATUS=$(echo "$BODY" | jq -r '.user.status // empty')
    if [ "$INV_USER_STATUS" = "active" ]; then
      log_pass "Invited user is immediately active"
    else
      log_fail "Invited user status" "expected active, got $INV_USER_STATUS"
    fi
  fi
fi

# ═════════════════════════════════════════════════════════════════════
log_section "ORG HIERARCHY"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ] && [ -n "$CAMPAIGN_ID" ]; then
  RES=$(GET "/api/org-hierarchy/campaign/$CAMPAIGN_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/org-hierarchy/campaign/:id" "200" "$STATUS" "$(get_body "$RES")"

  if [ -n "$ADMIN_ID" ]; then
    RES=$(GET "/api/org-hierarchy/campaign/$CAMPAIGN_ID/subordinates/$ADMIN_ID" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
    STATUS=$(get_status "$RES")
    assert_status "GET /api/org-hierarchy/.../subordinates/:id" "200" "$STATUS" "$(get_body "$RES")"
  fi
fi

# ═════════════════════════════════════════════════════════════════════
log_section "ACCESS REQUESTS"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ]; then
  RES=$(GET "/api/access-requests/mine" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/access-requests/mine" "200" "$STATUS" "$(get_body "$RES")"

  RES=$(GET "/api/access-requests/pending" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/access-requests/pending" "200" "$STATUS" "$(get_body "$RES")"

  RES=$(GET "/api/access-requests" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/access-requests" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "AGENTS — No-auth checks"
# ═════════════════════════════════════════════════════════════════════

# Location without token should fail
RES=$(POST "/api/agents/location" '{"agent_id":"test","ts":"2026-01-01T00:00:00Z","lat":-12.0,"lng":-77.0,"seq":1}')
STATUS=$(get_status "$RES")
assert_status "POST /api/agents/location (no token)" "401" "$STATUS" "$(get_body "$RES")"

# Live requires JWT
RES=$(GET "/api/agents/live")
STATUS=$(get_status "$RES")
assert_status "GET /api/agents/live (no auth)" "401" "$STATUS" "$(get_body "$RES")"

# ═════════════════════════════════════════════════════════════════════
log_section "AGENTS — Auth checks"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ]; then
  RES=$(GET "/api/agents/live" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/agents/live (admin)" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "METRICS (admin only)"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ]; then
  RES=$(GET "/api/metrics" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/metrics" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "OPS/SYSTEM (admin only)"
# ═════════════════════════════════════════════════════════════════════

if [ -n "$ADMIN_TOKEN" ]; then
  RES=$(GET "/api/ops/system" "-H \"Authorization: Bearer $ADMIN_TOKEN\"")
  STATUS=$(get_status "$RES")
  assert_status "GET /api/ops/system" "200" "$STATUS" "$(get_body "$RES")"
fi

# ═════════════════════════════════════════════════════════════════════
log_section "404 handling"
# ═════════════════════════════════════════════════════════════════════

RES=$(GET "/api/nonexistent")
STATUS=$(get_status "$RES")
assert_status "GET /api/nonexistent (404)" "404" "$STATUS" "$(get_body "$RES")"

# ═════════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════════

TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}  ${YELLOW}SKIP: $SKIP${NC}  TOTAL: $TOTAL"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Failures:${NC}"
  for err in "${ERRORS[@]}"; do
    echo -e "  - $err"
  done
fi

echo ""
exit $FAIL

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# VPS Diagnostic Script — Goberna Platform
# Run: bash /srv/app/scripts/ops/vps-diagnostic.sh
# Output: paste the entire output to your dev for analysis
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SEP="════════════════════════════════════════════════════════════════"

section() { printf "\n%s\n[%s] %s\n%s\n" "$SEP" "$(date '+%H:%M:%S')" "$1" "$SEP"; }

# ── 1. SYSTEM ────────────────────────────────────────────────────────
section "1. SYSTEM INFO"
uname -a
echo "---"
echo "CPUs: $(nproc)"
free -h
echo "---"
df -h / /srv 2>/dev/null || df -h /
echo "---"
uptime

# ── 2. DOCKER ────────────────────────────────────────────────────────
section "2. DOCKER CONTAINERS"
docker compose ps -a 2>/dev/null || docker-compose ps -a
echo "---"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.PIDs}}" 2>/dev/null || true

section "2b. DOCKER IMAGES (size)"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" | head -20

section "2c. DOCKER VOLUMES"
docker system df -v 2>/dev/null | head -40

section "2d. DANGLING IMAGES / VOLUMES"
echo "Dangling images:"
docker images -f "dangling=true" -q | wc -l
echo "Dangling volumes:"
docker volume ls -f "dangling=true" -q | wc -l
echo "Build cache size:"
docker builder prune --dry-run 2>/dev/null | tail -3 || echo "(not available)"

# ── 3. HEALTH CHECKS ────────────────────────────────────────────────
section "3. HEALTH CHECKS"
echo "--- /api/health ---"
curl -sS --max-time 5 http://127.0.0.1/api/health 2>&1 || echo "FAILED"
echo ""
echo "--- /api/ready ---"
curl -sS --max-time 10 http://127.0.0.1/api/ready 2>&1 || echo "FAILED"
echo ""
echo "--- /api/agents/health ---"
curl -sS --max-time 5 http://127.0.0.1/api/agents/health 2>&1 || echo "FAILED"

# ── 4. NETWORK / PORTS ──────────────────────────────────────────────
section "4. EXPOSED PORTS (host-level)"
ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo "(neither ss nor netstat available)"

section "4b. FIREWALL RULES"
if command -v ufw &>/dev/null; then
  ufw status verbose 2>/dev/null || echo "(ufw not active)"
elif command -v iptables &>/dev/null; then
  iptables -L INPUT -n --line-numbers 2>/dev/null | head -30 || echo "(iptables not accessible)"
else
  echo "(no firewall tool found)"
fi

# ── 5. POSTGRESQL ────────────────────────────────────────────────────
section "5. POSTGRESQL"
docker compose exec -T postgres pg_isready 2>/dev/null || echo "pg_isready FAILED"
echo "---"
echo "DB size:"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -c "
  SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
" 2>/dev/null || echo "(query failed)"
echo "---"
echo "Table sizes (top 15):"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -c "
  SELECT schemaname||'.'||relname AS table,
         pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
         pg_size_pretty(pg_relation_size(relid)) AS data_size,
         pg_size_pretty(pg_indexes_size(relid)) AS index_size,
         n_live_tup AS row_estimate
  FROM pg_stat_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 15;
" 2>/dev/null || echo "(query failed)"
echo "---"
echo "Migrations applied:"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -c "
  SELECT name, applied_at FROM _migrations ORDER BY applied_at;
" 2>/dev/null || echo "(query failed)"
echo "---"
echo "Dead tuples (needs VACUUM?):"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -c "
  SELECT schemaname||'.'||relname AS table,
         n_dead_tup,
         n_live_tup,
         CASE WHEN n_live_tup > 0
              THEN round(100.0 * n_dead_tup / n_live_tup, 1)
              ELSE 0 END AS dead_pct,
         last_vacuum,
         last_autovacuum
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 1000
  ORDER BY n_dead_tup DESC
  LIMIT 10;
" 2>/dev/null || echo "(no tables with >1000 dead tuples)"
echo "---"
echo "Long-running queries:"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
    AND state != 'idle'
  ORDER BY duration DESC
  LIMIT 5;
" 2>/dev/null || echo "(query failed)"
echo "---"
echo "Connection pool:"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -c "
  SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY count DESC;
" 2>/dev/null || echo "(query failed)"
echo "---"
echo "Index usage (unused indexes):"
docker compose exec -T postgres psql -U "${POSTGRES_USER:-appuser}" -d "${POSTGRES_DB:-appdb}" -c "
  SELECT schemaname||'.'||relname AS table,
         indexrelname AS index,
         pg_size_pretty(pg_relation_size(indexrelid)) AS size,
         idx_scan
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
    AND pg_relation_size(indexrelid) > 8192
  ORDER BY pg_relation_size(indexrelid) DESC
  LIMIT 10;
" 2>/dev/null || echo "(query failed)"

# ── 6. REDIS ─────────────────────────────────────────────────────────
section "6. REDIS"
REDIS_PASS="${REDIS_PASSWORD:-}"
REDIS_CMD="redis-cli"
[ -n "$REDIS_PASS" ] && REDIS_CMD="redis-cli -a $REDIS_PASS --no-auth-warning"

echo "PING:"
docker compose exec -T redis $REDIS_CMD ping 2>/dev/null || echo "PING FAILED"
echo "---"
echo "INFO memory:"
docker compose exec -T redis $REDIS_CMD INFO memory 2>/dev/null | grep -E "used_memory_human|maxmemory_human|mem_fragmentation_ratio" || echo "(failed)"
echo "---"
echo "INFO keyspace:"
docker compose exec -T redis $REDIS_CMD INFO keyspace 2>/dev/null || echo "(failed)"
echo "---"
echo "Stream lengths:"
for key in tracking:events forms:events tracking:dlq forms:dlq; do
  len=$(docker compose exec -T redis $REDIS_CMD XLEN "$key" 2>/dev/null || echo "0")
  echo "  $key: $len"
done
echo "---"
echo "Consumer group lag:"
for key in tracking:events forms:events; do
  echo "  --- $key ---"
  docker compose exec -T redis $REDIS_CMD XINFO GROUPS "$key" 2>/dev/null || echo "  (no group)"
done
echo "---"
echo "Dedupe keys count:"
docker compose exec -T redis $REDIS_CMD EVAL "return #redis.call('KEYS','forms:dedupe:*')" 0 2>/dev/null || echo "(failed)"
echo "---"
echo "Total key count:"
docker compose exec -T redis $REDIS_CMD DBSIZE 2>/dev/null || echo "(failed)"

# ── 7. TEGOLA ────────────────────────────────────────────────────────
section "7. TEGOLA"
echo "Capabilities:"
curl -sS --max-time 5 http://127.0.0.1:8080/capabilities 2>/dev/null | head -5 || \
  docker compose exec -T backend curl -sS --max-time 5 http://tegola:8080/capabilities 2>/dev/null | head -5 || \
  echo "TEGOLA NOT REACHABLE"

# ── 8. NGINX ─────────────────────────────────────────────────────────
section "8. NGINX"
echo "Config test:"
docker compose exec -T nginx nginx -t 2>&1 || echo "NGINX CONFIG FAILED"
echo "---"
echo "Active template:"
docker compose exec -T nginx cat /etc/nginx/conf.d/default.conf 2>/dev/null | head -5 || echo "(failed)"
echo "---"
echo "Active connections:"
docker compose exec -T nginx sh -c 'curl -sS http://127.0.0.1/nginx_status 2>/dev/null || echo "(stub_status not enabled)"'

# ── 9. BACKEND LOGS (last 30 lines) ─────────────────────────────────
section "9. BACKEND LOGS (recent errors)"
docker compose logs --tail=100 backend 2>/dev/null | grep -iE "error|fatal|panic|crash|ECONNREFUSED|ECONNRESET|timeout" | tail -30 || echo "(no recent errors)"

# ── 10. DISK JUNK / LARGE FILES ──────────────────────────────────────
section "10. DISK: LARGE FILES IN /srv"
find /srv -type f -size +50M -exec ls -lh {} \; 2>/dev/null | sort -k5 -rh | head -20 || echo "(none found)"

section "10b. DISK: OLD BACKUPS"
ls -lh /srv/backups/ 2>/dev/null || echo "(no /srv/backups)"

section "10c. DISK: OLD DOCKER LOGS"
find /var/lib/docker/containers/ -name "*.log" -size +50M -exec ls -lh {} \; 2>/dev/null | head -10 || echo "(none or no access)"

section "10d. DISK: TEMP / JUNK"
echo "--- /tmp ---"
du -sh /tmp 2>/dev/null || echo "(n/a)"
echo "--- apt cache ---"
du -sh /var/cache/apt 2>/dev/null || echo "(n/a)"
echo "--- journal ---"
journalctl --disk-usage 2>/dev/null || echo "(n/a)"

# ── 11. CRONS ────────────────────────────────────────────────────────
section "11. ACTIVE CRON JOBS"
crontab -l 2>/dev/null || echo "(no crontab for $(whoami))"
echo "---"
echo "root crontab:"
sudo crontab -l 2>/dev/null || echo "(no root crontab or no sudo)"

# ── 12. SSL / CERTS ─────────────────────────────────────────────────
section "12. SSL CERTIFICATES"
if [ -f /srv/app/nginx/certs/origin.crt ]; then
  echo "Origin cert found:"
  openssl x509 -in /srv/app/nginx/certs/origin.crt -noout -subject -dates 2>/dev/null || echo "(parse failed)"
elif [ -d /etc/letsencrypt/live ]; then
  echo "Let's Encrypt certs:"
  ls -la /etc/letsencrypt/live/ 2>/dev/null
else
  echo "No SSL certs found"
fi

# ── 13. BACKEND METRICS ─────────────────────────────────────────────
section "13. BACKEND METRICS SNAPSHOT"
# Try via internal network first, then via nginx
METRICS=$(curl -sS --max-time 5 http://127.0.0.1/api/metrics -H "Authorization: Bearer SKIP" 2>/dev/null || echo "")
if echo "$METRICS" | grep -q '"ok":true'; then
  echo "$METRICS" | python3 -m json.tool 2>/dev/null || echo "$METRICS"
else
  echo "(metrics endpoint requires auth — expected)"
fi

# ── 14. ENV SANITY CHECK ────────────────────────────────────────────
section "14. ENV FILE SANITY (no secrets shown)"
ENV_FILE="/srv/app/.env"
if [ -f "$ENV_FILE" ]; then
  echo "Vars defined: $(grep -c '=' "$ENV_FILE" 2>/dev/null || echo 0)"
  echo "---"
  echo "Key vars present (yes/no):"
  for var in DATABASE_URL REDIS_URL REDIS_PASSWORD JWT_SECRET AGENT_INGEST_TOKEN FRONTEND_ORIGINS BACKEND_PORT POSTGRES_PASSWORD; do
    if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
      echo "  $var: YES"
    else
      echo "  $var: MISSING"
    fi
  done
  echo "---"
  echo "BACKEND_PORT value: $(grep '^BACKEND_PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo 'not set')"
  echo "DB_SSL_MODE value: $(grep '^DB_SSL_MODE=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo 'not set')"
  echo "LOG_LEVEL value: $(grep '^LOG_LEVEL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo 'not set')"
  echo "TZ value: $(grep '^TZ=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo 'not set')"
else
  echo "NO .env FILE AT $ENV_FILE"
fi

# ── 15. GIT STATUS ──────────────────────────────────────────────────
section "15. GIT STATUS"
cd /srv/app 2>/dev/null || cd /srv/app
git log --oneline -5 2>/dev/null || echo "(not a git repo)"
echo "---"
git status --short 2>/dev/null || echo "(n/a)"
echo "---"
echo "Current branch: $(git branch --show-current 2>/dev/null || echo 'n/a')"
echo "Behind remote: $(git rev-list --count HEAD..origin/main 2>/dev/null || echo 'n/a') commits"

# ── DONE ─────────────────────────────────────────────────────────────
section "DIAGNOSTIC COMPLETE"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Paste this entire output to your dev for analysis."

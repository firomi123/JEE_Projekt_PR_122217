#!/usr/bin/env bash
# Chaos test of the watchdogs: breaks the running Docker stack on purpose and checks
# that every failure is detected and repaired (or reported) automatically.
#
# Usage (from the repository root, with the stack running: npm run docker:up):
#   bash monitoring/chaos-test.sh            # all scenarios (about 5–8 minutes)
#   bash monitoring/chaos-test.sh config     # only promtool / amtool checks
#   bash monitoring/chaos-test.sh db         # only scenario 4 (database outage)
#
# Scenarios:
#   1. backend process crashes (SIGKILL inside the container) -> restart policy
#      brings the container back, healthy again. (`docker kill` would not work:
#      Docker treats it as a manual stop and does not apply the restart policy.)
#   2. docker stop backend             -> graceful shutdown: exit code 0 within 15 s
#   3. backend process frozen (STOP)   -> healthcheck "unhealthy" -> autoheal restarts it
#   4. PostgreSQL stopped              -> ServiceDown alert active in Alertmanager
#   5. configuration                   -> promtool check rules/config, amtool check-config
set -euo pipefail

export MSYS_NO_PATHCONV=1 # Git Bash on Windows: do not rewrite /paths in docker args
cd "$(dirname "$0")/.."
ROOT="$(pwd -W 2>/dev/null || pwd)"
PASSED=0
FAILED=0

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok() { printf '  \033[32mOK\033[0m   %s\n' "$*"; PASSED=$((PASSED + 1)); }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAILED=$((FAILED + 1)); }

# Container id of a Compose service (-a: also when the container is stopped).
cid() { docker compose ps -aq "$1"; }
# Health status (healthy / unhealthy / starting) of a service's container.
health() { docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$(cid "$1")" 2>/dev/null || echo missing; }
# Start time of a service's container (changes on every restart).
started() { docker inspect -f '{{.State.StartedAt}}' "$(cid "$1")"; }

# wait_until <timeout-seconds> <description> <command...>: polls every 3 s and
# records OK or FAIL (never aborts the script).
wait_until() {
  local timeout=$1 what=$2
  shift 2
  local start=$SECONDS
  until "$@" >/dev/null 2>&1; do
    if ((SECONDS - start > timeout)); then
      fail "$what (not within ${timeout}s)"
      return 0 # counted as a failure; keep going so every scenario is reported
    fi
    sleep 3
  done
  ok "$what (after $((SECONDS - start))s)"
}

is_healthy() { [ "$(health "$1")" = healthy ]; }
restarted_since() { [ "$(started "$1")" != "$2" ]; }
alert_active() { curl -fsS "http://127.0.0.1:${ALERTMANAGER_PORT:-9093}/api/v2/alerts?active=true&silenced=false&inhibited=false" | grep -q "\"alertname\":\"$1\""; }
no_alert() { ! alert_active "$1"; }

database_outage() {
  log '4. PostgreSQL stopped -> ServiceDown and PostgresDown alerts'
  # Start from a clean state: an earlier scenario may have left ServiceDown firing.
  wait_until 300 'no ServiceDown alert active before the test' no_alert ServiceDown
  docker compose stop postgres >/dev/null 2>&1
  wait_until 240 'ServiceDown alert active in Alertmanager' alert_active ServiceDown
  wait_until 180 'PostgresDown alert active in Alertmanager' alert_active PostgresDown
  docker compose start postgres >/dev/null 2>&1
  wait_until 90 'PostgreSQL healthy again' is_healthy postgres
  wait_until 300 'ServiceDown alert resolved' no_alert ServiceDown
}

check_config() {
  log '5. Configuration checks (promtool, amtool)'
  if docker run --rm --entrypoint promtool -v "$ROOT/monitoring/prometheus:/etc/prometheus:ro" \
    prom/prometheus:v3.14.0 check config /etc/prometheus/prometheus.yml; then
    ok 'promtool check config (includes the alert rules)'
  else
    fail 'promtool check config'
  fi
  if docker run --rm --entrypoint amtool -v "$ROOT/monitoring/alertmanager:/cfg:ro" \
    prom/alertmanager:v0.34.1 check-config /cfg/alertmanager.yml; then
    ok 'amtool check-config'
  else
    fail 'amtool check-config'
  fi
}

if [ "${1:-all}" = config ]; then
  check_config
elif [ "${1:-all}" = db ]; then
  database_outage
else
  log '1. Backend process crash (node killed with SIGKILL inside the container)'
  before=$(started backend)
  docker compose exec -T backend sh -c 'kill -KILL $(pidof node)' || true
  wait_until 60 'backend restarted by the restart policy' restarted_since backend "$before"
  wait_until 90 'backend healthy again' is_healthy backend

  log '2. docker stop backend (SIGTERM, graceful shutdown)'
  t0=$SECONDS
  docker compose stop backend >/dev/null 2>&1
  took=$((SECONDS - t0))
  code=$(docker inspect -f '{{.State.ExitCode}}' "$(cid backend)")
  if [ "$code" = 0 ] && [ "$took" -lt 15 ]; then
    ok "graceful shutdown: exit code 0 after ${took}s"
  else
    fail "graceful shutdown: exit code $code after ${took}s"
  fi
  docker compose start backend >/dev/null 2>&1
  wait_until 90 'backend healthy after start' is_healthy backend

  log '3. Frozen backend process (SIGSTOP) -> unhealthy -> autoheal'
  before=$(started backend)
  docker compose exec -T backend sh -c 'kill -STOP $(pidof node)'
  wait_until 90 'Docker marks the backend unhealthy' sh -c "[ \"\$(docker inspect -f '{{.State.Health.Status}}' $(cid backend))\" = unhealthy ] || [ \"\$(docker inspect -f '{{.State.StartedAt}}' $(cid backend))\" != '$before' ]"
  wait_until 90 'autoheal restarted the backend' restarted_since backend "$before"
  wait_until 90 'backend healthy again' is_healthy backend
  docker compose logs autoheal --no-log-prefix 2>/dev/null | grep -i 'restart' | tail -1 | sed 's/^/  autoheal: /' || true

  database_outage
  check_config
fi

log "Result: $PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]

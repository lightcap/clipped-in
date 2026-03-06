#!/bin/bash
set -euo pipefail

# Manages per-PR preview Supabase stacks on a remote Hetzner server.
#
# Usage:
#   ./scripts/preview-db.sh up <pr-number>
#   ./scripts/preview-db.sh down <pr-number>
#
# Required env vars (set by GitHub Action):
#   DEV_INFRA_SSH_KEY    - Private SSH key for the server
#   DEV_INFRA_SERVER_IP  - Hetzner server IP
#   DEV_INFRA_DOMAIN     - Base domain (e.g. sb.dev.example.com)
#
# Optional env vars:
#   SUPABASE_PORT_BASE   - Base port for stacks (default: 54320)
#   SUPABASE_PORT_BLOCK  - Port block size per stack (default: 20)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."

COMMAND="${1:-}"
PR_NUMBER="${2:-}"

if [[ -z "$COMMAND" || -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <up|down> <pr-number>"
  exit 1
fi

STACK_NAME="pr-${PR_NUMBER}"

# ── Validate required env vars ──
for var in DEV_INFRA_SSH_KEY DEV_INFRA_SERVER_IP DEV_INFRA_DOMAIN; do
  if [[ -z "${!var:-}" ]]; then
    echo "Error: ${var} is not set"
    exit 1
  fi
done

# ── SSH setup ──
SSH_KEY_FILE=$(mktemp)
trap 'rm -f "$SSH_KEY_FILE"' EXIT
echo "$DEV_INFRA_SSH_KEY" > "$SSH_KEY_FILE"
chmod 600 "$SSH_KEY_FILE"

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -i $SSH_KEY_FILE"
SERVER="root@${DEV_INFRA_SERVER_IP}"

# Build remote env prefix for stack.sh (domain + port config)
REMOTE_ENV="DEV_DOMAIN=${DEV_INFRA_DOMAIN}"
[[ -n "${SUPABASE_PORT_BASE:-}" ]] && REMOTE_ENV="${REMOTE_ENV} SUPABASE_PORT_BASE=${SUPABASE_PORT_BASE}"
[[ -n "${SUPABASE_PORT_BLOCK:-}" ]] && REMOTE_ENV="${REMOTE_ENV} SUPABASE_PORT_BLOCK=${SUPABASE_PORT_BLOCK}"

# ── Commands ──

cmd_up() {
  echo "Setting up preview DB for PR #${PR_NUMBER}..."

  # Check if stack exists
  # shellcheck disable=SC2086
  STACK_EXISTS=$(ssh $SSH_OPTS "$SERVER" \
    "test -d /opt/supabase/stacks/${STACK_NAME} && echo yes || echo no")

  if [[ "$STACK_EXISTS" == "yes" ]]; then
    echo "Stack '${STACK_NAME}' already exists, reusing"
  else
    echo "Creating stack '${STACK_NAME}'..."
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "$SERVER" "${REMOTE_ENV} /opt/supabase/scripts/stack.sh create ${STACK_NAME}"
  fi

  # Fetch stack env vars
  echo "Fetching stack credentials..."
  # shellcheck disable=SC2086
  STACK_ENV=$(ssh $SSH_OPTS "$SERVER" "${REMOTE_ENV} /opt/supabase/scripts/stack.sh env ${STACK_NAME}")

  SUPABASE_URL=$(echo "$STACK_ENV" | grep '^SUPABASE_URL=' | cut -d= -f2-)
  SUPABASE_ANON_KEY=$(echo "$STACK_ENV" | grep '^SUPABASE_ANON_KEY=' | cut -d= -f2-)
  SUPABASE_SERVICE_ROLE_KEY=$(echo "$STACK_ENV" | grep '^SUPABASE_SERVICE_ROLE_KEY=' | cut -d= -f2-)
  DATABASE_URL=$(echo "$STACK_ENV" | grep '^DATABASE_URL=' | cut -d= -f2-)

  # Extract DB password for docker exec
  DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://postgres:\([^@]*\)@.*|\1|p')

  PSQL_CMD="docker exec -e PGPASSWORD='${DB_PASSWORD}' -i ${STACK_NAME}-db psql -U supabase_admin -d postgres"

  # ── Run migrations ──
  echo "Running database migrations..."

  # Create migration tracking table if it doesn't exist
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$SERVER" \
    "${PSQL_CMD} -v ON_ERROR_STOP=1" <<'TRACK_SQL'
CREATE TABLE IF NOT EXISTS public._migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
TRACK_SQL

  # shellcheck disable=SC2086
  for migration in "${PROJECT_DIR}"/supabase/migrations/*.sql; do
    [[ -f "$migration" ]] || continue
    FILENAME=$(basename "$migration")

    # Check if already applied
    APPLIED=$(ssh $SSH_OPTS "$SERVER" \
      "${PSQL_CMD} -tAc \"SELECT 1 FROM public._migrations WHERE name = '${FILENAME}'\"" 2>/dev/null)

    if [[ "$APPLIED" == "1" ]]; then
      echo "  Already applied: ${FILENAME}"
      continue
    fi

    echo "  Applying: ${FILENAME}"

    # shellcheck disable=SC2086
    ssh $SSH_OPTS "$SERVER" \
      "${PSQL_CMD} -v ON_ERROR_STOP=1" \
      < "$migration" 2>&1 | while IFS= read -r line; do
        echo "$line" | grep -v '^NOTICE:' || true
      done

    # Record migration as applied
    # shellcheck disable=SC2086
    ssh $SSH_OPTS "$SERVER" \
      "${PSQL_CMD} -c \"INSERT INTO public._migrations (name) VALUES ('${FILENAME}') ON CONFLICT DO NOTHING\"" \
      > /dev/null 2>&1
  done

  echo "Migrations complete"

  # ── Seed data (only if no users exist) ──
  SEED_FILE="${PROJECT_DIR}/supabase/seed.sql"
  if [[ -f "$SEED_FILE" ]]; then
    # shellcheck disable=SC2086
    USER_COUNT=$(ssh $SSH_OPTS "$SERVER" \
      "${PSQL_CMD} -tAc \"SELECT count(*) FROM auth.users\"" 2>/dev/null)

    if [[ "${USER_COUNT:-0}" == "0" ]]; then
      echo "Seeding database..."
      # shellcheck disable=SC2086
      ssh $SSH_OPTS "$SERVER" \
        "${PSQL_CMD} -v ON_ERROR_STOP=1" \
        < "$SEED_FILE" 2>&1 | while IFS= read -r line; do
          echo "$line" | grep -v '^NOTICE:' || true
        done
      echo "Seed data loaded"
    else
      echo "Users already exist, skipping seed"
    fi
  fi

  # ── Output env vars for GitHub Action ──
  echo ""
  echo "NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
  echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
}

cmd_down() {
  echo "Destroying preview DB for PR #${PR_NUMBER}..."

  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$SERVER" "${REMOTE_ENV} /opt/supabase/scripts/stack.sh destroy ${STACK_NAME} --force"

  echo "Stack '${STACK_NAME}' destroyed"
}

case "$COMMAND" in
  up)   cmd_up ;;
  down) cmd_down ;;
  *)
    echo "Unknown command: ${COMMAND}"
    echo "Usage: $0 <up|down> <pr-number>"
    exit 1
    ;;
esac

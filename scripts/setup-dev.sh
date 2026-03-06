#!/bin/bash
set -euo pipefail

# Sets up a Supabase dev environment for clip-in.
#
# Usage:
#   ./scripts/setup-dev.sh [stack-name]
#
# Requires:
#   - supabase-dev-infra repo at ../supabase-dev-infra (or set INFRA_DIR)
#   - supabase-dev-infra must be provisioned and bootstrapped
#
# What this does:
#   1. Creates a Supabase stack (or reuses an existing one)
#   2. Runs database migrations
#   3. Writes .env.local with all required env vars

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
INFRA_DIR="${INFRA_DIR:-${PROJECT_DIR}/../supabase-dev-infra}"

if [[ ! -f "${INFRA_DIR}/.env" ]]; then
  echo "supabase-dev-infra not found at ${INFRA_DIR}"
  echo "Set INFRA_DIR to the correct path."
  exit 1
fi

STACK_NAME="${1:-clip-in}"

echo "Setting up dev environment: ${STACK_NAME}"
echo ""

# ── Source infra config ──
source "${INFRA_DIR}/.env"

if [[ ! -f "${INFRA_DIR}/.server-ip" ]]; then
  echo "Server not provisioned yet. Run these first:"
  echo "  cd ${INFRA_DIR}"
  echo "  ./scripts/provision.sh"
  echo "  ./scripts/bootstrap.sh"
  exit 1
fi

SERVER_IP=$(cat "${INFRA_DIR}/.server-ip")

SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
[[ -f "$SSH_KEY_PATH" ]] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY_PATH"

# ── Preflight: verify server is reachable and bootstrapped ──
echo "Checking server at ${SERVER_IP}..."
# shellcheck disable=SC2086
if ! ssh $SSH_OPTS root@"${SERVER_IP}" "true" 2>/dev/null; then
  echo "Cannot reach server at ${SERVER_IP}."
  echo "Check that the server is running and SSH key is correct."
  exit 1
fi

# shellcheck disable=SC2086
if ! ssh $SSH_OPTS root@"${SERVER_IP}" "test -f /opt/supabase/scripts/stack.sh" 2>/dev/null; then
  echo "Server is reachable but not bootstrapped."
  echo "Run: cd ${INFRA_DIR} && ./scripts/bootstrap.sh"
  exit 1
fi
echo "Server OK"
echo ""

# ── Create stack (idempotent — skips if exists) ──
echo "Checking if stack '${STACK_NAME}' exists..."
# shellcheck disable=SC2086
STACK_EXISTS=$(ssh $SSH_OPTS root@"${SERVER_IP}" \
  "test -d /opt/supabase/stacks/${STACK_NAME} && echo yes || echo no")

if [[ "$STACK_EXISTS" == "yes" ]]; then
  echo "Stack '${STACK_NAME}' already exists, reusing"
else
  echo "Creating stack '${STACK_NAME}'..."
  "${INFRA_DIR}/scripts/stack.sh" create "${STACK_NAME}"
fi

# ── Get stack env vars ──
echo ""
echo "Fetching stack credentials..."
STACK_ENV=$("${INFRA_DIR}/scripts/stack.sh" env "${STACK_NAME}")

SUPABASE_URL=$(echo "$STACK_ENV" | grep '^SUPABASE_URL=' | cut -d= -f2-)
SUPABASE_ANON_KEY=$(echo "$STACK_ENV" | grep '^SUPABASE_ANON_KEY=' | cut -d= -f2-)
SUPABASE_SERVICE_ROLE_KEY=$(echo "$STACK_ENV" | grep '^SUPABASE_SERVICE_ROLE_KEY=' | cut -d= -f2-)
DATABASE_URL=$(echo "$STACK_ENV" | grep '^DATABASE_URL=' | cut -d= -f2-)

# Extract DB password for docker exec
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://postgres:\([^@]*\)@.*|\1|p')

# ── Run migrations ──
echo ""
echo "Running database migrations..."

PSQL_CMD="docker exec -e PGPASSWORD='${DB_PASSWORD}' -i ${STACK_NAME}-db psql -U supabase_admin -d postgres"

# Create migration tracking table if it doesn't exist
# shellcheck disable=SC2086
ssh $SSH_OPTS root@"${SERVER_IP}" \
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
  APPLIED=$(ssh $SSH_OPTS root@"${SERVER_IP}" \
    "${PSQL_CMD} -tAc \"SELECT 1 FROM public._migrations WHERE name = '${FILENAME}'\"" 2>/dev/null)

  if [[ "$APPLIED" == "1" ]]; then
    echo "  Already applied: ${FILENAME}"
    continue
  fi

  echo "  Applying: ${FILENAME}"

  # Run migration via docker exec into the DB container using supabase_admin (superuser)
  # so that auth.uid() references and security definer functions work.
  ssh $SSH_OPTS root@"${SERVER_IP}" \
    "${PSQL_CMD} -v ON_ERROR_STOP=1" \
    < "$migration" 2>&1 | while IFS= read -r line; do
      # Suppress NOTICE messages (e.g. "table already exists, skipping")
      echo "$line" | grep -v '^NOTICE:' || true
    done

  # Record migration as applied
  # shellcheck disable=SC2086
  ssh $SSH_OPTS root@"${SERVER_IP}" \
    "${PSQL_CMD} -c \"INSERT INTO public._migrations (name) VALUES ('${FILENAME}') ON CONFLICT DO NOTHING\"" \
    > /dev/null 2>&1
done

# Restart PostgREST so it picks up schema changes
echo "Reloading PostgREST schema cache..."
# shellcheck disable=SC2086
ssh $SSH_OPTS root@"${SERVER_IP}" "docker restart ${STACK_NAME}-rest" > /dev/null 2>&1

echo ""
echo "Migrations complete"

# ── Run seed data ──
SEED_FILE="${PROJECT_DIR}/supabase/seed.sql"
if [[ -f "$SEED_FILE" ]]; then
  echo ""
  echo "Seeding database..."
  # shellcheck disable=SC2086
  ssh $SSH_OPTS root@"${SERVER_IP}" \
    "docker exec -e PGPASSWORD='${DB_PASSWORD}' -i ${STACK_NAME}-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1" \
    < "$SEED_FILE" 2>&1 | while IFS= read -r line; do
      echo "$line" | grep -v '^NOTICE:' || true
    done
  echo "Seed data loaded"
  echo ""
  echo "  Test accounts:"
  echo "    matthew@thekerns.net / testpass123"
  echo "    jane@test.dev / testpass123"
fi

# ── Write .env.local ──
echo ""
echo "Writing .env.local..."

# Preserve PELOTON_TOKEN_ENCRYPTION_KEY if it exists
EXISTING_ENCRYPTION_KEY=""
if [[ -f "${PROJECT_DIR}/.env.local" ]]; then
  EXISTING_ENCRYPTION_KEY=$(grep '^PELOTON_TOKEN_ENCRYPTION_KEY=' "${PROJECT_DIR}/.env.local" | cut -d= -f2- || true)
fi
ENCRYPTION_KEY="${EXISTING_ENCRYPTION_KEY:-$(openssl rand -base64 32)}"

EXISTING_CRON_SECRET=""
if [[ -f "${PROJECT_DIR}/.env.local" ]]; then
  EXISTING_CRON_SECRET=$(grep '^CRON_SECRET=' "${PROJECT_DIR}/.env.local" | cut -d= -f2- || true)
fi
CRON_SECRET="${EXISTING_CRON_SECRET:-$(openssl rand -base64 32)}"

cat > "${PROJECT_DIR}/.env.local" <<EOF
# Supabase (auto-generated by scripts/setup-dev.sh)
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

# Encryption key for Peloton tokens
PELOTON_TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Peloton API (public values from Peloton's web app)
NEXT_PUBLIC_PELOTON_AUTH0_CLIENT_ID=WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM
NEXT_PUBLIC_PELOTON_AUTH0_DOMAIN=auth.onepeloton.com
NEXT_PUBLIC_PELOTON_API_URL=https://api.onepeloton.com

# Cron secret for scheduled jobs
CRON_SECRET=${CRON_SECRET}
EOF

echo ""
echo "Done! Dev environment ready."
echo ""
echo "  Supabase:  ${SUPABASE_URL}"
echo "  Studio:    ${SUPABASE_URL}"
echo "  Database:  ${DATABASE_URL}"
echo ""
echo "  Start dev server: npm run dev"
echo ""

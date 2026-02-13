#!/bin/bash
set -euo pipefail

# Tears down a Supabase dev environment for clip-in.
#
# Usage:
#   ./scripts/teardown-dev.sh [stack-name] [--force]
#
# Without --force, prompts for confirmation before destroying.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
INFRA_DIR="${INFRA_DIR:-${PROJECT_DIR}/../supabase-dev-infra}"

if [[ ! -f "${INFRA_DIR}/.env" ]]; then
  echo "supabase-dev-infra not found at ${INFRA_DIR}"
  echo "Set INFRA_DIR to the correct path."
  exit 1
fi

# Parse arguments
STACK_NAME="clip-in"
FORCE=""
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE="--force" ;;
    -*) echo "Unknown option: $arg"; exit 1 ;;
    *) STACK_NAME="$arg" ;;
  esac
done

echo "Tearing down dev environment: ${STACK_NAME}"

"${INFRA_DIR}/scripts/stack.sh" destroy "${STACK_NAME}" ${FORCE}

# Clean up .env.local
if [[ -f "${PROJECT_DIR}/.env.local" ]]; then
  rm "${PROJECT_DIR}/.env.local"
  echo "Removed .env.local"
fi

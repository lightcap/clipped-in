# Clip-In Project

A Peloton companion app for tracking FTP (Functional Threshold Power) history and other cycling metrics.

## Key Documentation

Before implementing features that interact with the Peloton API, read:

- **[Peloton API Findings](docs/peloton-api-findings.md)** - Comprehensive documentation of the Peloton API including:
  - Authentication (Auth0 OAuth with JWT tokens in localStorage)
  - FTP data retrieval and calculation
  - Critical clarification: `ftp_info.ftp` is the baseline FTP going INTO a workout, not the result
  - How to calculate actual FTP results from `performance_graph` endpoint
  - Sample code for fetching FTP test history

## Dev Environment Setup

The project uses self-hosted Supabase on Hetzner via [supabase-dev-infra](../supabase-dev-infra).

```bash
# One command to create stack, run migrations, seed data, and write .env.local:
./scripts/setup-dev.sh [stack-name]
```

This creates a full Supabase stack with test accounts:
- `matthew@thekerns.net` / `testpass123` (has FTP history + planned workouts)
- `jane@test.dev` / `testpass123` (lighter data set)

Prerequisites: `supabase-dev-infra` must be provisioned and bootstrapped (see its README).

### Schema Note

The local migrations use `peloton_ride_id` in `planned_workouts` but production
Supabase Cloud uses `peloton_class_id`. If you see column name mismatches, this
is the source. The local migrations are the source of truth for dev environments.

## Important Implementation Notes

### Authentication
- Peloton uses Auth0, NOT simple session cookies
- Tokens stored in localStorage, not cookies
- API calls require `Authorization: Bearer <token>` header
- Do NOT assume `peloton_session_id` cookie exists (outdated)

### FTP Calculation
- FTP = Average 20-min output × 0.95
- Get avg output from `/api/workout/{id}/performance_graph`
- The `ftp_info.ftp` field on workouts is the BASELINE (previous FTP), not the result
- First FTP test will always show `ftp_info.ftp: 0`

# Clip-In Project

A Peloton companion app for tracking FTP (Functional Threshold Power) history and other cycling metrics.

## Tech Stack

Next.js (App Router) · TypeScript · Supabase · Tailwind CSS · Vitest

## Commands

```bash
npm run dev           # Start dev server on port 3002
npm run build         # Production build
npm test              # Run tests (Vitest, watch mode)
npm run test:ui       # Tests with browser UI
npm run test:coverage # Coverage report
npm run lint          # ESLint
```

## Project Structure

```
src/
  app/           # Next.js App Router pages
    (auth)/      # Auth routes (login, callback)
    (dashboard)/ # Dashboard routes
    api/         # API routes
  components/    # React components
  hooks/         # Custom React hooks
  lib/           # Core libraries
    peloton/     # Peloton API client
    supabase/    # Supabase client & helpers
    stores/      # State management
  test/          # Test utilities & setup
  types/         # TypeScript types
```

## Key Documentation

Before implementing features that interact with the Peloton API, read:

- **[Peloton API Findings](docs/peloton-api-findings.md)** - FTP calculation, auth flow, token structure, FTP history chain
- **[Peloton API Documentation](docs/PELOTON_API_DOCUMENTATION.md)** - Full endpoint reference (classes, workouts, GraphQL stack, muscle groups, playlists)
- The `peloton-api` skill auto-loads Peloton conventions when editing relevant code

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

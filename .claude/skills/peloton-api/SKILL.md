---
name: peloton-api
description: Peloton API conventions - Auth0 JWT auth, FTP calculation rules, endpoint patterns. Use when modifying code in src/lib/peloton/, src/app/api/peloton/, or src/components/peloton/.
user-invocable: false
---

# Peloton API Conventions

Apply these rules whenever working with Peloton API integration code.

## Authentication

- Peloton uses **Auth0 OAuth 2.0**, NOT session cookies
- Tokens are stored in **localStorage**, not cookies
- API calls require `Authorization: Bearer <access_token>` header
- Do NOT assume `peloton_session_id` cookie exists (outdated pattern)
- Access tokens expire after 48 hours; refresh tokens are long-lived
- Auth0 client ID: `WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM`
- Auth0 issuer: `https://auth.onepeloton.com/`

## FTP Calculation (Critical)

- **FTP = Average 20-min output x 0.95**
- Get average output from `GET /api/workout/{id}/performance_graph`
  - Find the entry in `average_summaries` where `slug === "avg_output"`
  - Multiply `.value` by 0.95
- **`ftp_info.ftp` is the BASELINE going INTO the workout, NOT the result**
  - First FTP test always has `ftp_info.ftp: 0` (no prior baseline)
  - Subsequent tests show the *previous* FTP as the baseline
- Never use `ftp_info.ftp` as the FTP result — always calculate from performance_graph

## FTP History Chain

There is **no dedicated FTP history endpoint**. Reconstruct history by following the chain:

1. Get `cycling_ftp_workout_id` from `GET /api/me`
2. Fetch workout via `GET /api/workout/{id}`
3. Extract `ftp_info.ftp_workout_id` to get the previous test's workout ID
4. Repeat until chain ends (guard against infinite loops: stop if next ID equals current ID)

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/me` | Current user profile (includes `cycling_ftp`, `cycling_ftp_workout_id`) |
| `GET /api/workout/{id}` | Single workout details (includes `ftp_info`) |
| `GET /api/workout/{id}/performance_graph` | Workout metrics — use for FTP calculation |
| `GET /api/user/{id}/workouts` | List user workouts (supports `?joins=ride&limit=100&page=0`) |
| `GET /api/user/{id}` | User by ID |

## FTP Sources

| `ftp_source` value | Meaning |
|--------------------|---------|
| `ftp_workout_source` | From an actual FTP test ride |
| `ftp_estimated_source` | Algorithm-estimated |
| `null` | First FTP test (no prior source) |

## GraphQL API

Peloton has a GraphQL endpoint at `https://gql-graphql-gateway.prod.k8s.onepeloton.com/graphql`. Introspection is disabled. Known queries: `ViewUserStack`, used for stack sync features.

## Reference

- `docs/peloton-api-findings.md` — Auth flow, token structure, FTP calculation, FTP history chain sample code
- `docs/PELOTON_API_DOCUMENTATION.md` — Full endpoint reference: class search/details, workout history, GraphQL stack mutations, muscle groups, playlists, browse categories

# DTU Peloton — Design Document

> Date: 2026-03-06

## Overview

A Digital Twin Universe (DTU) for the Peloton API — a behavioral clone that replicates the REST and GraphQL endpoints used by the Clipped-In companion app. Built in Rust with axum.

Reference: [DTU technique](https://factory.strongdm.ai/techniques/dtu) and our existing [dtu-discourse](../../../dtu-discourse/) Go implementation.

## Goals

1. Enable local development without a real Peloton account or network access
2. Enable fast, deterministic tests without mocking `fetch` manually
3. Wire-compatible responses so `PelotonClient` works unmodified (just change the base URL)

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│  Next.js App        │         │  dtu-peloton (Rust)   │
│                     │  HTTP   │                       │
│  PelotonClient ─────┼────────►│  axum router          │
│  (configurable URL) │         │    ├─ auth middleware  │
│                     │         │    ├─ REST handlers    │
│                     │         │    ├─ GraphQL handler  │
│                     │         │    └─ in-memory store  │
└─────────────────────┘         └──────────────────────┘
```

- **Framework:** axum (async, tower-based)
- **Location:** `/dtu-peloton/` at repo root
- **Port:** 4201 (default, configurable via `PORT` env var)

## REST Endpoints

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `GET /api/me` | GET | Returns authenticated user profile (FTP, username, etc.) |
| `GET /api/workout/{id}` | GET | Returns workout with `ftp_info` for history chain traversal |
| `GET /api/workout/{id}/performance_graph` | GET | Returns avg output, summaries |
| `GET /api/user/{id}/workouts` | GET | Paginated workout list (`limit`, `page`, `joins` params) |
| `GET /api/v2/ride/archived` | GET | Class search (discipline, duration, instructor, pagination) |
| `GET /api/user/{id}/stack` | GET | View user's REST stack |
| `POST /api/user/{id}/stack` | POST | Add class to REST stack |
| `DELETE /api/user/{id}/stack/{class_id}` | DELETE | Remove class from REST stack |

## GraphQL Endpoint

Single endpoint at `POST /graphql`. Parse operation name from request body and dispatch:

| Operation | Type | Behavior |
|-----------|------|----------|
| `ViewUserStack` | Query | Returns stack with class details |
| `AddClassToStack` | Mutation | Adds class, returns updated stack |
| `ModifyStack` | Mutation | Replaces entire stack (reorder/clear) |

No full GraphQL engine needed — just match on operation name and handle the three specific operations.

## Authentication

- Accept `Authorization: Bearer <token>` header
- Map tokens to users via the store (pre-seeded tokens)
- Return 401 for missing/invalid tokens
- Pre-seeded: `test-token` → test user

## Data Model

### In-Memory Store

Thread-safe (`Arc<RwLock<Store>>`) with:

- **Users** — `HashMap<String, User>` keyed by ID
- **Workouts** — `HashMap<String, Workout>` keyed by ID, with `ftp_info` chain
- **Rides** — `HashMap<String, Ride>` keyed by ID (classes for search)
- **Performance Graphs** — `HashMap<String, PerformanceGraph>` keyed by workout ID
- **Instructors** — `HashMap<String, Instructor>` keyed by ID
- **Stack** — `HashMap<String, Vec<String>>` per-user ordered class ID list
- **API Tokens** — `HashMap<String, String>` token → user ID

### Seed Data

One test user with realistic data matching real Peloton API patterns:

```
User: "matt" (id: efcac68d7abf4b83a89d347416d76089)
  username: "TestRider"
  cycling_ftp: 176
  cycling_ftp_source: "ftp_workout_source"
  cycling_ftp_workout_id: → workout-1

Auth Token: "test-token" → user efcac68d...

FTP Workout Chain:
  workout-1 (2026-01-14, created_at=1736812800):
    ftp_info: { ftp: 183, ftp_source: "ftp_workout_source", ftp_workout_id: "workout-2" }
    ride: { title: "20 min FTP Test Ride" }
    performance_graph: avg_output=185 → calculated FTP = 176

  workout-2 (2019-12-04, created_at=1575417600):
    ftp_info: { ftp: 0, ftp_source: null, ftp_workout_id: null }
    ride: { title: "20 min FTP Test Ride" }
    performance_graph: avg_output=193 → calculated FTP = 183

Rides (10 sample classes):
  - Mix of cycling, strength disciplines
  - Durations: 600, 1200, 1800, 2700 seconds (10/20/30/45 min)
  - 3 instructors with realistic names and IDs
  - Varying difficulty_estimate (5.0-8.5)

Instructors (3):
  - Instructor A (cycling focus)
  - Instructor B (strength focus)
  - Instructor C (multi-discipline)

Stack: starts empty
```

Key edge cases covered in seed data:
- First FTP test has `ftp_info.ftp: 0` (no prior baseline)
- `ftp_info.ftp` is the BASELINE going into the workout, not the result
- FTP result = `avg_output × 0.95` from performance_graph

## Rust Project Structure

```
dtu-peloton/
  Cargo.toml
  Dockerfile
  docker-compose.yml
  src/
    main.rs          — Entry point, router setup, server start
    store.rs         — In-memory store + seed data
    models.rs        — Serde structs matching Peloton JSON shapes
    auth.rs          — Bearer token middleware
    handlers/
      mod.rs         — Handler module exports
      me.rs          — GET /api/me
      workout.rs     — GET /api/workout/{id}, performance_graph
      workouts.rs    — GET /api/user/{id}/workouts
      search.rs      — GET /api/v2/ride/archived
      stack.rs       — REST stack CRUD
      graphql.rs     — POST /graphql (3 operations)
```

## Integration with Next.js

Make `PelotonClient` base URLs configurable:

```typescript
// src/lib/peloton/client.ts
const PELOTON_API_URL = process.env.PELOTON_API_URL || "https://api.onepeloton.com";
const PELOTON_GRAPHQL_URL = process.env.PELOTON_GRAPHQL_URL || "https://gql-graphql-gateway.prod.k8s.onepeloton.com/graphql";
```

Dev `.env.local`:
```
PELOTON_API_URL=http://localhost:4201
PELOTON_GRAPHQL_URL=http://localhost:4201/graphql
```

Production uses defaults (real Peloton API). No other code changes needed.

## Docker

```dockerfile
FROM rust:1.85-alpine AS builder
WORKDIR /src
COPY . .
RUN cargo build --release

FROM alpine:3.20
COPY --from=builder /src/target/release/dtu-peloton /usr/local/bin/
EXPOSE 4201
ENV PORT=4201
ENTRYPOINT ["dtu-peloton"]
```

## Implementation Plan

### Step 1: Scaffold Rust project
- `Cargo.toml` with axum, tokio, serde, serde_json dependencies
- `main.rs` with basic server startup
- Verify it compiles and runs

### Step 2: Models + Store
- Define serde structs matching Peloton API JSON shapes
- Implement in-memory store with seed data
- Thread-safe with `Arc<RwLock<>>`

### Step 3: Auth middleware
- Extract Bearer token from Authorization header
- Look up token in store, inject user into request extensions
- Return 401 for missing/invalid tokens

### Step 4: REST handlers
- `GET /api/me` — return authenticated user
- `GET /api/workout/{id}` — return workout by ID
- `GET /api/workout/{id}/performance_graph` — return perf data
- `GET /api/user/{id}/workouts` — paginated workout list
- `GET /api/v2/ride/archived` — class search with filters
- Stack CRUD (GET/POST/DELETE)

### Step 5: GraphQL handler
- Parse operation name from JSON body
- Dispatch to ViewUserStack / AddClassToStack / ModifyStack
- Return GraphQL-shaped responses (`{ "data": { ... } }`)

### Step 6: Docker + integration
- Dockerfile (multi-stage build)
- docker-compose.yml
- Update PelotonClient to use env vars
- Test end-to-end with `npm run dev` pointing at the twin

### Step 7: Verify compatibility
- Run existing `client.test.ts` tests against the twin
- Ensure all PelotonClient methods work without modification

## Key Reference Files

When implementing, refer to these for exact JSON shapes and behaviors:

- `docs/peloton-api-findings.md` — Auth flow, FTP chain semantics, token structure
- `docs/PELOTON_API_DOCUMENTATION.md` — Full endpoint reference with response schemas
- `src/types/peloton.ts` — TypeScript types the client expects
- `src/lib/peloton/client.ts` — The client that will consume the twin
- `src/lib/peloton/client.test.ts` — Existing tests showing expected request/response patterns

# Peloton API Investigation Findings

> Investigated: 2026-01-14

## Authentication

### Overview

Peloton uses **Auth0-based OAuth 2.0** authentication, NOT simple session cookies. The original assumption about `peloton_session_id` cookies is outdated.

### Auth Flow

1. User authenticates via `auth.onepeloton.com` (Auth0 hosted login)
2. Auth0 issues JWT tokens
3. Tokens are stored in **localStorage** (not cookies)
4. API calls require `Authorization: Bearer <access_token>` header

### Auth Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `https://auth.onepeloton.com/usernamepassword/login` | POST | Username/password login |
| `https://auth.onepeloton.com/oauth/token` | POST | Token exchange |
| `https://api.onepeloton.com/auth/session` | GET | Session validation |

### Token Storage

Tokens are stored in localStorage under this key pattern:
```
@@auth0spajs::<client_id>::<audience>::<scopes>
```

Actual key observed:
```
@@auth0spajs::WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM::https://api.onepeloton.com/::openid offline_access
```

### Token Structure

```json
{
  "body": {
    "access_token": "<JWT>",
    "refresh_token": "v1.<opaque_string>",
    "scope": "openid offline_access",
    "expires_in": 172800,
    "token_type": "Bearer",
    "audience": "https://api.onepeloton.com/",
    "oauthTokenScope": "openid peloton-api.members:default offline_access",
    "client_id": "WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM"
  },
  "expiresAt": 1768627639
}
```

### Token Lifetimes

| Token | Lifetime |
|-------|----------|
| `access_token` | 48 hours (172800 seconds) |
| `id_token` | 10 hours |
| `refresh_token` | Unknown (long-lived) |

### Auth0 Client Details

- **Client ID**: `WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM`
- **Issuer**: `https://auth.onepeloton.com/`
- **Audience**: `https://api.onepeloton.com/`

### Making Authenticated Requests

```javascript
const response = await fetch('https://api.onepeloton.com/api/me', {
  headers: {
    'Authorization': 'Bearer ' + accessToken
  }
});
```

---

## FTP Data

### Current FTP (from User Profile)

**Endpoint**: `GET https://api.onepeloton.com/api/me`

**FTP-related fields in response**:
```json
{
  "cycling_ftp": 0,
  "cycling_ftp_source": "ftp_workout_source",
  "cycling_ftp_workout_id": "4e77e9a27f074a509fe08d4eb41e6b36",
  "estimated_cycling_ftp": 199
}
```

| Field | Description |
|-------|-------------|
| `cycling_ftp` | Current FTP from last test (0 if not set/expired) |
| `cycling_ftp_source` | How FTP was determined |
| `cycling_ftp_workout_id` | Reference to the FTP test workout |
| `estimated_cycling_ftp` | Algorithm-estimated FTP based on recent rides |

### FTP History

**There is no dedicated FTP history endpoint.**

FTP history must be reconstructed by following the `ftp_workout_id` chain:

1. Get `cycling_ftp_workout_id` from `/api/me`
2. Fetch that workout via `/api/workout/{id}`
3. Extract `ftp_info.ftp` and `ftp_info.ftp_workout_id`
4. Repeat until chain ends

### Workout FTP Info

**Endpoint**: `GET https://api.onepeloton.com/api/workout/{workout_id}`

Each workout contains an `ftp_info` object:
```json
{
  "ftp_info": {
    "ftp": 219,
    "ftp_source": "ftp_workout_source",
    "ftp_workout_id": "096f513cf5914c0f8eef81c870e4779c"
  }
}
```

#### Critical Clarification: `ftp_info.ftp` is the BASELINE, not the RESULT

**`ftp_info.ftp` represents the user's FTP going INTO the workout** (what their power zones were based on during that ride), NOT the FTP result calculated from the workout.

Example from real data:

| Test Date | Avg Output | Calculated FTP (×0.95) | `ftp_info.ftp` |
|-----------|-----------|------------------------|----------------|
| 2019-12-04 | 193 watts | **183** | 0 (first test, no prior FTP) |
| 2026-01-14 | 185 watts | **176** | 183 (baseline from 2019 test) |

This means:
- First FTP test will always have `ftp_info.ftp: 0` (no prior baseline)
- Subsequent tests show the *previous* FTP as the baseline
- The `ftp_workout_id` chain gives you **baseline history**, not result history

### Calculating Actual FTP Results

To get the actual FTP *result* from a test, you must:

1. Fetch the performance graph: `GET /api/workout/{id}/performance_graph`
2. Extract average output from `average_summaries` where `slug === "avg_output"`
3. Calculate: `FTP = avg_output × 0.95`

**Endpoint**: `GET https://api.onepeloton.com/api/workout/{workout_id}/performance_graph`

**Response structure**:
```json
{
  "duration": 1200,
  "average_summaries": [
    {
      "display_name": "Avg Output",
      "display_unit": "watts",
      "value": 193,
      "slug": "avg_output"
    }
  ],
  "summaries": [
    {
      "display_name": "Total Output",
      "display_unit": "kj",
      "value": 231,
      "slug": "total_output"
    }
  ]
}
```

### FTP Sources

| Source | Meaning |
|--------|---------|
| `ftp_workout_source` | From an actual FTP test ride |
| `ftp_estimated_source` | Algorithm-estimated |
| `null` | First FTP test (no prior source) |

---

## Key API Endpoints

### User Data

| Endpoint | Description |
|----------|-------------|
| `GET /api/me` | Current user profile (includes FTP) |
| `GET /api/user/{id}` | User by ID |
| `GET /api/user/{id}/settings` | User settings |

### Workouts

| Endpoint | Description |
|----------|-------------|
| `GET /api/user/{id}/workouts` | List user's workouts |
| `GET /api/user/{id}/workouts?joins=ride&limit=100&page=0` | With ride details, paginated |
| `GET /api/workout/{id}` | Single workout details (includes `ftp_info`) |
| `GET /api/workout/{id}/performance_graph` | Workout metrics over time |

### Other

| Endpoint | Description |
|----------|-------------|
| `GET /api/ride/metadata_mappings` | Ride type mappings |
| `GET /api/instructor` | List instructors |

---

## GraphQL API

Peloton also has a GraphQL endpoint at:
```
https://gql-graphql-gateway.prod.k8s.onepeloton.com/graphql
```

**Introspection is disabled** in production, so the full schema is unknown.

Known queries (from network observation):
- `ViewUserStack`
- `GetNumberOfUnreadNotifications`
- `PendingInviteCount`

This appears to be used for newer features, not core FTP/workout data.

---

## Cookies Observed

These cookies are set but **NOT used for API authentication**:

| Cookie | Purpose |
|--------|---------|
| `auth0.*.is.authenticated` | Auth0 state flag |
| `_legacy_auth0.*.is.authenticated` | Legacy auth0 flag |
| `_pxvid`, `pxcts`, `_px3` | PerimeterX bot protection |
| `ajs_*` | Segment analytics |
| `amplitude_*` | Amplitude analytics |
| `fides_consent` | Privacy consent |

---

## Implementation Notes for Companion App

### WebView Authentication

1. Load `https://members.onepeloton.com/login` in WebView
2. Let user complete Auth0 login flow
3. After redirect to `/home`, extract tokens from localStorage:
   ```javascript
   localStorage.getItem('@@auth0spajs::WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM::https://api.onepeloton.com/::openid offline_access')
   ```
4. Parse JSON and store `access_token` and `refresh_token` securely

### Token Refresh

When `access_token` expires (or API returns 401):
1. Use `refresh_token` to get new tokens via Auth0
2. Or prompt user to re-authenticate via WebView

### Secure Storage

Store these artifacts securely:
- `access_token` - Required for API calls
- `refresh_token` - Required for token renewal
- `expiresAt` - To know when to refresh proactively

---

## Sample: Get FTP Test Results History

```javascript
async function getFtpTestResults(accessToken, startWorkoutId) {
  const results = [];
  let workoutId = startWorkoutId;

  while (workoutId && results.length < 50) {
    // Get workout details
    const workoutResp = await fetch(
      `https://api.onepeloton.com/api/workout/${workoutId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const workout = await workoutResp.json();
    if (workout.error_code) break;

    // Get performance data to calculate actual FTP result
    const perfResp = await fetch(
      `https://api.onepeloton.com/api/workout/${workoutId}/performance_graph`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const perf = await perfResp.json();

    // Find average output
    const avgOutput = perf.average_summaries?.find(s => s.slug === 'avg_output')?.value;
    const calculatedFtp = avgOutput ? Math.round(avgOutput * 0.95) : null;

    results.push({
      date: new Date(workout.created_at * 1000),
      workoutId: workout.id,
      rideTitle: workout.ride?.title,
      avgOutput: avgOutput,
      calculatedFtp: calculatedFtp,           // The actual FTP RESULT
      baselineFtp: workout.ftp_info?.ftp,     // FTP going INTO this workout
      source: workout.ftp_info?.ftp_source
    });

    // Follow chain to previous FTP test
    const nextId = workout.ftp_info?.ftp_workout_id;
    if (nextId === workoutId) break; // Prevent infinite loop
    workoutId = nextId;
  }

  return results;
}

// Usage:
// 1. Get user profile to find cycling_ftp_workout_id
// 2. Call getFtpTestResults(token, cycling_ftp_workout_id)
//
// Example output:
// [
//   { date: 2026-01-14, avgOutput: 185, calculatedFtp: 176, baselineFtp: 183 },
//   { date: 2019-12-04, avgOutput: 193, calculatedFtp: 183, baselineFtp: 0 }
// ]
```

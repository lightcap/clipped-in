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

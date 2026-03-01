---
name: create-migration
description: Create a new Supabase migration following project conventions
disable-model-invocation: true
---

# Create Supabase Migration

## Naming Convention

Migration files go in `supabase/migrations/` with the format:

```
YYYYMMDDHHMMSS_snake_case_description.sql
```

Use the current UTC timestamp. Example: `20260228153000_add_user_preferences.sql`

## Column Name Discrepancy

**Important**: Local migrations use `peloton_ride_id` in `planned_workouts`, but production Supabase Cloud uses `peloton_class_id`. The local migrations are the source of truth for dev environments. Be aware of this when writing migrations that touch `planned_workouts`.

## Requirements

Every migration must:

1. **Enable RLS** on any new tables: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
2. **Add user-scoped RLS policies** for SELECT, INSERT, UPDATE, DELETE as appropriate, using `auth.uid() = user_id`
3. **Include `user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`** on any user-owned table
4. **Add performance indexes** for columns used in WHERE clauses or ORDER BY
5. **Use `uuid_generate_v4()`** for primary key defaults

## Existing Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users` — Peloton user info, current/estimated FTP |
| `peloton_tokens` | Encrypted OAuth tokens (access + refresh) |
| `ftp_records` | FTP test history (workout_id, avg_output, calculated_ftp, baseline_ftp) |
| `planned_workouts` | Scheduled workouts with status tracking and stack sync |
| `stack_sync_logs` | Logs of stack push operations |

## Custom Types

- `workout_status`: `'planned' | 'completed' | 'skipped' | 'postponed'`
- `sync_type`: `'manual' | 'scheduled'`

## Conventions from Existing Migrations

- Use `TIMESTAMPTZ` for all timestamp columns (not `TIMESTAMP`)
- Include `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` on all tables
- Include `updated_at` with trigger where applicable (use `update_updated_at_column()` function — already exists)
- Add a comment header describing the migration purpose

## Steps

1. Determine the migration description from the user's request
2. Generate the timestamp using current UTC time
3. Create the file at `supabase/migrations/<timestamp>_<description>.sql`
4. Write the SQL following all conventions above
5. Show the user the generated file for review

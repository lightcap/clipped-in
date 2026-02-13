-- Clip-In Dev Seed Data
-- Run after migrations to populate a dev environment with realistic data.
--
-- Creates 2 test users with profiles, FTP history, planned workouts,
-- and stack sync logs. Dates are relative to NOW() so data stays fresh.
--
-- Note: peloton_tokens are NOT seeded — they require encryption and
-- are created automatically when a user authenticates with Peloton.

-- ── Create test auth users ──
-- The on_auth_user_created trigger will auto-create profiles.
-- Password for both: "testpass123"
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  is_sso_user, is_anonymous
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'matthew@thekerns.net',
  crypt('testpass123', gen_salt('bf')),
  NOW(),
  '', 'authenticated',
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Matt"}',
  NOW() - INTERVAL '90 days',
  NOW(),
  '', '', '', '', '', '', '', '', false, false
),
(
  'a0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'jane@test.dev',
  crypt('testpass123', gen_salt('bf')),
  NOW(),
  '', 'authenticated',
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Jane"}',
  NOW() - INTERVAL '60 days',
  NOW(),
  '', '', '', '', '', '', '', '', false, false
)
ON CONFLICT (id) DO NOTHING;

-- Also insert identities (required for email login to work)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '{"sub":"a0000000-0000-0000-0000-000000000001","email":"matthew@thekerns.net"}',
  'email', 'a0000000-0000-0000-0000-000000000001',
  NOW(), NOW() - INTERVAL '90 days', NOW()
),
(
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000002',
  '{"sub":"a0000000-0000-0000-0000-000000000002","email":"jane@test.dev"}',
  'email', 'a0000000-0000-0000-0000-000000000002',
  NOW(), NOW() - INTERVAL '60 days', NOW()
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ── Update profiles with Peloton data ──
UPDATE profiles SET
  peloton_user_id = '48bcbd2444f744138043812a9420bbe0',
  peloton_username = 'lightcap',
  display_name = 'Matt Kern',
  current_ftp = 267,
  estimated_ftp = 270
WHERE id = 'a0000000-0000-0000-0000-000000000001';

UPDATE profiles SET
  peloton_user_id = 'fake_peloton_user_002',
  peloton_username = 'jane_rides',
  display_name = 'Jane Smith',
  current_ftp = 195,
  estimated_ftp = 200
WHERE id = 'a0000000-0000-0000-0000-000000000002';

-- ── FTP Records (Matt — real data from production) ──
INSERT INTO ftp_records (id, user_id, workout_id, workout_date, ride_title, avg_output, calculated_ftp, baseline_ftp, created_at) VALUES
(
  'f0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '096f513cf5914c0f8eef81c870e4779c',
  NOW() - INTERVAL '120 days',
  '20 min FTP Test Ride',
  231, 219, 208,
  NOW() - INTERVAL '120 days'
),
(
  'f0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  '4e77e9a27f074a509fe08d4eb41e6b36',
  NOW() - INTERVAL '60 days',
  '20 min FTP Test Ride',
  281, 267, 219,
  NOW() - INTERVAL '60 days'
)
ON CONFLICT (user_id, workout_id) DO NOTHING;

-- ── FTP Records (Jane — synthetic progression) ──
INSERT INTO ftp_records (id, user_id, workout_id, workout_date, ride_title, avg_output, calculated_ftp, baseline_ftp, created_at) VALUES
(
  'f0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000002',
  'fake_workout_jane_001',
  NOW() - INTERVAL '90 days',
  '20 min FTP Test Ride',
  189, 180, 0,
  NOW() - INTERVAL '90 days'
),
(
  'f0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000002',
  'fake_workout_jane_002',
  NOW() - INTERVAL '30 days',
  '20 min FTP Test Ride',
  205, 195, 180,
  NOW() - INTERVAL '30 days'
)
ON CONFLICT (user_id, workout_id) DO NOTHING;

-- ── Planned Workouts (Matt — mix of past/today/future, various statuses) ──
INSERT INTO planned_workouts (id, user_id, peloton_ride_id, ride_title, ride_image_url, instructor_name, duration_seconds, discipline, scheduled_date, scheduled_time, status, pushed_to_stack, pushed_at, completed_at, sort_order) VALUES
-- Past completed
(
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '923a0be458c449ffac3a589ba8aa1c63',
  '20 min HIIT Run', NULL, 'Marcel Dinkins',
  1200, 'running',
  (CURRENT_DATE - INTERVAL '5 days')::date, '07:00',
  'completed', true,
  NOW() - INTERVAL '6 days',
  NOW() - INTERVAL '5 days',
  0
),
-- Past skipped
(
  'b0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'c4c804b5bc0c4f0cae75e257ef342ade',
  '30 min Walk + Run', NULL, 'Joslyn Thompson Rule',
  1800, 'running',
  (CURRENT_DATE - INTERVAL '3 days')::date, NULL,
  'skipped', false, NULL, NULL,
  0
),
-- Past completed
(
  'b0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'b2d6ae5708fa4344ab2703201fd0e893',
  '30 min Metal Ride', NULL, 'Bradley Rose',
  1800, 'cycling',
  (CURRENT_DATE - INTERVAL '2 days')::date, '18:00',
  'completed', true,
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '2 days',
  0
),
-- Today
(
  'b0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  '0948d1d92d1f4f9ea5b08e92aad5a21f',
  '30 min Walk + Run', NULL, 'Logan Aldridge',
  1800, 'running',
  CURRENT_DATE, '07:00',
  'planned', false, NULL, NULL,
  0
),
-- Today (reuse real class)
(
  'b0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'b2d6ae5708fa4344ab2703201fd0e893',
  '30 min Metal Ride', NULL, 'Bradley Rose',
  1800, 'cycling',
  CURRENT_DATE, '18:30',
  'planned', false, NULL, NULL,
  1
),
-- Tomorrow (reuse real class)
(
  'b0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  '923a0be458c449ffac3a589ba8aa1c63',
  '20 min HIIT Run', NULL, 'Marcel Dinkins',
  1200, 'running',
  (CURRENT_DATE + INTERVAL '1 day')::date, '07:00',
  'planned', false, NULL, NULL,
  0
),
-- Day after tomorrow (reuse real class)
(
  'b0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'c4c804b5bc0c4f0cae75e257ef342ade',
  '30 min Walk + Run', NULL, 'Joslyn Thompson Rule',
  1800, 'running',
  (CURRENT_DATE + INTERVAL '2 days')::date, NULL,
  'planned', false, NULL, NULL,
  0
),
-- Next week (reuse real class)
(
  'b0000000-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000001',
  '0948d1d92d1f4f9ea5b08e92aad5a21f',
  '30 min Walk + Run', NULL, 'Logan Aldridge',
  1800, 'running',
  (CURRENT_DATE + INTERVAL '7 days')::date, '08:00',
  'planned', false, NULL, NULL,
  0
)
ON CONFLICT (id) DO NOTHING;

-- ── Planned Workouts (Jane — lighter schedule) ──
INSERT INTO planned_workouts (id, user_id, peloton_ride_id, ride_title, ride_image_url, instructor_name, duration_seconds, discipline, scheduled_date, scheduled_time, status, pushed_to_stack, pushed_at, completed_at, sort_order) VALUES
(
  'b0000000-0000-0000-0000-000000000009',
  'a0000000-0000-0000-0000-000000000002',
  '5566778899aabb5566778899aabb5566',
  '30 min Pop Ride', NULL, 'Hannah Corbin',
  1800, 'cycling',
  CURRENT_DATE, '17:00',
  'planned', false, NULL, NULL,
  0
),
(
  'b0000000-0000-0000-0000-000000000010',
  'a0000000-0000-0000-0000-000000000002',
  'ddeeff0011223344ddeeff0011223344',
  '20 min Yoga Flow', NULL, 'Aditi Shah',
  1200, 'yoga',
  (CURRENT_DATE + INTERVAL '1 day')::date, NULL,
  'planned', false, NULL, NULL,
  0
),
(
  'b0000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000002',
  '99887766554433229988776655443322',
  '10 min Cool Down Stretch', NULL, 'Kristin McGee',
  600, 'stretching',
  (CURRENT_DATE + INTERVAL '1 day')::date, NULL,
  'planned', false, NULL, NULL,
  1
)
ON CONFLICT (id) DO NOTHING;

-- ── Stack Sync Logs (Matt) ──
INSERT INTO stack_sync_logs (id, user_id, sync_type, workouts_pushed, success, error_message, created_at) VALUES
(
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'manual', 3, true, NULL,
  NOW() - INTERVAL '6 days'
),
(
  'c0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'scheduled', 2, true, NULL,
  NOW() - INTERVAL '3 days'
),
(
  'c0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'manual', 0, false,
  'Peloton API rate limit exceeded',
  NOW() - INTERVAL '1 day'
),
(
  'c0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'manual', 2, true, NULL,
  NOW() - INTERVAL '1 hour'
)
ON CONFLICT (id) DO NOTHING;

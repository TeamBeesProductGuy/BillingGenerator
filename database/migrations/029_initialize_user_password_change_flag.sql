-- Initialize password-change tracking for existing Supabase Auth users.
-- This does not expose or store plaintext passwords. Supabase Auth stores password hashes only.

UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('password_changed_once', false)
WHERE NOT (COALESCE(raw_user_meta_data, '{}'::jsonb) ? 'password_changed_once');

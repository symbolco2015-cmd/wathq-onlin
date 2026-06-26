# Supabase SQL

These scripts are run manually in the Supabase SQL editor — there is no migration runner. Apply them in order based on the date/feature they describe.

- `migrations/` — schema, RLS policies, and storage bucket setup for portfolios, announcements, evidence, and sharing. `supabase_setup_complete.sql` is the full base schema referenced from the root `CLAUDE.md`.
- `admin/` — `admin_users` table setup and RLS fixes related to admin read/select access.

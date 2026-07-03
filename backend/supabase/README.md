# Supabase SQL

These scripts are run manually in the Supabase SQL editor — there is no migration runner. Apply them in order based on the date/feature they describe.

- `migrations/` — schema, RLS policies, and storage bucket setup for portfolios, announcements, evidence, and sharing. `supabase_setup_complete.sql` is the full base schema referenced from the root `CLAUDE.md`.
- `admin/` — `admin_users` table setup and RLS fixes related to admin read/select access.
- `functions/` — Supabase Edge Functions (Deno), deployed directly to the project (not via a local Supabase CLI setup in this repo).

## Edge Functions

### `suggest-from-image` (Beta)

Analyzes an uploaded evidence image and returns a suggested Arabic description. Gated by the `is_feature_enabled('image_suggestion')` RPC (see `migrations/supabase_feature_flags_setup.sql` — `feature_flags` table for the platform-wide switch, `portfolio_feature_overrides` for per-teacher exceptions, managed from the admin dashboard's "الميزات التجريبية" tab) and enforces a daily usage cap via the existing `check_and_log_ai_usage` RPC (`ai_usage_log` table) before calling the AI provider.

All provider-specific details (request shape, headers, response parsing) live exclusively inside `callAIProvider()` in `functions/suggest-from-image/index.ts` — swapping providers later means editing only that function.

Requires these secrets to be set on the project (Supabase Dashboard → Edge Functions → Secrets, or `supabase secrets set`) — **never commit these**:

```
GEMINI_API_KEY   # Google Gemini API key
AI_MODEL_NAME    # e.g. gemini-2.0-flash
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided automatically by the Edge Function runtime.

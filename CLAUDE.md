# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository. **Last rewritten 14 September 2026** — the previous version
described June 2026 architecture and was significantly stale (wrong state
model, wrong evaluation system, wrong section count, missing half the
features). Everything below was verified against the live repository and
live production database on that date; re-verify anything load-bearing
before relying on it in a future session, the same way this rewrite did.

## Project Overview

**Wathq (وثّق)** is an Arabic-first professional portfolio platform for
teachers in Saudi Arabia, hosted at `wathq.online`. Teachers document
evidence of professional achievement across 8 core evaluated categories
plus a strategies section and two results-analysis sections. Portfolios
are shareable via URL (`?share=<user-id>`) and exportable to PDF. The UI
is entirely RTL (right-to-left). The platform is pre-launch as of this
writing, with the sole developer as the only active test user.

---

## Repository Layout

```
frontend/            # React + Vite SPA — all paths below are relative to
                      # frontend/, e.g. src/hooks/useAppStore.ts means
                      # frontend/src/hooks/useAppStore.ts
backend/
  api-server/        # Dead code — confirmed 14 September 2026, not just a
                      # code-search inference. Zero references from the
                      # frontend (no /api/* calls, no localhost:3001). AI
                      # features run entirely through Supabase Edge
                      # Functions now (see below). Safe to ignore when
                      # reasoning about how AI features work; a candidate
                      # for deletion in a future cleanup pass, not
                      # something to build on or route new work through.
  supabase/
    functions/       # Edge Functions (Deno) — see "Edge Functions" below
    migrations/       # Some schema changes are tracked here, but NOT all —
                      # several tables/columns/cron jobs were created via
                      # one-off SQL run directly in the Supabase SQL editor
                      # and are NOT reflected in any migration file. Never
                      # assume the migrations/ folder is a complete picture
                      # of the live schema — query the live database
                      # directly (Supabase MCP tools, or the dashboard) to
                      # confirm anything schema-related before relying on
                      # a migration file's account of it.
```

---

## Commands

```bash
# Frontend (run from frontend/)
npm run dev       # Vite dev server, port 3000
npm run build     # Production build → frontend/dist/
npm run lint      # tsc --noEmit (no test suite exists)
npm run preview   # Preview the production build locally
npm run clean     # Remove dist/
```

No test framework is configured. `npm run lint` + `npm run build` are the
only automated verification steps — always run both before considering a
frontend change complete, and treat `npm run build` as separate from
`npm run lint` passing (both must succeed independently, `lint` does not
catch every build-time issue).

Edge Functions have **no local dev/build command** documented in this
repo, and **no CI pipeline deploys them automatically** — deployment is
manual: `supabase functions deploy <name> --project-ref <ref>` via the
Supabase CLI. If the CLI isn't installed in the current environment,
deployment must happen through the Supabase dashboard's function editor,
or via the `deploy_edge_function` Supabase MCP tool if available.
**A `git push` alone never deploys an Edge Function** — this has caused
confusion before. If a commit only touches `backend/supabase/functions/`,
Netlify will typically report "no changes detected in base directory" and
skip its build entirely (expected, not a failure) — the Edge Function
still needs its own separate deploy step.

---

## Environment Variables

```
# frontend/.env.example — safe to expose, Supabase anon key is intentionally public
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Edge Function secrets (Supabase Dashboard → Edge Functions → Secrets, not
in any `.env` file, and **not readable back once set** — write-only):
`GEMINI_API_KEY`, `AI_MODEL_NAME`, `BULK_IMPORT_SERVICE_KEY`,
`PORTFOLIO_SUMMARY_SERVICE_KEY`, plus `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (these three are
auto-provided to every Edge Function by Supabase — never set manually,
and always prefer `SUPABASE_SERVICE_ROLE_KEY` over any custom secret
when a function needs a full-privilege database client — see "Known
pitfalls" below for why this matters).

`backend/api-server/.env.example` still exists (`GEMINI_API_KEY`,
`SERVER_PORT`, `APP_URL`) but the server it configures is dead code (see
Repository Layout above) — these variables are not read by anything
currently in use.

---

## Architecture

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 6, Tailwind CSS 4 (no
  component library)
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge
  Functions + `pg_cron` + `pg_net`)
- **Deployment**: Netlify (frontend static build + `frontend/netlify/edge-functions/og-share.ts`
  for social-preview meta tags), Supabase (database + Edge Functions,
  deployed separately from Netlify)
- **Key libs**: `@supabase/supabase-js`, `recharts`, `jspdf`,
  `html-to-image`, `qrcode.react`, `@imgly/background-removal`,
  `browser-image-compression`

### Page Routing

No router library. `App.tsx` manages pages with a state variable
(`currentPage: 'dashboard' | 'public' | 'admin'`). Three query params
switch modes: `?share=<user-id>` → public portfolio view for that user,
`?report=<id>` → a "harvest report" view (`useHarvestReport` hook — a
distinct feature from the share view; read `useHarvestReport.ts` before
assuming its shape matches `usePublicProfile`), no param + logged in →
dashboard.

### State Management — two eras, both currently live

The app is mid-migration between an old JSONB-blob model and a normalized
Supabase-table model. Both are real and in use; do not assume one has
fully replaced the other without checking the specific field.

**Legacy (`state.ev`/`state.strats`/`state.csubs`, in `useAppStore.ts`)**:
a single `portfolios.state` JSONB column held the entire app state,
keyed as `"${sectionId}|${subsectionName}"` for evidence. Several UI
paths still read from this (e.g. `state.strats` for selected teaching
strategies) — it has **not** been fully retired. Before assuming a given
piece of data lives in the new table, check whether the specific
component reads `state.X` or the new hook.

**Current (`evidence` table + `indicator_id`, primarily via
`useSupabaseEvidence.ts`/`useEvidenceStore.ts`/`useSaveEvidence.ts`)**:
each documented evidence item is a row in `evidence`, with a **`NOT
NULL`** `indicator_id` foreign key — this constraint is enforced at the
DB level and all insertion paths (manual form, quick capture, voice
transcription, bulk import) go through the same unified save path
(`useSaveEvidence.ts`) specifically to guarantee this. `indicator_id`
values come from `section_indicators`, itself sourced from the DB (see
`useSections.ts`) rather than any hardcoded list.

Other hooks: `useAdminStore.ts` (admin operations, gated by `isAdmin`),
`useSections.ts` (merges `data.ts` metadata with live `section_indicators`
from the DB — **`data.ts`'s hardcoded section list is metadata only, not
the source of truth for indicators**), `useMonthlyProgress.ts` (a
deliberately separate monthly-momentum counter, untouched by the
`indicator_id` unification below), `useBulkImport.ts`, `useQuickCapture.ts`,
`useVoiceRecording.ts` (**feature currently disabled**, see below),
`usePublicProfile.ts`/`usePublicEvidence.ts`/`usePublicMonthlyProgress.ts`/
`usePublicLessonPlanSummary.ts`/`usePublicResultsAnalysis.ts` (public
share-view data fetchers, each via its own `get_shared_*` RPC),
`useHarvestReport.ts` (the separate `?report=` feature).

### Database Schema — verify live, this list is a snapshot

Core tables: `portfolios` (id, legacy `state` JSONB, `share_enabled`,
`ai_summary`, `ai_top_achievement_evidence_id`, `ai_summary_stale`,
`ai_summary_generated_at`), `evidence` (`indicator_id` NOT NULL,
`evidence_type` — currently `file`/`image`/`link`/`note`/`audio`/`video`),
`sections` (`section_type`: `core`/`strategy`/`results` — replaces any
hardcoded section-ID list in code), `section_indicators`,
`monthly_progress`, `bulk_import_queue`, `admin_users`, `announcements`,
`feature_flags`, `portfolio_feature_overrides`, `grade_bands` (student
result grading tiers, unrelated to teacher portfolio scoring —
`ResultsAnalysis/` feature only), `academic_dates`, `lesson_plan_templates`,
`results_analysis`, `indicator_ai_summaries`, `section_ai_summaries`,
`ai_usage_log`.

**Known orphaned/legacy objects** (confirmed zero code references as of
this rewrite — candidates for cleanup, not for building on top of):
`user_portfolios` table, `evidence_sections` table (RLS enabled with no
policies — silently denies everything), `archive_20260904` schema
(a backup snapshot, not a working table).

Key RPCs (SECURITY DEFINER — check `get_advisors` for the current full
list before assuming this one is exhaustive): `get_portfolio_completion`
(the authoritative readiness percentage, reads `evidence.indicator_id`
across `core` sections only — does **not** include `strategy` or
`results` sections by design), `get_section_completion`,
`get_shared_portfolio`, `get_shared_evidence`,
`get_shared_results_analysis`, `check_and_log_ai_usage`, `is_admin`.

### Admin Access

Two independent mechanisms, both must be kept in sync manually: a
hardcoded `ADMIN_EMAILS` list inside `useAppStore.ts` (drives
`isAdmin`, computed client-side, gates the `admin` page) **and** the
`admin_users` table + `is_admin()` SECURITY DEFINER function (used for
RLS policies server-side). Adding an admin requires updating both.

### RLS

Most tables have RLS enabled. Before assuming a table is protected,
check specifically — `evidence_sections` is a real example of a table
with RLS *enabled* but *zero policies*, which silently denies all access
rather than erroring loudly. Run `get_advisors` (security) periodically;
it has caught real gaps before.

---

## Edge Functions

All in `backend/supabase/functions/`, all Deno, all sharing
`_shared/ai-provider.ts` for Gemini calls (`callAIProvider`/
`callAIProviderMultiImage`/`callAIProviderText` — the only file that
knows Gemini's request shape; swap providers there only).

| Function | Trigger | Purpose |
|---|---|---|
| `suggest-from-image` | manual, from evidence form | Suggests a section for an uploaded image |
| `transcribe-voice` | manual, from voice capture (currently disabled) | Transcribes + classifies a voice note |
| `process-bulk-queue` | immediate (fire-and-forget, no `await`) + daily `pg_cron` backup | Classifies queued bulk-import images |
| `generate-portfolio-summaries` | weekly GitHub Action + manual refresh button | Generates the public-share-page AI summary + "أبرز إنجاز" |
| `generate-indicator-summary` | manual, per-indicator button (lesson-plan indicators specifically) | Per-indicator AI summary |
| `generate-section-summary` | manual | Per-section AI summary (superseded the indicator-level approach for the "lesson plan" section specifically — both still coexist, by design, see inline comments in `generate-indicator-summary`) |

### Known pitfall — custom secret vs. Supabase API key (learned the hard way, 13 September 2026)

`process-bulk-queue` and `generate-portfolio-summaries` both accept two
call modes: a trusted batch caller (`pg_cron` or GitHub Actions, sending
a custom secret in a custom header — `X-Bulk-Import-Key` /
`X-Portfolio-Summary-Key`) and an authenticated end-user call
(`Authorization: Bearer <user JWT>`). **The custom secret is only ever
valid for the header comparison. It is never a valid argument to
`createClient(supabaseUrl, <key>)`.** Both functions independently had
the same bug: the custom secret variable got reused as the Supabase
client's API key, causing every database query inside the trusted-batch
branch to fail with `Invalid API key` — while the function itself still
returned HTTP 200 with an empty/zero result, because the internal error
was caught and swallowed rather than thrown. This meant GitHub Actions
showed a green ✓ for every run, and `cron.job_run_details` showed
`'succeeded'` for every run, for weeks, while the feature did nothing.
**A green checkmark on a scheduled trigger only means the HTTP request
completed — it says nothing about whether the function's actual work
succeeded.** When debugging a "why isn't this batch feature doing
anything" report, always read the actual response body / `function_logs`,
never trust the trigger's own pass/fail indicator alone. When writing a
new batch-mode Edge Function, use `SUPABASE_SERVICE_ROLE_KEY` (always
auto-available, never a custom secret) for the database client, and keep
the custom secret strictly for the caller-identity comparison.

### Known pitfall — `pg_cron` jobs are not in any migration file

At least one `pg_cron` job (the `process-bulk-queue` daily backup) was
created via one-off SQL in the dashboard and is invisible to any
migration-file search. If a scheduled job's behavior seems wrong, query
`cron.job` and `cron.job_run_details` directly rather than searching the
repo for its definition.

---

## UI Conventions

- **RTL throughout**: `index.html` sets `lang="ar" dir="rtl"`.
- **Design tokens**: Custom CSS variables in `src/index.css`
  (`--em0`–`--em9` emerald greens, `--gold`/`--gold2`/`--gold3`, `--surf0`–`--surf5`).
  Reference these, don't hardcode colors.
- **Tailwind v4**: `@import "tailwindcss"` syntax, not the old `@tailwind` directives.
- **Icons**: Tabler Icons via CDN (`<i class="ti ti-*">`), plus Lucide React for component icons.
- **Typography**: Tajawal + Noto Naskh Arabic (Google Fonts).
- **No modal/toast library**: `src/components/UI.tsx` exports the app-wide `Modal`/`Toast`.

---

## Component Responsibilities

| File/Folder | Role |
|---|---|
| `src/App.tsx` | Top-level layout, page switching, modal state, announcements |
| `src/components/Dashboard.tsx` | Portfolio editor |
| `src/components/Public.tsx` | Read-only shared portfolio view, PDF export, QR code, AI summary display |
| `src/components/Auth.tsx` | Login, register, password reset |
| `src/components/Onboarding.tsx` | First-run profile setup |
| `src/components/Admin/AdminDashboard.tsx` | Admin panel |
| `src/components/BulkImportPicker.tsx` / `BulkImportReview.tsx` | Bulk image import flow — **note**: the review screen currently only queries `status='failed'` and `status='classified'` rows; `status='pending'` rows (e.g. a stuck/failed classification) are invisible in this UI |
| `src/components/ResultsAnalysis/` | Student results analysis — upload, parse, chart, convert to evidence (merged into the official "results" sections, not a standalone feature) |
| `src/components/HarvestReportSheet.tsx` | The separate `?report=` feature |
| `src/components/Sidebar.tsx` | Desktop-only progress sidebar |
| `src/components/Nav.tsx`, `Background.tsx` | Navigation, animated background |

---

## Working with Evidence

Prefer the `evidence` table path (`useSaveEvidence.ts` and friends) for
anything new — it's the one with the `indicator_id` guarantee. The
legacy `state.ev` composite-key map (`"${sectionId}|${subsectionName}"`)
still exists and is still read in places (check the specific component),
but treat it as something to migrate away from, not build on.

Evidence types: `file`, `image`, `link`, `note`, `audio`, `video` (DB
column `evidence_type` on the `evidence` table — do not confuse with the
older, narrower `pdf`/`img`/`doc`/`vid` local type used in some legacy
UI code, see `supabaseEvidenceTypeToLocal()` in `utils.ts` for the
mapping between them).

**Voice capture is currently disabled** (`VOICE_CAPTURE_ENABLED = false`
in `useQuickCapture.ts`) — the UI shows an "under development" sheet
instead. Don't assume it's live without checking that flag first.

---

## Supabase Realtime

Announcements use a Realtime channel subscription in `useAppStore.ts`.
Follow the same pattern for new live-update features: subscribe in
`useEffect`, clean up with `.unsubscribe()`.

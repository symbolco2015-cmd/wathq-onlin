# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Wathq Online** is an Arabic-first professional portfolio platform for teachers in Saudi Arabia. Teachers document evidence of professional achievement across 11 evaluated teaching categories. Portfolios are shareable via URL and exportable to PDF. The UI is entirely RTL (right-to-left).

---

## Commands

```bash
npm run dev       # Start Vite dev server on port 3000
npm run build     # Production build (outputs to dist/)
npm run lint      # Type-check with tsc --noEmit (no test suite exists)
npm run preview   # Preview the production build locally
npm run clean     # Remove dist/
```

There is no test framework configured. `npm run lint` is the only automated code verification step.

---

## Environment Variables

Copy `.env.example` and populate:

```
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # Supabase anon public key
GEMINI_API_KEY=          # Google Gemini API (injected at build by vite.config.ts)
APP_URL=                 # App host (used for OAuth callbacks and share links)
```

`GEMINI_API_KEY` is **not** prefixed with `VITE_` — it is injected into the build by `vite.config.ts` via `define`.

---

## Architecture

### Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS 4 + custom CSS design tokens (no component library)
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Key libs**: `@google/genai`, `recharts`, `jspdf`, `html-to-image`, `qrcode.react`, `motion`

### Page Routing

There is no router library. `App.tsx` manages pages with a simple state variable (`page: 'dashboard' | 'public' | 'admin'`). The `?share=USER_ID` query param triggers public portfolio view mode.

### State Management

All application state lives in two custom hooks:

- **`src/hooks/useAppStore.ts`** — Auth, user state, portfolio data, announcements. Returns the full `AppState` object plus mutation methods (`addEv`, `delEv`, `toggleStrat`, `addSub`, `delSub`, `updateNote`, `updateProfile`, etc.).
- **`src/hooks/useAdminStore.ts`** — Admin operations only; accepts `isAdmin: boolean` guard. Provides user management, analytics aggregation, announcement CRUD, and CSV export.
- **`src/hooks/usePublicProfile.ts`** — Fetches a public portfolio by user ID for the share view.

### Database Schema

One `portfolios` table holds **the entire app state as a single JSONB column** (`state`). The schema:

```sql
portfolios (id UUID FK→auth.users, state JSONB, created_at, updated_at)
admin_users (user_id UUID FK→auth.users, created_at)
announcements (id UUID, title, content, category, attachment_url, created_by FK→auth.users, created_at)
```

The `state` JSONB shape (defined in `src/types.ts`):
```typescript
{
  ev: Record<string, Evidence[]>       // keyed by "sectionId|subsectionName"
  strats: string[]                      // selected teaching strategy IDs
  csubs: Record<number, string[]>       // custom subsections per section index
  notes: Record<string, string>         // notes keyed by section
  profile: UserProfile
  readAnnouncements?: string[]
}
```

The full SQL schema is in `supabase_setup_complete.sql`.

### Dual Persistence Strategy

Every state mutation saves to **both** Supabase and `localStorage`. On startup, if Supabase is unavailable or credentials are missing, the app falls back to localStorage only. `supabaseClient.ts` exports `null` when env vars are absent so all Supabase calls must null-check the client.

### Admin Access

Admin status is determined by a hardcoded email list inside `useAppStore.ts` — **not** a database query. The `is_admin()` PostgreSQL function (SECURITY DEFINER) is used only for RLS policies, not for frontend gating. To grant admin access to a new user, both the `admin_users` table **and** the email list in `useAppStore.ts` must be updated.

### RLS Policies

- `portfolios`: public read (required for share feature), owner/admin write/delete
- `announcements`: public read, admin write/update/delete
- `admin_users`: users can only read their own row (prevents privilege escalation)

---

## Key Data: Teaching Categories

Defined in `src/data.ts` as `SECS` — an array of 11 objects, each with `id`, `name` (Arabic), `icon`, `color`, and `subs` (subsection array). The section index in `SECS` is used as the key in `csubs`. The composite key `"${section.id}|${subsectionName}"` is used throughout as the evidence map key (`ev`).

### Scoring System (`src/utils.ts` → `calculateEvaluation()`)

| Component | Max Points | Condition |
|---|---|---|
| Section completion | 50 pts | % of sections with ≥1 evidence |
| Evidence count | 30 pts | Capped at 15 evidences |
| Teaching strategies | 20 pts | Capped at 4 strategies |
| **Total** | **100 pts** | |

Certification levels: ≥85 → Distinguished (Gold), 50–84 → Officially Documented (Green), <50 → In Progress (Grey).

---

## UI Conventions

- **RTL throughout**: `index.html` sets `lang="ar" dir="rtl"`. All layout assumptions are RTL.
- **Design tokens**: Custom CSS variables in `src/index.css` — use `--em0`–`--em9` for emerald greens, `--gold`/`--gold2`/`--gold3` for gold accents, `--surf0`–`--surf5` for surface depths. Do not hardcode color values; reference these tokens.
- **Tailwind v4**: Uses the new `@import "tailwindcss"` syntax (not `@tailwind base/components/utilities`).
- **Icons**: Tabler Icons via CDN (`<i class="ti ti-*">`), not npm package. Lucide React is also installed for component icons.
- **Typography**: Tajawal (geometric) and Noto Naskh Arabic (serif) from Google Fonts.
- **No modal/toast library**: `src/components/UI.tsx` exports custom `Modal` and `Toast` components used app-wide.

---

## Component Responsibilities

| File | Role |
|---|---|
| `src/App.tsx` | Top-level layout, page switching, modal state, announcements banner |
| `src/components/Dashboard.tsx` | Portfolio editor — all section/evidence/strategy interactions |
| `src/components/Public.tsx` | Read-only shared portfolio view, PDF export, QR code |
| `src/components/Auth.tsx` | Login, register, password reset |
| `src/components/Admin/AdminDashboard.tsx` | Admin panel — user management, analytics charts, announcements CRUD |
| `src/components/Nav.tsx` | Navigation bar with page switcher |
| `src/components/Sidebar.tsx` | Desktop-only progress sidebar (hidden on mobile) |
| `src/components/Background.tsx` | Animated background gradient orbs |

---

## Working with Evidence

Evidence objects (`Evidence` type in `src/types.ts`) are stored by composite key. When adding evidence, the key is always `"${sectionId}|${subsectionName}"`. File uploads go to Supabase Storage; if unavailable, files are stored as base64 in localStorage (size-limited).

Evidence supports four types: `pdf`, `image`, `document`, `video`.

---

## Supabase Realtime

Announcements use a Supabase Realtime channel subscription in `useAppStore.ts`. When adding features that need live updates, follow the same pattern: subscribe in `useEffect`, return cleanup that calls `.unsubscribe()`.

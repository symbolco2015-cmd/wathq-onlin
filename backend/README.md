# Backend

- `api-server/` — Express proxy that forwards Gemini API calls (`/api/gemini`) so `GEMINI_API_KEY` never reaches the browser. See `api-server/.env.example` for required variables.
- `supabase/` — SQL run manually against the Supabase project (no migration tool wired up). See `supabase/README.md`.

## Running the API server

```bash
cd backend/api-server
npm install
cp .env.example .env   # fill in GEMINI_API_KEY
npm run server
```

The frontend's Vite dev server proxies `/api/*` to `http://localhost:3001`, where this server listens.

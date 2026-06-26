<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/7682b35a-3690-4532-adb9-dc98d9b28967

## Run Locally

**Prerequisites:**  Node.js

This repo is split into two independent projects:

```
frontend/            # React + Vite SPA
backend/api-server/  # Express proxy for Gemini calls
backend/supabase/    # SQL run manually in the Supabase SQL editor
```

1. Install dependencies in both projects:
   ```bash
   cd frontend && npm install
   cd ../backend/api-server && npm install
   ```
2. Copy `.env.example` to `.env` in each project and fill in the values:
   - `frontend/.env` — Supabase URL/anon key
   - `backend/api-server/.env` — `GEMINI_API_KEY`, `APP_URL`, `SERVER_PORT`
3. Run the app (two terminals):
   ```bash
   cd frontend && npm run dev
   cd backend/api-server && npm run server   # only needed for AI features
   ```

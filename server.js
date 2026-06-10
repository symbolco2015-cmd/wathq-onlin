import express from 'express';
import { createRequire } from 'module';

// Load .env manually (dotenv v17 ESM compatible)
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const API_KEY = process.env.GEMINI_API_KEY;
const APP_URL  = process.env.APP_URL || 'http://localhost:3000';
const PORT     = process.env.SERVER_PORT || 3001;

// CORS: accept only requests from the app itself
app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  const allowed =
    !origin ||
    origin === APP_URL ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin);

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/**
 * POST /api/gemini
 * Body: { prompt: string, model?: string }
 * Response: { text: string }
 *
 * Proxies to Google Generative AI so the API key never reaches the browser.
 */
app.post('/api/gemini', async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured on server.' });
  }

  const { prompt, model = 'gemini-2.0-flash' } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'prompt is required and must be a non-empty string.' });
  }

  try {
    // Dynamically import the SDK so the server starts even if the package
    // isn't installed (graceful degradation in non-AI deployments).
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const result = await ai.models.generateContent({
      model,
      contents: prompt.trim(),
    });

    return res.json({ text: result.text });
  } catch (err) {
    console.error('[gemini-proxy]', err?.message ?? err);
    return res.status(502).json({ error: 'Failed to call Gemini API.' });
  }
});

app.listen(PORT, () => {
  console.log(`[server] Gemini proxy → http://localhost:${PORT}`);
});

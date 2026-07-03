// Supabase Edge Function: suggest-from-image
//
// ميزة تجريبية (Beta): تحلّل صورة شاهد وتقترح وصفاً نصياً عربياً قابلاً
// للتعديل من المعلم قبل الحفظ. القالب معزول عن مزوّد الذكاء الاصطناعي —
// callAIProvider() هي النقطة الوحيدة التي تعرف تفاصيل Gemini؛ أي شيء آخر في
// هذا الملف يتعامل فقط مع الشكل الموحّد { description, section_id, indicator_id }.
//
// متغيرات البيئة المطلوبة (تُضبط من Supabase Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY   — مفتاح Gemini API
//   AI_MODEL_NAME    — اسم النموذج (مثال: gemini-2.0-flash)
// SUPABASE_URL و SUPABASE_ANON_KEY متوفرتان تلقائياً من بيئة تشغيل الدالة.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SuggestRequestBody {
  imageBase64: string;
  mimeType: string;
  section_id: number;
  indicator_id?: string;
}

interface UnifiedSuggestion {
  description: string;
  section_id: number;
  indicator_id: string | null;
}

/**
 * الدالة العامة الوحيدة التي تعرف تفاصيل مزوّد الذكاء الاصطناعي (Gemini):
 * شكل الطلب، الـ headers، وتفسير الرد. تغيير المزود مستقبلاً يعني تعديل
 * هذه الدالة فقط — لا شيء آخر في الملف يفترض شكل رد Gemini.
 */
async function callAIProvider(
  imageBase64: string,
  mimeType: string,
  promptText: string,
): Promise<{ description: string }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const modelName = Deno.env.get('AI_MODEL_NAME');
  if (!apiKey || !modelName) {
    throw new Error('AI provider is not configured (missing GEMINI_API_KEY or AI_MODEL_NAME).');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        }],
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI provider request failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('AI provider returned no usable text.');
  }

  return { description: text.trim() };
}

function buildPrompt(): string {
  return [
    'أنت مساعد يصف شواهد إنجاز مهني لمعلم في السعودية ضمن ملف إنجاز إلكتروني.',
    'انظر إلى الصورة المرفقة واكتب وصفاً موجزاً بالعربية الفصحى (جملتان إلى ثلاث جمل) يصف ما تُظهره',
    'الصورة كدليل على أداء مهني، دون ذكر أي معلومات شخصية أو وجوه أو أسماء طلاب قد تظهر في الصورة.',
    'اكتب الوصف مباشرة بدون مقدمات أو تنسيق Markdown.',
  ].join(' ');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = (await req.json().catch(() => null)) as SuggestRequestBody | null;
    if (!body?.imageBase64 || !body?.mimeType || typeof body?.section_id !== 'number') {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }
    const { imageBase64, mimeType, section_id, indicator_id } = body;

    // بوابة الحد اليومي — RPC موجودة أصلاً في المشروع، تُسجّل الاستخدام ذاتياً عند النجاح
    const { data: allowed, error: rpcError } = await supabase.rpc('check_and_log_ai_usage', {
      p_feature: 'image_suggestion',
      p_platform_daily_limit: 1200,
      p_user_daily_limit: 50,
    });

    if (rpcError) {
      console.error('[suggest-from-image] check_and_log_ai_usage error:', rpcError.message);
      return jsonResponse({ error: 'usage_check_failed' }, 500);
    }

    if (!allowed) {
      return jsonResponse({ error: 'daily_limit_reached' });
    }

    const { description } = await callAIProvider(imageBase64, mimeType, buildPrompt());

    const result: UnifiedSuggestion = {
      description,
      section_id,
      indicator_id: indicator_id ?? null,
    };
    return jsonResponse(result);
  } catch (err) {
    console.error('[suggest-from-image]', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

// Supabase Edge Function: generate-indicator-summary
//
// يولّد بالذكاء الاصطناعي جملة عربية قصيرة تلخّص نمط توثيق المعلم لمؤشر
// فرعي واحد ضمن بند 6 (إعداد خطة التعلم)، بناءً على أوصاف آخر 8 أدلة له،
// وتُخزَّن بجدول indicator_ai_summaries (UPSERT حقيقي — صف واحد لكل
// مؤشر لكل معلم). مستقلة تماماً عن generate-portfolio-summaries (ملخص
// الملف العام) — لا نطاق أو منطق مشترك بينهما غير _shared/ai-provider.ts.
//
// تُستدعى يدوياً فقط من زر "ولّد الملخص" لكل مؤشر في Dashboard.tsx —
// Authorization يحمل توكن جلسة المعلم الحالي. portfolio_id يُشتق حصراً من
// auth.getUser()، لا من جسم الطلب. indicator_id/section_id يصلان من
// العميل، لكن يُتحقَّق أن indicator_id ينتمي فعلاً لـsection_id المرسل
// عبر section_indicators قبل أي قراءة أو كتابة.
//
// متغيرات البيئة: GEMINI_API_KEY، AI_MODEL_NAME (موجودتان مسبقاً، عبر
// _shared/ai-provider.ts). SUPABASE_URL/SUPABASE_ANON_KEY تلقائيتان.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAIProviderText } from '../_shared/ai-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EVIDENCE_FETCH_LIMIT = 8;

interface EvidenceDescRow {
  description: string | null;
}

function buildPrompt(descriptions: string[]): string {
  const lines = descriptions.map((d, i) => `[${i}] ${d}`);
  return [
    'أنت مساعد يحلّل أوصاف شواهد وثّقها معلم في السعودية لمؤشر فرعي واحد ضمن ملف إنجازه المهني.',
    'فيما يلي أوصاف آخر الشواهد الموثّقة لهذا المؤشر تحديداً، الأحدث أولاً:',
    lines.join('\n'),
    'اكتب جملة عربية واحدة أو جملتين فقط (بلا أي مقدمة أو تنسيق Markdown أو علامات اقتباس) تلخّص نمط توثيق المعلم لهذا المؤشر تحديداً بالاعتماد حصراً على الأوصاف أعلاه دون افتراض أي معلومة غير مذكورة.',
  ].join('\n');
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);
    const portfolioId = userData.user.id;

    let body: { indicator_id?: unknown; section_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    const indicatorId = typeof body.indicator_id === 'string' ? body.indicator_id : null;
    const sectionId = typeof body.section_id === 'number' ? body.section_id : null;
    if (!indicatorId || sectionId === null) {
      return jsonResponse({ error: 'missing_fields' }, 400);
    }

    // تحقّق أن indicator_id ينتمي فعلاً لـsection_id المرسل — لا ثقة بأي
    // اقتران يرسله العميل بينهما
    const { data: indicatorRow, error: indicatorErr } = await userClient
      .from('section_indicators')
      .select('id')
      .eq('id', indicatorId)
      .eq('section_id', sectionId)
      .maybeSingle();
    if (indicatorErr) {
      console.error('[generate-indicator-summary] تعذّر التحقق من المؤشر:', indicatorErr.message);
      return jsonResponse({ error: 'internal_error' }, 500);
    }
    if (!indicatorRow) {
      return jsonResponse({ error: 'invalid_indicator' }, 400);
    }

    const { data: evidenceRows, error: evErr } = await userClient
      .from('evidence')
      .select('description')
      .eq('portfolio_id', portfolioId)
      .eq('indicator_id', indicatorId)
      .order('created_at', { ascending: false })
      .limit(EVIDENCE_FETCH_LIMIT);
    if (evErr) {
      console.error('[generate-indicator-summary] تعذّر جلب الشواهد:', evErr.message);
      return jsonResponse({ error: 'internal_error' }, 500);
    }

    const descriptions = ((evidenceRows ?? []) as EvidenceDescRow[])
      .map(e => e.description?.trim())
      .filter((d): d is string => !!d);

    if (descriptions.length === 0) {
      return jsonResponse({ generated: false, reason: 'no_description' });
    }

    let aiSentence: string;
    try {
      const { text } = await callAIProviderText(buildPrompt(descriptions));
      aiSentence = text.trim();
    } catch (aiErr) {
      console.error('[generate-indicator-summary] فشل نداء الذكاء الاصطناعي:', aiErr);
      return jsonResponse({ generated: false, reason: 'ai_call_failed' });
    }
    if (!aiSentence) {
      return jsonResponse({ generated: false, reason: 'ai_call_failed' });
    }

    const generatedAt = new Date().toISOString();
    const { error: upsertErr } = await userClient
      .from('indicator_ai_summaries')
      .upsert(
        { portfolio_id: portfolioId, section_id: sectionId, indicator_id: indicatorId, ai_sentence: aiSentence, generated_at: generatedAt },
        { onConflict: 'portfolio_id,section_id,indicator_id' },
      );
    if (upsertErr) {
      console.error('[generate-indicator-summary] فشل حفظ الملخص:', upsertErr.message);
      return jsonResponse({ error: 'internal_error' }, 500);
    }

    return jsonResponse({ generated: true, ai_sentence: aiSentence, generated_at: generatedAt });
  } catch (err) {
    console.error('[generate-indicator-summary]', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

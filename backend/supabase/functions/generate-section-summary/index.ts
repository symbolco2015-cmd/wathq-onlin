// Supabase Edge Function: generate-section-summary
//
// يولّد بالذكاء الاصطناعي جملة عربية قصيرة تلخّص نمط توثيق المعلم لبند
// "إعداد خطة التعلم" (section_id=6) كاملاً، بناءً على أوصاف آخر 8 أدلة
// موثّقة تحت هذا القسم (بغض النظر عن المؤشر الفرعي — أصلي أو مخصّص)،
// وتُخزَّن بجدول section_ai_summaries (UPSERT حقيقي — صف واحد لكل قسم
// لكل معلم). بديل نهائي لتصميم "زر لكل مؤشر"
// (generate-indicator-summary/indicator_ai_summaries) لهذا البند
// تحديداً — ذلك الملف والجدول يبقيان كما هما دون حذف أو تعديل، فقط لم
// يعودا مستخدَمين لهذه الميزة.
//
// تُستدعى يدوياً فقط من زر "ولّد الملخص" في Dashboard.tsx —
// Authorization يحمل توكن جلسة المعلم الحالي. portfolio_id يُشتق حصراً
// من auth.getUser()، لا من جسم الطلب. section_id يصل من العميل بلا
// تحقق ملكية إضافي (بخلاف indicator_id في generate-indicator-summary
// الذي يتحقق أنه ملك للمعلم عبر section_indicators) — لأن section_id
// هنا مجرد رقم قسم عام من data.ts لا سجل مملوك لمعلم آخر، وFK على
// section_ai_summaries.section_id يمنع أي قيمة غير صالحة عند UPSERT.
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
    'أنت مساعد يحلّل أوصاف شواهد وثّقها معلم في السعودية ضمن بند "إعداد خطة التعلم" الكامل بملف إنجازه المهني (يشمل كل مؤشراته الفرعية، الأصلية والمخصّصة معاً).',
    'فيما يلي أوصاف آخر الشواهد الموثّقة لهذا البند، الأحدث أولاً:',
    lines.join('\n'),
    'اكتب جملة عربية واحدة أو جملتين فقط (بلا أي مقدمة أو تنسيق Markdown أو علامات اقتباس) تلخّص نمط توثيق المعلم لهذا البند كاملاً بالاعتماد حصراً على الأوصاف أعلاه دون افتراض أي معلومة غير مذكورة.',
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

    let body: { section_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    const sectionId = typeof body.section_id === 'number' ? body.section_id : null;
    if (sectionId === null) {
      return jsonResponse({ error: 'missing_fields' }, 400);
    }

    const { data: evidenceRows, error: evErr } = await userClient
      .from('evidence')
      .select('description')
      .eq('portfolio_id', portfolioId)
      .eq('section_id', sectionId)
      .order('created_at', { ascending: false })
      .limit(EVIDENCE_FETCH_LIMIT);
    if (evErr) {
      console.error('[generate-section-summary] تعذّر جلب الشواهد:', evErr.message);
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
      console.error('[generate-section-summary] فشل نداء الذكاء الاصطناعي:', aiErr);
      return jsonResponse({ generated: false, reason: 'ai_call_failed' });
    }
    if (!aiSentence) {
      return jsonResponse({ generated: false, reason: 'ai_call_failed' });
    }

    const generatedAt = new Date().toISOString();
    const { error: upsertErr } = await userClient
      .from('section_ai_summaries')
      .upsert(
        { portfolio_id: portfolioId, section_id: sectionId, ai_sentence: aiSentence, generated_at: generatedAt },
        { onConflict: 'portfolio_id,section_id' },
      );
    if (upsertErr) {
      console.error('[generate-section-summary] فشل حفظ الملخص:', upsertErr.message);
      return jsonResponse({ error: 'internal_error' }, 500);
    }

    return jsonResponse({ generated: true, ai_sentence: aiSentence, generated_at: generatedAt });
  } catch (err) {
    console.error('[generate-section-summary]', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

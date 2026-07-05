// Supabase Edge Function: transcribe-voice
//
// ميزة تجريبية (Beta): تفريغ نصي لتسجيل صوتي قصير (حتى 30 ثانية) يسجّله
// المعلم كشاهد، مع اقتراح وصف مختصر — ومتى لم يكن القسم معروفاً مسبقاً
// (حالة "تسجيل صوتي سريع") تختار الذكاء الاصطناعي القسم الأنسب من قائمة
// تُرسَل معه. القالب معزول عن مزوّد الذكاء الاصطناعي بنفس أسلوب
// suggest-from-image — callAIProvider() (في _shared/ai-provider.ts) هي
// النقطة الوحيدة التي تعرف تفاصيل Gemini؛ أي شيء آخر هنا يتعامل فقط مع
// الشكل الموحّد { transcript, description, section_id, indicator_id }.
//
// متغيرات البيئة المطلوبة (تُضبط من Supabase Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY   — مفتاح Gemini API
//   AI_MODEL_NAME    — اسم النموذج (مثال: gemini-2.0-flash)
// SUPABASE_URL و SUPABASE_ANON_KEY متوفرتان تلقائياً من بيئة تشغيل الدالة.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAIProvider } from '../_shared/ai-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SectionOption {
  id: number;
  name: string;
}

interface TranscribeRequestBody {
  audioBase64: string;
  mimeType: string;
  /** معروف مسبقاً عند الاستدعاء من EvidenceForm (القسم مُختار سلفاً) — يُعاد كما هو دون تدخّل الذكاء الاصطناعي */
  section_id?: number;
  /** معروف مسبقاً عند الاستدعاء من EvidenceForm — يُعاد كما هو دون تدخّل الذكاء الاصطناعي */
  indicator_id?: string;
  /** تُرسَل فقط حين section_id غير معروف (التسجيل الصوتي السريع) ليختار الذكاء الاصطناعي الأنسب من بينها */
  sections?: SectionOption[];
}

interface UnifiedVoiceSuggestion {
  transcript: string;
  description: string;
  section_id: number | null;
  indicator_id: string | null;
}

function buildPrompt(sections?: SectionOption[]): string {
  const parts = [
    'أنت مساعد يوثّق شواهد إنجاز مهني لمعلم في السعودية ضمن ملف إنجاز إلكتروني.',
    'استمع إلى التسجيل الصوتي المرفق ونفّذ ما يلي:',
    '1) اكتب تفريغاً نصياً حرفياً لما قاله المتحدث بالعربية الفصحى.',
    '2) اكتب وصفاً موجزاً (جملتان إلى ثلاث جمل) يصف هذا كدليل أداء مهني، دون ذكر أي معلومات شخصية أو أسماء طلاب.',
  ];

  if (sections && sections.length > 0) {
    parts.push(
      '3) اختر الرقم (section_id) الأنسب لمحتوى التسجيل من هذه القائمة فقط (رقم: اسم):',
      sections.map(s => `${s.id}: ${s.name}`).join('، '),
    );
  }

  parts.push(
    'أعد الرد بصيغة JSON فقط دون أي تنسيق Markdown أو نص إضافي قبله أو بعده، بالشكل التالي بالضبط:',
    sections && sections.length > 0
      ? '{"transcript": "...", "description": "...", "section_id": الرقم المختار من القائمة أعلاه}'
      : '{"transcript": "...", "description": "..."}',
  );

  return parts.join(' ');
}

function parseAiResponse(raw: string): { transcript?: unknown; description?: unknown; section_id?: unknown } {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // الذكاء الاصطناعي لم يُعِد JSON صالحاً — استخدم النص الخام كتفريغ ووصف على حد سواء
    return { transcript: cleaned, description: cleaned };
  }
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

    const body = (await req.json().catch(() => null)) as TranscribeRequestBody | null;
    if (!body?.audioBase64 || !body?.mimeType) {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }
    const { audioBase64, mimeType, section_id, indicator_id, sections } = body;

    // بوابة الحد اليومي — نفس RPC المستخدمة في suggest-from-image، بمفتاح ميزة مستقل
    const { data: allowed, error: rpcError } = await supabase.rpc('check_and_log_ai_usage', {
      p_feature: 'voice_documentation',
      p_platform_daily_limit: 1200,
      p_user_daily_limit: 50,
    });

    if (rpcError) {
      console.error('[transcribe-voice] check_and_log_ai_usage error:', rpcError.message);
      return jsonResponse({ error: 'usage_check_failed' }, 500);
    }

    if (!allowed) {
      return jsonResponse({ error: 'daily_limit_reached' });
    }

    // القسم يُختار من الذكاء الاصطناعي فقط حين لا يصل section_id جاهزاً من الطالب
    const needsSectionSuggestion = typeof section_id !== 'number';
    const { text } = await callAIProvider(
      mimeType,
      audioBase64,
      buildPrompt(needsSectionSuggestion ? sections : undefined),
    );
    const parsed = parseAiResponse(text);

    const transcript = typeof parsed.transcript === 'string' ? parsed.transcript : '';
    const description = typeof parsed.description === 'string' ? parsed.description : transcript;

    let resolvedSectionId: number | null = null;
    if (typeof section_id === 'number') {
      resolvedSectionId = section_id;
    } else if (
      typeof parsed.section_id === 'number' &&
      sections?.some(s => s.id === parsed.section_id)
    ) {
      resolvedSectionId = parsed.section_id;
    } else if (sections && sections.length > 0) {
      resolvedSectionId = sections[0].id; // احتياط آمن إن تعذّر على الذكاء الاصطناعي الاختيار
    }

    const result: UnifiedVoiceSuggestion = {
      transcript,
      description,
      section_id: resolvedSectionId,
      indicator_id: indicator_id ?? null,
    };
    return jsonResponse(result);
  } catch (err) {
    console.error('[transcribe-voice]', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

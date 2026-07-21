// Supabase Edge Function: suggest-from-image
//
// ميزة تجريبية (Beta): تحلّل صورة شاهد وتقترح عنواناً، مؤشراً فرعياً، ووصفاً
// نصياً عربياً — الثلاثة قابلة للقبول أو الرفض بشكل مستقل من المعلم قبل
// الحفظ (كل حقل له قراره الخاص في الواجهة). القالب معزول عن مزوّد الذكاء
// الاصطناعي — callAIProvider() (في _shared/ai-provider.ts، مشتركة أيضاً مع
// transcribe-voice) هي النقطة الوحيدة التي تعرف تفاصيل Gemini؛ أي شيء آخر في
// هذا الملف يتعامل فقط مع { text } كنص خام ويفسّره حسب حاجته.
//
// section_id ثابت دائماً من سياق فتح النموذج في الفرونت (لا Dropdown لاختياره
// في EvidenceForm) — لذلك لا يُطلب من الذكاء الاصطناعي اقتراح قسم إطلاقاً،
// فقط عنوان + مؤشر فرعي ضمن هذا القسم بالذات + وصف.
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

const MAX_TITLE_LEN = 200;

interface SuggestRequestBody {
  imageBase64: string;
  mimeType: string;
  section_id: number;
}

interface IndicatorOption {
  id: string;
  name_ar: string;
}

interface RawSuggestion {
  title?: unknown;
  description?: unknown;
  indicator_index?: unknown;
  confidence?: unknown;
}

interface UnifiedSuggestion {
  title: string | null;
  description: string;
  indicator_id: string | null;
}

function buildPrompt(indicators: IndicatorOption[]): string {
  const parts = [
    'أنت مساعد يوثّق شواهد إنجاز مهني لمعلم في السعودية ضمن ملف إنجاز إلكتروني.',
    'انظر إلى الصورة المرفقة وحدد لها ما يلي، دون ذكر أي معلومات شخصية أو وجوه أو أسماء طلاب قد تظهر في الصورة:',
    '1) title: عنوان مقترح موجز بالعربية الفصحى (أقل من 8 كلمات) يصف الصورة كدليل أداء مهني.',
    '2) description: وصف موجز بالعربية الفصحى (جملتان إلى ثلاث جمل) يصف ما تُظهره الصورة كدليل أداء مهني.',
  ];

  if (indicators.length > 0) {
    parts.push(
      '3) indicator_index: الأنسب لمحتوى الصورة من هذه القائمة فقط (رقم الفهرس بالضبط كما ورد في القائمة)، أو null إن لم يكن أي مؤشر مناسباً بوضوح:',
      indicators.map((ind, i) => `${i}: ${ind.name_ar}`).join('، '),
      '4) confidence: اكتب "high" فقط إن كنت واثقاً تماماً من ملاءمة المؤشر المختار، وإلا اكتب "low" — استخدم "low" كلما راودك أدنى شك.',
      'اكتب الرد ككائن JSON واحد فقط دون أي نص إضافي أو تنسيق Markdown قبله أو بعده، بالشكل التالي بالضبط:',
      '{"title": "...", "description": "...", "indicator_index": الرقم_أو_null, "confidence": "high"}',
    );
  } else {
    parts.push(
      'لا توجد مؤشرات فرعية معرَّفة لهذا القسم، فلا تُضمِّن indicator_index أو confidence في ردك.',
      'اكتب الرد ككائن JSON واحد فقط دون أي نص إضافي أو تنسيق Markdown قبله أو بعده، بالشكل التالي بالضبط:',
      '{"title": "...", "description": "..."}',
    );
  }

  return parts.join(' ');
}

function parseAiResponse(raw: string): RawSuggestion | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RawSuggestion : null;
  } catch {
    return null;
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

    const body = (await req.json().catch(() => null)) as SuggestRequestBody | null;
    if (!body?.imageBase64 || !body?.mimeType || typeof body?.section_id !== 'number') {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }
    const { imageBase64, mimeType, section_id } = body;

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

    // مؤشرات القسم الحالي — نفس الاستعلام وترتيبه (.order('weight')) المستخدم
    // في EvidenceForm.tsx حتى يطابق ترتيب index المُرسَل لـ Gemini ما يراه
    // المعلم فعلياً في القائمة المنسدلة اليدوية. عطل هذا الاستعلام لا يُسقط
    // الطلب بالكامل — تُعتبر قائمة المؤشرات فارغة فقط (اقتراح العنوان والوصف
    // يستمران، بلا اقتراح مؤشر). قسم بلا أي مؤشرات معرَّفة يمر بنفس المسار
    // (indicators = [])، بلا أي انهيار.
    const { data: indicatorsData, error: indicatorsErr } = await supabase
      .from('section_indicators')
      .select('id, name_ar')
      .eq('section_id', section_id)
      .order('weight', { ascending: true });
    if (indicatorsErr) {
      console.error('[suggest-from-image] تعذّر جلب مؤشرات القسم:', indicatorsErr.message);
    }
    const indicators: IndicatorOption[] = indicatorsData ?? [];

    const { text } = await callAIProvider(mimeType, imageBase64, buildPrompt(indicators));
    const parsed = parseAiResponse(text);
    if (!parsed) {
      console.error('[suggest-from-image] تعذّر تفسير رد الذكاء الاصطناعي:', text);
      return jsonResponse({ error: 'ai_response_unparseable' }, 500);
    }

    const title = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, MAX_TITLE_LEN)
      : null;
    const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';

    // فحص أ) الثقة: لا يُعتمد أي indicator_id إلا إذا كانت الثقة "high" بالضبط —
    // أي شيء آخر (low، أو غياب الحقل، أو قيمة غير متوقعة) يُصفَّر لاحقاً.
    const isHighConfidence = parsed.confidence === 'high';

    // فحص ب) النطاق: index يجب أن يقع فعلياً ضمن المصفوفة المجلوبة من قاعدة
    // البيانات في هذا الطلب بالذات. مستقل تماماً عن فحص الثقة أعلاه — دفاع
    // مزدوج، لا نثق بثقة النموذج وحدها حتى لو ادّعى "high" لمؤشر غير موجود
    // أصلاً أو تجاوز حدود القائمة (هلوسة index).
    const rawIndex = typeof parsed.indicator_index === 'number' ? parsed.indicator_index : null;
    const isIndexInRange = rawIndex !== null
      && Number.isInteger(rawIndex)
      && rawIndex >= 0
      && rawIndex < indicators.length;

    const indicatorId: string | null = (isHighConfidence && isIndexInRange)
      ? indicators[rawIndex as number].id
      : null;

    const result: UnifiedSuggestion = { title, description, indicator_id: indicatorId };
    return jsonResponse(result);
  } catch (err) {
    console.error('[suggest-from-image]', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

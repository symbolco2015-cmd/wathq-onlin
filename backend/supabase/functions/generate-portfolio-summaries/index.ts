// Supabase Edge Function: generate-portfolio-summaries
//
// يولّد بالذكاء الاصطناعي ملخصاً عاماً (ai_summary) واختيار "أبرز إنجاز"
// (ai_top_achievement_evidence_id) لملفات المعلمين المشاركة علناً، لعرضهما في
// صفحة المشاركة العامة (Public.tsx). القالب معزول عن مزوّد الذكاء الاصطناعي
// بنفس أسلوب suggest-from-image/transcribe-voice/process-bulk-queue —
// callAIProviderText() (في ../_shared/ai-provider.ts) هي النقطة الوحيدة التي
// تعرف تفاصيل Gemini.
//
// تُستدعى بطريقتين (بنفس نمط process-bulk-queue):
//   1) من GitHub Actions أسبوعياً (.github/workflows/weekly-portfolio-summaries.yml)
//      بلا مستخدم مسجّل دخول — هيدر مخصّص X-Portfolio-Summary-Key يحمل مفتاح
//      secret الدالة (بوابة Supabase تتدخل تلقائياً بأي Authorization بصيغة
//      sb_...، لذلك هيدر مخصّص بديل يتفادى ذلك تماماً). تُعالِج دفعة من عدة
//      ملفات مرشّحة دفعة واحدة (BATCH_SIZE) عبر عميل مطوَّق بصلاحيات كاملة
//      (لازم لتحديث/قراءة صفوف معلمين متعددين وتجاوز RLS المقيَّد بالمالك).
//      قائمة المرشّحين هنا تُقيَّد بـ share_enabled = true (لا فائدة من تلخيص
//      ملف لن يُعرض علناً لأحد).
//   2) يدوياً من زر "تحديث الملخص الآن" في Dashboard.tsx — Authorization يحمل
//      توكن جلسة المعلم الحالي. تُعالِج ملف هذا المعلم حصراً (portfolio_id
//      المشتق من auth.getUser()، وليس من الطلب) عبر عميل مطوَّق بجلسته —
//      RLS الحالية (owner write) كافية هنا، لا حاجة لأي صلاحيات مرتفعة. يُطبَّق
//      نفس قيد share_enabled = true هنا أيضاً (فحص منفصل قبل الحجز — وليس
//      داخل شرط الحجز الذري نفسه، انظر الملاحظة أسفل claimPortfolio) حتى لا
//      يستهلك معلم لم يفعّل المشاركة نداءات Gemini على ملخص لن يظهر لأحد.
// في الحالتين تمر كل عملية "حجز" ملف واحد عبر نفس claimPortfolio() ونفس
// processPortfolio() بالضبط — لا يوجد أي نسخة ثانية من منطق الأهلية.
//
// منطق الحجز الذري: تحديث ai_summary_stale إلى false ضمن نفس عبارة UPDATE
// التي تتحقق من الشرط (WHERE ... RETURNING) بدل SELECT منفصل عن UPDATE — إن
// لم يُرجع صفاً فعملية أخرى (أو طلب آخر) سبقتنا بحجز هذا الملف بالذات. هذا
// الشرط (ai_summary_stale + كولداون 7 أيام) ثابت ومطابق حرفياً لما هو مطلوب،
// بلا أي إضافة عليه — قيد share_enabled يُفحَص بشكل منفصل قبل استدعائه (انظر
// أعلاه)، لا كجزء من عبارة UPDATE...RETURNING ذاتها.
//
// متغيرات البيئة المطلوبة (Supabase Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY                 — مفتاح Gemini API (موجود مسبقاً)
//   AI_MODEL_NAME                  — اسم النموذج (موجود مسبقاً)
//   PORTFOLIO_SUMMARY_SERVICE_KEY  — مفتاح secret جديد (sb_secret_...) لهذه
//                                    الدالة تحديداً، بنفس نمط BULK_IMPORT_SERVICE_KEY
//                                    في process-bulk-queue — يُستخدم لتوثيق
//                                    نداء GitHub Actions ولإنشاء العميل المطوَّق
//                                    بصلاحيات كاملة داخل الدالة لمسار الدفعة.
//   PORTFOLIO_SUMMARY_BATCH_SIZE   — اختياري، عدد الملفات المعالَجة كحد أقصى
//                                    بكل استدعاء دفعة (افتراضي 50 إن غاب أو
//                                    كانت القيمة غير صالحة).
// SUPABASE_URL و SUPABASE_ANON_KEY متوفرتان تلقائياً من بيئة تشغيل الدالة.
//
// ملخصات الأقسام (section_ai_summaries): تُولَّد في المسارين، الدفعة الأسبوعية
// وزر «تحديث الملخص الآن» بعد نجاح الحجز. ملخص واحد لكل قسم core لكل ملف محجوز،
// يُولَّد حين تتغيّر الشواهد الموصوفة التي يُبنى منها (source_key)، ويُحذف إن نزل
// القسم عن شاهدين موصوفين. انظر processSectionSummaries.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { callAIProviderText } from '../_shared/ai-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_BATCH_SIZE = 50;
const STALE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 أيام — نفس الفترة المستخدمة في نص زر التحديث اليدوي
// مهلة مسار الدفعة 6 أيام لا 7: التشغيل الأسبوعي والمهلة لو كانا 7 أيام بالضبط،
// فأي تقدّم بثوانٍ في موعد تشغيل GitHub يجعل الملف يُتخطى، فيصبح التوليد كل أسبوعين.
const BATCH_COOLDOWN_MS = 6 * 24 * 60 * 60 * 1000;

// حدود استخدام معقولة لتسجيل الاستخدام في ai_usage_log فقط (feature:
// 'public_summary') — وليست بوابة تمنع التوليد؛ الحجز الذري أعلاه هو البوابة
// الفعلية الوحيدة لهذه الميزة. القيم سخية عمداً حتى لا تعيق دفعة أسبوعية
// طبيعية أو تحديثاً يدوياً مشروعاً.
const USAGE_PLATFORM_DAILY_LIMIT = 1000;
const USAGE_USER_DAILY_LIMIT = 10;

const SECTION_EVIDENCE_LIMIT = 8;
const SECTION_MIN_DESCRIBED = 2;
const SECTION_USAGE_PLATFORM_DAILY_LIMIT = 1000;
const SECTION_USAGE_USER_DAILY_LIMIT = 20;

interface EvidenceRow {
  id: string;
  section_id: number;
  title: string;
  description: string | null;
}

interface RawAiResponse {
  summary?: unknown;
  top_achievement_index?: unknown;
  confidence?: unknown;
}

interface ProcessOutcome {
  claimed: boolean;
  summarized: boolean;
  reason?: 'no_evidence' | 'evidence_fetch_failed' | 'ai_call_failed';
}

function cooldownBoundaryIso(cooldownMs: number): string {
  return new Date(Date.now() - cooldownMs).toISOString();
}

function buildPrompt(
  evidence: EvidenceRow[],
  sectionNameById: Map<number, string>,
  strats: string[],
): string {
  const evidenceLines = evidence.map((e, i) =>
    `[${i}] القسم: ${sectionNameById.get(e.section_id) ?? 'غير معروف'} — العنوان: ${e.title} — الوصف: ${(e.description ?? '').trim() || 'بدون وصف'}`
  );

  const parts = [
    'أنت مساعد يكتب ملخصاً احترافياً لملف إنجاز معلم في السعودية، يُعرض في صفحة مشاركة عامة لزوار خارجيين (أولياء أمور، إدارة مدرسية، جهات تعليمية).',
    'فيما يلي الشواهد الموثقة في الملف، كل شاهد مرقّم بفهرس محلي بين قوسين مربعين:',
    evidenceLines.join('\n'),
  ];

  if (strats.length > 0) {
    parts.push(
      `كما يوثّق المعلم الاستراتيجيات التدريسية التالية ضمن ملفه (لا ترتبط بأي فهرس شاهد أعلاه، اذكرها ضمن الملخص العام إن كانت ذات دلالة): ${strats.join('، ')}`,
    );
  }

  parts.push(
    'المطلوب:',
    '1) summary: ملخص موجز بالعربية الفصحى (3 إلى 4 جمل) يبرز أهم إنجازات هذا المعلم بأسلوب احترافي، بالاعتماد حصراً على المعطيات أعلاه دون افتراض أي معلومة غير مذكورة، ودون ذكر أسماء طلاب أو معلومات شخصية حساسة.',
    '2) top_achievement_index: رقم فهرس الشاهد الأبرز والأكثر تميزاً من القائمة أعلاه فقط — قيّم جودة ووضوح المحتوى النصي (العنوان والوصف) لكل شاهد عند الاختيار، لا مجرد وجوده. استخدم null إن لم يتضح لك شاهد متميز بوضوح.',
    '3) confidence: اكتب "high" فقط إن كنت واثقاً تماماً من ملاءمة top_achievement_index، وإلا اكتب "low" — استخدم "low" كلما راودك أدنى شك أو كان top_achievement_index هو null.',
    'أعد الرد بصيغة JSON فقط دون أي نص إضافي أو تنسيق Markdown قبله أو بعده، بالشكل التالي بالضبط:',
    '{"summary": "...", "top_achievement_index": الرقم_أو_null, "confidence": "high"}',
  );

  return parts.join('\n');
}

function parseAiResponse(raw: string): RawAiResponse | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RawAiResponse : null;
  } catch {
    return null;
  }
}

// الحجز الذري: UPDATE...WHERE...RETURNING واحد، وليس SELECT منفصل عن UPDATE.
// نفس هذه الدالة بالضبط تُستدعى من مسار الدفعة (عميل بصلاحيات كاملة) ومسار
// التحديث اليدوي (عميل مطوَّق بجلسة المعلم) — أي اختلاف بينهما يكسر الضمانة.
// عمداً بلا فحص share_enabled هنا (الشرط المطلوب حرفياً لا بديل عنه) — يُفحَص
// share_enabled بشكل منفصل قبل استدعائها في كلا المسارين (انظر أعلى الملف).
async function claimPortfolio(client: SupabaseClient, portfolioId: string, cooldownMs: number): Promise<boolean> {
  const { data, error } = await client
    .from('portfolios')
    .update({ ai_summary_stale: false })
    .eq('id', portfolioId)
    .eq('ai_summary_stale', true)
    .or(`ai_summary_generated_at.is.null,ai_summary_generated_at.lt.${cooldownBoundaryIso(cooldownMs)}`)
    .select('id');

  if (error) {
    console.error('[generate-portfolio-summaries] فشل الحجز الذري:', portfolioId, error.message);
    return false;
  }
  return !!data && data.length > 0;
}

async function processPortfolio(client: SupabaseClient, portfolioId: string, cooldownMs: number): Promise<ProcessOutcome> {
  const claimed = await claimPortfolio(client, portfolioId, cooldownMs);
  if (!claimed) return { claimed: false, summarized: false };

  // الشواهد المؤهلة فقط — نفس فلتر get_shared_evidence (استبعاد "غير مصنّف")
  const { data: evidenceRows, error: evErr } = await client
    .from('evidence')
    .select('id, section_id, title, description')
    .eq('portfolio_id', portfolioId)
    .not('section_id', 'is', null);

  if (evErr) {
    console.error('[generate-portfolio-summaries] تعذّر جلب الشواهد:', portfolioId, evErr.message);
    return { claimed: true, summarized: false, reason: 'evidence_fetch_failed' };
  }

  const evidence = (evidenceRows ?? []) as EvidenceRow[];

  if (evidence.length === 0) {
    await client.from('portfolios').update({
      ai_summary: null,
      ai_top_achievement_evidence_id: null,
      ai_summary_generated_at: new Date().toISOString(),
    }).eq('id', portfolioId);
    return { claimed: true, summarized: false, reason: 'no_evidence' };
  }

  const sectionIds = [...new Set(evidence.map(e => e.section_id))];
  const { data: sectionsData, error: sectionsErr } = await client
    .from('sections')
    .select('id, name_ar')
    .in('id', sectionIds);
  if (sectionsErr) {
    console.error('[generate-portfolio-summaries] تعذّر جلب أسماء الأقسام:', portfolioId, sectionsErr.message);
  }
  const sectionNameById = new Map<number, string>((sectionsData ?? []).map((s: any) => [s.id, s.name_ar]));

  const { data: portfolioRow, error: portfolioErr } = await client
    .from('portfolios')
    .select('state')
    .eq('id', portfolioId)
    .single();
  if (portfolioErr) {
    console.error('[generate-portfolio-summaries] تعذّر جلب state.strats:', portfolioId, portfolioErr.message);
  }
  const strats: string[] = Array.isArray((portfolioRow as any)?.state?.strats)
    ? (portfolioRow as any).state.strats
    : [];

  let aiSummary: string | null = null;
  let topIndex: number | null = null;
  let confidence: string | null = null;
  let aiCallFailed = false;

  try {
    const { text } = await callAIProviderText(buildPrompt(evidence, sectionNameById, strats));
    const parsed = parseAiResponse(text);
    if (!parsed) {
      console.error('[generate-portfolio-summaries] تعذّر تفسير رد الذكاء الاصطناعي:', portfolioId, text);
      aiCallFailed = true;
    } else {
      aiSummary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null;
      topIndex = typeof parsed.top_achievement_index === 'number' ? parsed.top_achievement_index : null;
      confidence = typeof parsed.confidence === 'string' ? parsed.confidence : null;
    }
  } catch (aiErr) {
    console.error('[generate-portfolio-summaries] فشل نداء الذكاء الاصطناعي:', portfolioId, aiErr);
    aiCallFailed = true;
  }

  // فحص مزدوج مطابق لنمط suggest-from-image: الثقة "high" بالضبط، والفهرس ضمن
  // حدود المصفوفة المجلوبة في هذا الطلب — كلا الشرطين إلزاميان معاً
  const isHighConfidence = confidence === 'high';
  const isIndexInRange = topIndex !== null && Number.isInteger(topIndex) && topIndex >= 0 && topIndex < evidence.length;
  const topEvidenceId = (isHighConfidence && isIndexInRange) ? evidence[topIndex as number].id : null;

  await client.from('portfolios').update({
    ai_summary: aiSummary,
    ai_top_achievement_evidence_id: topEvidenceId,
    ai_summary_generated_at: new Date().toISOString(),
  }).eq('id', portfolioId);

  // تسجيل الاستخدام فقط (feature: 'public_summary') — لا يُعتمَد كبوابة هنا،
  // الكتابة أعلاه نجحت بصرف النظر عن نتيجته؛ p_portfolio_id صراحة لأن عميل
  // مسار الدفعة بلا جلسة مستخدم (auth.uid() فارغ)
  const { error: usageErr } = await client.rpc('check_and_log_ai_usage', {
    p_feature: 'public_summary',
    p_platform_daily_limit: USAGE_PLATFORM_DAILY_LIMIT,
    p_user_daily_limit: USAGE_USER_DAILY_LIMIT,
    p_portfolio_id: portfolioId,
  });
  if (usageErr) {
    console.error('[generate-portfolio-summaries] check_and_log_ai_usage error:', portfolioId, usageErr.message);
  }

  if (aiCallFailed) return { claimed: true, summarized: false, reason: 'ai_call_failed' };
  return { claimed: true, summarized: aiSummary !== null };
}

interface SectionSummaryOutcome {
  generated: number;
  unchanged: number;
  deleted: number;
}

function buildSectionPrompt(sectionName: string, descriptions: string[]): string {
  const lines = descriptions.map((d, i) => `[${i}] ${d}`);
  return [
    `أنت مساعد يحلّل أوصاف شواهد وثّقها معلم في السعودية ضمن بند "${sectionName}" الكامل بملف إنجازه المهني (يشمل كل مؤشراته الفرعية، الأصلية والمخصّصة معاً).`,
    'فيما يلي أوصاف آخر الشواهد الموثّقة لهذا البند، الأحدث أولاً:',
    lines.join('\n'),
    'اكتب جملة عربية واحدة أو جملتين فقط (بلا أي مقدمة أو تنسيق Markdown أو علامات اقتباس) تلخّص نمط توثيق المعلم لهذا البند كاملاً بالاعتماد حصراً على الأوصاف أعلاه دون افتراض أي معلومة غير مذكورة.',
  ].join('\n');
}

// بصمة الشواهد التي يُبنى منها الملخص: المعرّف وupdated_at والوصف لكل شاهد،
// مرتبة بالمعرّف. الوصف داخل البصمة كي يُكتشف التعديل حتى لو لم يتغيّر updated_at.
async function computeSourceKey(rows: { id: string; updated_at: string | null; description: string }[]): Promise<string> {
  const text = [...rows]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(r => `${r.id}|${r.updated_at ?? ''}|${r.description}`)
    .join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ملخص لكل قسم core، بعميل مفتاح الخدمة دائماً: المعلم لا يملك صلاحية الكتابة
// على section_ai_summaries (يغيّر hidden فقط). تُستدعى من المسارين:
//   - مسار الدفعة الأسبوعية، لكل ملف محجوز.
//   - زر «تحديث الملخص الآن»، إن نجح الحجز، بعميل خدمة منفصل و portfolioId
//     المشتق من auth.getUser(). الحجز اليدوي يضبط ai_summary_generated_at،
//     فيتخطى المسار الأسبوعي هذا الملف أياماً، ولولا ذلك لتأخرت ملخصات أقسامه.
async function processSectionSummaries(client: SupabaseClient, portfolioId: string): Promise<SectionSummaryOutcome> {
  const outcome: SectionSummaryOutcome = { generated: 0, unchanged: 0, deleted: 0 };

  const { data: coreSections, error: secErr } = await client
    .from('sections')
    .select('id, name_ar')
    .eq('section_type', 'core')
    .order('id');
  if (secErr) {
    console.error('[generate-portfolio-summaries] تعذّر جلب الأقسام العادية:', portfolioId, secErr.message);
    return outcome;
  }

  const { data: existingRows, error: exErr } = await client
    .from('section_ai_summaries')
    .select('section_id, source_key')
    .eq('portfolio_id', portfolioId);
  if (exErr) {
    console.error('[generate-portfolio-summaries] تعذّر جلب ملخصات الأقسام:', portfolioId, exErr.message);
    return outcome;
  }
  const existingKey = new Map<number, string | null>(
    ((existingRows ?? []) as { section_id: number; source_key: string | null }[]).map(r => [r.section_id, r.source_key]),
  );

  for (const section of (coreSections ?? []) as { id: number; name_ar: string }[]) {
    // الوصف الفارغ بعد إزالة المسافات لا يُفلتر في PostgREST، فيُفلتر هنا ثم تؤخذ أحدث 8
    const { data: evRows, error: evErr } = await client
      .from('evidence')
      .select('id, description, updated_at, created_at')
      .eq('portfolio_id', portfolioId)
      .eq('section_id', section.id)
      .not('description', 'is', null)
      .order('created_at', { ascending: false });
    if (evErr) {
      console.error('[generate-portfolio-summaries] تعذّر جلب شواهد القسم:', portfolioId, section.id, evErr.message);
      continue;
    }

    const described = ((evRows ?? []) as { id: string; description: string | null; updated_at: string | null }[])
      .map(r => ({ id: r.id, updated_at: r.updated_at, description: (r.description ?? '').trim() }))
      .filter(r => r.description.length > 0)
      .slice(0, SECTION_EVIDENCE_LIMIT);

    if (described.length < SECTION_MIN_DESCRIBED) {
      if (existingKey.has(section.id)) {
        const { error: delErr } = await client
          .from('section_ai_summaries')
          .delete()
          .eq('portfolio_id', portfolioId)
          .eq('section_id', section.id);
        if (delErr) {
          console.error('[generate-portfolio-summaries] تعذّر حذف ملخص القسم:', portfolioId, section.id, delErr.message);
        } else {
          outcome.deleted++;
        }
      }
      continue;
    }

    const sourceKey = await computeSourceKey(described);
    if (existingKey.get(section.id) === sourceKey) {
      outcome.unchanged++;
      continue;
    }

    // بوابة الاستخدام: check_and_log_ai_usage تقبل p_portfolio_id لأن auth.uid()
    // فارغ في مسار مفتاح الخدمة، ثم تستدعي is_feature_enabled('section_summary').
    // بلا auth.uid() لا يُطبَّق تفعيل المعلم الفردي (portfolio_feature_overrides)،
    // ويُعتمد على صف feature_flags العام وحده (يُوقَف من لوحة الأدمن ← الميزات).
    const { data: allowed, error: usageErr } = await client.rpc('check_and_log_ai_usage', {
      p_feature: 'section_summary',
      p_platform_daily_limit: SECTION_USAGE_PLATFORM_DAILY_LIMIT,
      p_user_daily_limit: SECTION_USAGE_USER_DAILY_LIMIT,
      p_portfolio_id: portfolioId,
    });
    if (usageErr || !allowed) {
      console.error(
        '[generate-portfolio-summaries] رُفض ملخص القسم، أُوقفت باقي أقسام هذا الملف:',
        portfolioId,
        usageErr?.message ?? 'usage_denied',
      );
      break;
    }

    let aiSentence = '';
    try {
      const { text } = await callAIProviderText(buildSectionPrompt(section.name_ar, described.map(d => d.description)));
      aiSentence = text.trim();
    } catch (aiErr) {
      // الصف القديم يبقى كما هو
      console.error('[generate-portfolio-summaries] فشل ملخص القسم:', portfolioId, section.id, aiErr);
      continue;
    }
    if (!aiSentence) {
      console.error('[generate-portfolio-summaries] رد فارغ لملخص القسم:', portfolioId, section.id);
      continue;
    }

    // لا hidden هنا: إن أخفى المعلم الملخص يبقى مخفياً بعد التحديث
    const { error: upErr } = await client
      .from('section_ai_summaries')
      .upsert(
        {
          portfolio_id: portfolioId,
          section_id: section.id,
          ai_sentence: aiSentence,
          generated_at: new Date().toISOString(),
          source_key: sourceKey,
        },
        { onConflict: 'portfolio_id,section_id' },
      );
    if (upErr) {
      console.error('[generate-portfolio-summaries] فشل حفظ ملخص القسم:', portfolioId, section.id, upErr.message);
      continue;
    }
    outcome.generated++;
  }

  return outcome;
}

async function fetchCandidatePortfolioIds(admin: SupabaseClient, batchSize: number, cooldownMs: number): Promise<string[]> {
  const { data, error } = await admin
    .from('portfolios')
    .select('id')
    .eq('ai_summary_stale', true)
    .eq('share_enabled', true)
    .or(`ai_summary_generated_at.is.null,ai_summary_generated_at.lt.${cooldownBoundaryIso(cooldownMs)}`)
    .order('ai_summary_generated_at', { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) {
    console.error('[generate-portfolio-summaries] تعذّر جلب الملفات المرشّحة:', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => r.id as string);
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

    // batchKey: سر مخصص لمقارنة هوية المتصل (GitHub Actions موثوق أم لا) فقط —
    // نص عشوائي، ليس مفتاح Supabase، ولا يصلح لإنشاء عميل قاعدة بيانات به.
    const batchKey = Deno.env.get('PORTFOLIO_SUMMARY_SERVICE_KEY')?.trim();

    const trustedHeader = req.headers.get('X-Portfolio-Summary-Key');
    const isTrustedBatchCall = !!batchKey && trustedHeader === batchKey;

    if (isTrustedBatchCall) {
      // serviceRoleKey: مفتاح Supabase الحقيقي كامل الصلاحيات، متوفر تلقائياً
      // بكل Edge Function بلا حاجة لضبطه يدوياً — هذا وحده يصلح لإنشاء عميل
      // admin. (كان الكود القديم يمرر batchKey هنا بالخطأ، ما يسبب
      // "Invalid API key" بكل استعلامات admin بلا استثناء — 13 سبتمبر 2026،
      // نفس الباگ الذي أُصلح في process-bulk-queue بنفس اليوم.)
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const admin = createClient(supabaseUrl, serviceRoleKey);

      const batchSizeEnv = Number(Deno.env.get('PORTFOLIO_SUMMARY_BATCH_SIZE'));
      const batchSize = Number.isFinite(batchSizeEnv) && batchSizeEnv > 0
        ? Math.floor(batchSizeEnv)
        : DEFAULT_BATCH_SIZE;

      // قائمة المرشّحين مقيَّدة بـ share_enabled = true هنا (لا داعي لتلخيص ملف
      // لن يُعرض علناً) — قيد منفصل عن شرط الحجز الذري نفسه، انظر الملاحظة
      // أعلى claimPortfolio.
      const candidateIds = await fetchCandidatePortfolioIds(admin, batchSize, BATCH_COOLDOWN_MS);

      let claimed = 0;
      let summarized = 0;
      let skippedNoEvidence = 0;
      let failed = 0;
      let sectionGenerated = 0;
      let sectionUnchanged = 0;
      let sectionDeleted = 0;

      for (const portfolioId of candidateIds) {
        const outcome = await processPortfolio(admin, portfolioId, BATCH_COOLDOWN_MS);
        if (!outcome.claimed) continue; // عملية أخرى سبقتنا بحجز هذا الملف
        claimed++;
        if (outcome.summarized) summarized++;
        else if (outcome.reason === 'no_evidence') skippedNoEvidence++;
        else failed++;

        // ملخصات الأقسام لكل ملف محجوز، مهما كانت نتيجة الملخص العام
        const sec = await processSectionSummaries(admin, portfolioId);
        sectionGenerated += sec.generated;
        sectionUnchanged += sec.unchanged;
        sectionDeleted += sec.deleted;
      }

      return jsonResponse({
        candidates: candidateIds.length,
        claimed,
        summarized,
        skipped_no_evidence: skippedNoEvidence,
        failed,
        section_summaries_generated: sectionGenerated,
        section_summaries_unchanged: sectionUnchanged,
        section_summaries_deleted: sectionDeleted,
      });
    }

    // مسار التحديث اليدوي — جلسة معلم مصادَق عليها فقط، يُعالِج ملفه الشخصي
    // حصراً (portfolio_id مشتق من الجلسة، وليس من جسم الطلب)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

    const portfolioId = userData.user.id;

    // نفس قيد share_enabled المطبَّق على قائمة مرشّحي الدفعة أعلاه، لكن كفحص
    // منفصل قبل الحجز — بلا مسّ شرط claimPortfolio نفسه (انظر تعليق الدالة)
    const { data: portfolioMeta, error: metaErr } = await userClient
      .from('portfolios')
      .select('share_enabled')
      .eq('id', portfolioId)
      .single();
    if (metaErr) {
      console.error('[generate-portfolio-summaries] تعذّر التحقق من share_enabled:', portfolioId, metaErr.message);
      return jsonResponse({ error: 'internal_error' }, 500);
    }
    if (!portfolioMeta?.share_enabled) {
      return jsonResponse({ updated: false, reason: 'sharing_disabled' });
    }

    const outcome = await processPortfolio(userClient, portfolioId, STALE_COOLDOWN_MS);
    if (!outcome.claimed) {
      return jsonResponse({ updated: false, reason: 'not_eligible' });
    }

    // ملخصات الأقسام بعميل مفتاح الخدمة (انظر التعليق فوق processSectionSummaries)؛
    // portfolioId مشتق من auth.getUser() أعلاه، لا من جسم الطلب
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const sec = await processSectionSummaries(admin, portfolioId);

    return jsonResponse({
      updated: true,
      summarized: outcome.summarized,
      reason: outcome.reason ?? null,
      section_summaries_generated: sec.generated,
      section_summaries_unchanged: sec.unchanged,
      section_summaries_deleted: sec.deleted,
    });
  } catch (err) {
    console.error('[generate-portfolio-summaries]', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

// Supabase Edge Function: process-bulk-queue
//
// تصنّف صور "الاستيراد الجماعي" المنتظرة في bulk_import_queue (status='pending')
// عبر الذكاء الاصطناعي، دفعات من 8 صور بنداء Gemini واحد لكل معلم، الأقدم أولاً
// وبالتناوب بين المعلمين المنتظرين (بدل تفريغ الحصة اليومية على معلم واحد).
// القالب معزول عن مزوّد الذكاء الاصطناعي بنفس أسلوب suggest-from-image/
// transcribe-voice — callAIProviderMultiImage() (في _shared/ai-provider.ts) هي
// النقطة الوحيدة التي تعرف تفاصيل Gemini.
//
// تُستدعى بطريقتين:
//   1) من pg_cron بلا مستخدم مسجّل دخول — Authorization يحمل مفتاح secret الدالة.
//   2) يدوياً من الفرونت مباشرة بعد رفع دفعة (useBulkImport) — Authorization يحمل
//      توكن المستخدم الحالي (anon-signed JWT)، يُتحقق منه عبر auth.getUser().
// في الحالتين، كل عمليات القراءة/الكتابة على bulk_import_queue تمر عبر عميل
// مطوَّق بمفتاح secret الدالة نفسه (BULK_IMPORT_SERVICE_KEY) — لا توجد سياسة UPDATE
// للمستخدم على هذا الجدول عمداً، وتصنيف دفعة معلمين متعددين بنداء واحد يستلزم
// تجاوز RLS المقيَّد بـ portfolio_id = auth.uid() لكل مستخدم.
//
// متغيرات البيئة المطلوبة (Supabase Dashboard → Edge Functions → Secrets):
//   GEMINI_API_KEY        — مفتاح Gemini API
//   AI_MODEL_NAME         — اسم النموذج (مثال: gemini-2.0-flash)
//   BULK_IMPORT_SERVICE_KEY — مفتاح secret الجديد (sb_secret_...) للمشروع، وليس
//                           service_role القديم — يُستخدم لتوثيق نداء pg_cron
//                           ولإنشاء العميل المطوَّق بصلاحيات كاملة داخل الدالة.
// SUPABASE_URL و SUPABASE_ANON_KEY متوفرتان تلقائياً من بيئة تشغيل الدالة.
//
// هذه الدالة تعمل دائماً بعميل مطوَّق بمفتاح secret الدالة (بلا جلسة مستخدم)،
// فـ auth.uid() يرجع NULL داخل check_and_log_ai_usage. لهذا يُمرَّر portfolio_id
// المعلم الحالي صراحةً عبر المعامل الرابع p_portfolio_id (أُضيف على قاعدة
// البيانات يدوياً على الإنتاج لهذا الغرض تحديداً) بدل الاعتماد على auth.uid() —
// هذا ما يطبّق حد الـ50 طلب/يوم لكل معلم بشكل صحيح أثناء معالجة الطابور.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callAIProviderMultiImage } from '../_shared/ai-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE_PER_TEACHER = 8;
const PLATFORM_DAILY_LIMIT = 1200;
const USER_DAILY_LIMIT = 50;
const MAX_TITLE_LEN = 200;
// حد أقصى لعدد الدفعات المعالَجة بكل استدعاء واحد (يدوي أو من pg_cron) — يمنع
// التهام الطابور بالكامل بنداء واحد قد يتجاوز مهلة تنفيذ Edge Function (EarlyDrop/
// timeout). الصفوف المتبقية تبقى pending بلا أي تعديل عليها وتُعالَج بالاستدعاء التالي.
const MAX_BATCHES_PER_INVOCATION = 3;

interface QueueRow {
  id: string;
  portfolio_id: string;
  file_path: string;
  file_type: string;
  status: string;
  created_at: string;
}

interface SectionOption {
  id: number;
  name: string;
}

interface RawClassification {
  index?: unknown;
  section_id?: unknown;
  title?: unknown;
  confidence?: unknown;
}

function buildPrompt(sections: SectionOption[], count: number): string {
  return [
    'أنت مساعد يصنّف صور شواهد إنجاز مهني لمعلمين في السعودية ضمن ملفات إنجاز إلكترونية.',
    `ستستلم ${count} صورة مرقّمة بالترتيب من 1 إلى ${count} (نفس ترتيب إرسالها). حلّل كل صورة على حدة وحدد لها:`,
    '1) section_id: الأنسب لمحتوى الصورة من هذه القائمة فقط (رقم: اسم)، أو null إن لم يكن أي قسم مناسباً بوضوح:',
    sections.map(s => `${s.id}: ${s.name}`).join('، '),
    '2) title: عنوان مقترح موجز بالعربية الفصحى (أقل من 8 كلمات) يصف الصورة كدليل أداء مهني، دون ذكر أسماء أو معلومات شخصية.',
    '3) confidence: اكتب "high" فقط إن كنت واثقاً تماماً من ملاءمة القسم المختار، وإلا اكتب "low" — استخدم "low" كلما راودك أدنى شك.',
    'أعد الرد كمصفوفة JSON فقط دون أي نص إضافي أو تنسيق Markdown قبله أو بعده، بالشكل التالي بالضبط لكل صورة:',
    '[{"index": 1, "section_id": الرقم_أو_null, "title": "...", "confidence": "high"}, {"index": 2, "section_id": الرقم_أو_null, "title": "...", "confidence": "low"}]',
  ].join(' ');
}

function parseAiResponse(raw: string): RawClassification[] {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function downloadAsBase64(
  admin: ReturnType<typeof createClient>,
  filePath: string,
): Promise<{ mimeType: string; base64Data: string }> {
  const { data: blob, error } = await admin.storage.from('evidence').download(filePath);
  if (error || !blob) throw error ?? new Error('empty_file');
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return { mimeType: blob.type || 'image/jpeg', base64Data: btoa(binary) };
}

Deno.serve(async (req: Request) => {
  console.log('[DEBUG] method:', req.method, 'has_auth_header:', !!req.headers.get('Authorization'), 'auth_header_length:', req.headers.get('Authorization')?.length ?? 0);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const trustedHeader = req.headers.get('X-Bulk-Import-Key');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // bulkImportKey: سر مخصص لمقارنة هوية المتصل (pg_cron موثوق أم لا) فقط —
    // نص عشوائي، ليس مفتاح Supabase، ولا يصلح لإنشاء عميل قاعدة بيانات به.
    const bulkImportKey = Deno.env.get('BULK_IMPORT_SERVICE_KEY')?.trim();
    if (!bulkImportKey) {
      console.error('[process-bulk-queue] BULK_IMPORT_SERVICE_KEY غير مضبوط');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    // serviceRoleKey: مفتاح Supabase الحقيقي كامل الصلاحيات، متوفر تلقائياً
    // بكل Edge Function بلا حاجة لضبطه يدوياً — هذا وحده يصلح لإنشاء عميل admin.
    // (كان الكود القديم يمرر bulkImportKey هنا بالخطأ، ما يسبب "Invalid API key"
    // بكل استعلامات admin بلا استثناء — 13 سبتمبر 2026.)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // الحالة 1: نداء pg_cron — هيدر مخصص X-Bulk-Import-Key يحمل مفتاح secret الدالة
    // مباشرة. بوابة Supabase تتدخل تلقائياً بأي قيمة Authorization بصيغة sb_...،
    // لذلك تعذّر تمرير هذا المفتاح عبر Authorization كما كان سابقاً — هيدر مخصص
    // بديل يتفادى تدخّل البوابة تماماً
    const isTrustedCron = trustedHeader === bulkImportKey;

    // الحالة 2: نداء يدوي فوري بعد الرفع — Authorization يحمل توكن مستخدم حقيقي.
    // Authorization مطلوب فقط بهذا المسار الآن (وليس أعلى الدالة) لأن نداء
    // pg_cron الموثوق لم يعد يحمل Authorization إطلاقاً بعد الانتقال للهيدر أعلاه
    if (!isTrustedCron) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ error: 'unauthorized' }, 401);
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);
    }

    // كل القراءة/الكتابة من هنا فصاعداً عبر عميل مطوَّق بصلاحيات كاملة — لازم
    // لمعالجة صفوف معلمين متعددين بتشغيلة واحدة وتحديث صفوف بلا سياسة UPDATE للمستخدم
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1) قائمة الأقسام ديناميكياً من جدول sections (لا تُكتب ثابتة بالكود)
    const { data: sectionsData, error: sectionsErr } = await admin
      .from('sections')
      .select('id, name_ar')
      .order('id', { ascending: true });
    if (sectionsErr || !sectionsData?.length) {
      console.error('[process-bulk-queue] تعذّر جلب الأقسام:', sectionsErr?.message);
      return jsonResponse({ error: 'sections_unavailable' }, 500);
    }
    const sections: SectionOption[] = sectionsData.map((s: any) => ({ id: s.id, name: s.name_ar }));
    const validSectionIds = new Set(sections.map(s => s.id));

    // 2) كل الصفوف pending، الأقدم أولاً
    const { data: pendingRows, error: pendingErr } = await admin
      .from('bulk_import_queue')
      .select('id, portfolio_id, file_path, file_type, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (pendingErr) {
      console.error('[process-bulk-queue] تعذّر جلب الطابور:', pendingErr.message);
      return jsonResponse({ error: 'queue_fetch_failed' }, 500);
    }

    let processed = 0;
    let classified = 0;
    let failed = 0;
    let platformLimitReached = false;
    let invocationBudgetReached = false;
    let batchesProcessedThisInvocation = 0;

    const rows = (pendingRows ?? []) as QueueRow[];
    if (rows.length > 0) {
      // 3) تجميع حسب portfolio_id، مرتّبة حسب أقدم شاهد لكل معلم — ثم معالجة
      // بالتناوب (دفعة واحدة بحد أقصى لكل معلم بكل دورة) بدل تفريغ الحصة
      // اليومية على معلم واحد إذا كان هناك طابور لعدة معلمين
      const byPortfolio = new Map<string, QueueRow[]>();
      for (const row of rows) {
        if (!byPortfolio.has(row.portfolio_id)) byPortfolio.set(row.portfolio_id, []);
        byPortfolio.get(row.portfolio_id)!.push(row);
      }
      const teacherQueues = Array.from(byPortfolio.entries())
        .sort((a, b) => new Date(a[1][0].created_at).getTime() - new Date(b[1][0].created_at).getTime())
        .map(([portfolioId, teacherRows]) => ({ portfolioId, remaining: [...teacherRows] }));

      let progressedThisRound = true;
      while (progressedThisRound && !platformLimitReached && !invocationBudgetReached) {
        progressedThisRound = false;

        for (const teacher of teacherQueues) {
          if (platformLimitReached || invocationBudgetReached) break;
          if (teacher.remaining.length === 0) continue;

          // توقف فوراً قبل بدء أي دفعة جديدة إن بلغنا حد الدفعات لهذا الاستدعاء —
          // الصفوف المتبقية تبقى pending بلا أي تعديل عليها لتُعالَج بالاستدعاء التالي
          if (batchesProcessedThisInvocation >= MAX_BATCHES_PER_INVOCATION) {
            invocationBudgetReached = true;
            break;
          }

          // p_portfolio_id: auth.uid() فارغ دائماً هنا (عميل بمفتاح secret بلا
          // جلسة مستخدم) — يُمرَّر معلم هذه الدفعة صراحةً ليُطبَّق حد الـ50/يوم
          // له تحديداً بدل تجميع كل المعلمين تحت مستخدم واحد فارغ
          const { data: allowed, error: rpcError } = await admin.rpc('check_and_log_ai_usage', {
            p_feature: 'bulk_import',
            p_platform_daily_limit: PLATFORM_DAILY_LIMIT,
            p_user_daily_limit: USER_DAILY_LIMIT,
            p_portfolio_id: teacher.portfolioId,
          });
          if (rpcError) {
            console.error('[process-bulk-queue] check_and_log_ai_usage error:', rpcError.message);
            platformLimitReached = true;
            break;
          }
          if (!allowed) {
            platformLimitReached = true;
            break;
          }

          const batch = teacher.remaining.splice(0, BATCH_SIZE_PER_TEACHER);
          progressedThisRound = true;
          batchesProcessedThisInvocation++;

          // تنزيل كل صور الدفعة بالتوازي بدل التسلسل — كل تنزيل مستقل عن الآخر،
          // لا داعي لانتظار كل واحد على حدة قبل بدء التالي
          const downloadResults = await Promise.allSettled(batch.map(row => downloadAsBase64(admin, row.file_path)));
          const images: { mimeType: string; base64Data: string }[] = [];
          const validRows: QueueRow[] = [];
          for (let i = 0; i < batch.length; i++) {
            const row = batch[i];
            const result = downloadResults[i];
            if (result.status === 'fulfilled') {
              images.push(result.value);
              validRows.push(row);
            } else {
              console.error('[process-bulk-queue] تعذّر تنزيل الصورة:', row.file_path, result.reason);
              processed++;
              failed++;
              await admin.from('bulk_import_queue').update({
                status: 'failed',
                error_message: 'download_failed',
                processed_at: new Date().toISOString(),
              }).eq('id', row.id);
            }
          }

          if (validRows.length === 0) continue;

          let results: RawClassification[] = [];
          try {
            const { text } = await callAIProviderMultiImage(images, buildPrompt(sections, validRows.length));
            results = parseAiResponse(text);
          } catch (aiErr) {
            console.error('[process-bulk-queue] فشل نداء الذكاء الاصطناعي:', aiErr);
          }

          for (let i = 0; i < validRows.length; i++) {
            const row = validRows[i];
            const match = results.find(r => Number(r.index) === i + 1);
            processed++;

            if (!match) {
              failed++;
              await admin.from('bulk_import_queue').update({
                status: 'failed',
                error_message: 'no_ai_result',
                processed_at: new Date().toISOString(),
              }).eq('id', row.id);
              continue;
            }

            // لا يُوثَق بأي section_id راجع من الذكاء الاصطناعي إلا إذا كانت
            // الثقة "high" بالضبط — أي شيء آخر (low أو قيمة غير متوقعة) يُصفَّر
            const isHighConfidence = match.confidence === 'high';
            const rawSectionId = typeof match.section_id === 'number' ? match.section_id : null;
            const suggestedSectionId = isHighConfidence && rawSectionId !== null && validSectionIds.has(rawSectionId)
              ? rawSectionId
              : null;
            const suggestedTitle = typeof match.title === 'string' && match.title.trim()
              ? match.title.trim().slice(0, MAX_TITLE_LEN)
              : null;

            classified++;
            await admin.from('bulk_import_queue').update({
              status: 'classified',
              suggested_section_id: suggestedSectionId,
              suggested_title: suggestedTitle,
              processed_at: new Date().toISOString(),
            }).eq('id', row.id);
          }
        }
      }
    }

    const { count: remainingPending } = await admin
      .from('bulk_import_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    return jsonResponse({
      processed,
      classified,
      failed,
      remaining_pending: remainingPending ?? 0,
    });
  } catch (err) {
    console.error('[process-bulk-queue]', err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

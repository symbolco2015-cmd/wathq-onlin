// Supabase Edge Function: admin-portfolio-action
//
// إعادة تعيين ملف معلم، أو حذف حسابه فوراً بلا مهلة (لحسابات التجربة)، للأدمن فقط.
// الحذف العادي بمهلة 10 أيام لا يمر من هنا: admin_schedule_deletion() تجدوله،
// و purge-scheduled-accounts تنفّذه.
//
// المدخل:
//   { portfolio_id: uuid, mode: 'reset',  confirm_name: string }
//   { portfolio_id: uuid, mode: 'delete', confirm_email: string }
// الرد الناجح:
//   reset:  { ok: true, mode, counts, storage_deleted, storage_errors }
//   delete: { ok: true, mode, storage_deleted }
// الرد الفاشل: { error: <code>, message }
//
// - reset: admin_reset_portfolio_data() (معاملة واحدة) ثم حذف ملفات {id}/ في
//   evidence و evidence-video و evidence-audio. الصورة الشخصية في حاوية
//   avatars ({id}/avatar.jpg) لا تُلمس. يبقى الملف الشخصي والإعدادات و
//   ai_usage_log و portfolio_feature_overrides.
//   قاعدة البيانات أولاً ثم التخزين: فشل التخزين يترك ملفات يتيمة تُنظَّف بإعادة
//   المحاولة، وهذا أهون من شواهد تشير إلى ملفات محذوفة.
// - delete: حذف كامل بترتيب الحذف النهائي نفسه (purgeUserAccount): ملفات
//   الحاويات الأربع، ثم التحقق أن لا شيء بقي، ثم auth.users (الـ CASCADE
//   يحذف portfolios وما يتبعه). التأكيد بالبريد كاملاً لا بالاسم.
//
// هوية المستدعي من JWT فقط (عميل anon + Authorization)، لا من جسم الطلب.
// كل ما بعد التحقق بعميل SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CONTENT_BUCKETS, deleteUserStorage, purgeUserAccount } from '../_shared/user-storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActionInput =
  | { portfolioId: string; mode: 'reset'; confirmName: string }
  | { portfolioId: string; mode: 'delete'; confirmEmail: string };

class ActionError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseBody(raw: unknown): ActionInput {
  const invalid = (message: string) => new ActionError('invalid_request', message);
  if (!isRecord(raw)) throw invalid('جسم الطلب غير صالح.');

  const { portfolio_id, mode, confirm_name, confirm_email } = raw;
  if (typeof portfolio_id !== 'string' || !UUID_RE.test(portfolio_id)) {
    throw invalid('معرّف الملف غير صالح.');
  }
  const portfolioId = portfolio_id.toLowerCase();

  if (mode === 'reset') {
    if (typeof confirm_name !== 'string' || !confirm_name.trim()) {
      throw invalid('اسم التأكيد مطلوب.');
    }
    return { portfolioId, mode, confirmName: confirm_name };
  }
  if (mode === 'delete') {
    if (typeof confirm_email !== 'string' || !confirm_email.trim()) {
      throw invalid('البريد الإلكتروني للتأكيد مطلوب.');
    }
    return { portfolioId, mode, confirmEmail: confirm_email };
  }
  throw invalid('نوع العملية غير صالح.');
}

function readProfileName(state: unknown): string {
  if (!isRecord(state)) return '';
  const profile = state.profile;
  if (!isRecord(profile)) return '';
  return typeof profile.name === 'string' ? profile.name.trim() : '';
}

function toCounts(data: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!isRecord(data)) return counts;
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'number') counts[k] = v;
  }
  return counts;
}

const normalizeEmail = (s: string) => s.trim().toLowerCase();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed', message: 'الطريقة غير مسموحة.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) المستدعي: هويته من JWT فقط
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'unauthorized', message: 'يلزم تسجيل الدخول.' }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized', message: 'يلزم تسجيل الدخول.' }, 401);
    const adminId = userData.user.id;

    const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin');
    if (adminErr || isAdmin !== true) {
      return jsonResponse({ error: 'forbidden', message: 'هذه العملية للأدمن فقط.' }, 403);
    }

    // 2) المدخل
    const input = parseBody(await req.json().catch(() => null));
    const { portfolioId } = input;

    // 3) عميل الخدمة لكل ما بعد التحقق
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 4) الحمايات: الهدف ليس أدمن، والملف موجود
    const { data: targetAdmin, error: targetAdminErr } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', portfolioId)
      .maybeSingle();
    if (targetAdminErr) {
      console.error('[admin-portfolio-action] admin_users lookup error:', targetAdminErr.message);
      return jsonResponse({ error: 'db_failed', message: 'تعذّر التحقق من الحساب المستهدف.' }, 500);
    }
    if (targetAdmin) {
      return jsonResponse({ error: 'target_is_admin', message: 'لا يمكن تنفيذ هذه العملية على حساب أدمن.' }, 400);
    }

    const { data: portfolio, error: portfolioErr } = await admin
      .from('portfolios')
      .select('state')
      .eq('id', portfolioId)
      .maybeSingle();
    if (portfolioErr) {
      console.error('[admin-portfolio-action] portfolio lookup error:', portfolioErr.message);
      return jsonResponse({ error: 'db_failed', message: 'تعذّر قراءة الملف المستهدف.' }, 500);
    }
    if (!portfolio) {
      return jsonResponse({ error: 'not_found', message: 'الملف غير موجود.' }, 404);
    }

    // 5أ) الحذف الفوري: البريد مطابق لحساب الدخول، ثم الحذف الكامل
    if (input.mode === 'delete') {
      const { data: target, error: targetErr } = await admin.auth.admin.getUserById(portfolioId);
      if (targetErr || !target?.user) {
        console.error('[admin-portfolio-action] auth user lookup error:', targetErr?.message ?? 'no user');
        return jsonResponse({ error: 'db_failed', message: 'تعذّر قراءة حساب الدخول المستهدف.' }, 500);
      }
      const targetEmail = target.user.email ? normalizeEmail(target.user.email) : '';
      if (!targetEmail || targetEmail !== normalizeEmail(input.confirmEmail)) {
        return jsonResponse({ error: 'email_mismatch', message: 'البريد المكتوب لا يطابق بريد المعلم.' }, 400);
      }

      const result = await purgeUserAccount(admin, portfolioId);
      if (!result.ok) {
        console.error('[admin-portfolio-action] immediate delete failed:', result.stage, result.message);
        return jsonResponse({
          error: 'delete_failed',
          message: result.stage === 'auth' || result.stage === 'verify_portfolio'
            ? 'حُذفت الملفات وتعذّر حذف الحساب. أعد المحاولة.'
            : 'تعذّر حذف الملفات، ولم يُحذف الحساب. أعد المحاولة.',
        }, 500);
      }

      // السجل: نوع الفعل فقط، بلا اسم ولا بريد
      const { error: logErr } = await admin.from('admin_audit_log').insert({
        admin_id: adminId,
        action: 'portfolio.immediate_delete',
        target_portfolio_id: portfolioId,
        details: { type: 'immediate_delete', scheduled_at: null },
      });
      if (logErr) console.error('[admin-portfolio-action] audit log error:', logErr.message);

      return jsonResponse({ ok: true, mode: 'delete', storage_deleted: result.storageDeleted });
    }

    // 5ب) إعادة التعيين: الاسم مطابق، ثم قاعدة البيانات أولاً. إن فشلت لا يُلمس التخزين.
    const profileName = readProfileName(portfolio.state);
    if (!profileName || profileName !== input.confirmName.trim()) {
      return jsonResponse({ error: 'name_mismatch', message: 'اسم التأكيد لا يطابق اسم المعلم.' }, 400);
    }

    const { data, error } = await admin.rpc('admin_reset_portfolio_data', { p_portfolio_id: portfolioId });
    if (error) {
      console.error('[admin-portfolio-action] reset rpc error:', error.message);
      return jsonResponse({ error: 'db_failed', message: 'تعذّرت إعادة التعيين في قاعدة البيانات، ولم يُحذف شيء.' }, 500);
    }
    const counts = toCounts(data);

    // 6) التخزين
    const storage = await deleteUserStorage(admin, portfolioId, CONTENT_BUCKETS, true);
    if (storage.errors.length) {
      console.error('[admin-portfolio-action] storage errors:', storage.errors.length);
    }

    // 7) السجل: بلا اسم ولا بريد. فشله لا يُفشل الرد لأن العملية تمت.
    const { error: logErr } = await admin.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'portfolio.reset',
      target_portfolio_id: portfolioId,
      details: {
        counts,
        storage_deleted: storage.deleted,
        storage_errors_count: storage.errors.length,
      },
    });
    if (logErr) console.error('[admin-portfolio-action] audit log error:', logErr.message);

    return jsonResponse({
      ok: true,
      mode: 'reset',
      counts,
      storage_deleted: storage.deleted,
      storage_errors: storage.errors,
    });
  } catch (err) {
    if (err instanceof ActionError) {
      return jsonResponse({ error: err.code, message: err.message }, err.status);
    }
    console.error('[admin-portfolio-action] internal_error:', err instanceof Error ? err.message : typeof err);
    return jsonResponse({ error: 'internal_error', message: 'حدث خطأ غير متوقع.' }, 500);
  }
});

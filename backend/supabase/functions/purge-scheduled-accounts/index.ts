// Supabase Edge Function: purge-scheduled-accounts
//
// الحذف النهائي للحسابات التي حلّ موعد حذفها (portfolios.deletion_scheduled_at <= now()).
// تجدولها admin_schedule_deletion() بمهلة 10 أيام، ويلغيها المعلم بـ
// restore_my_account() أو الأدمن بـ admin_cancel_deletion() قبل الموعد.
//
// من يستدعيها (تُنشر بـ --no-verify-jwt، والتحقق هنا):
//   1) pg_cron يومياً: ترويسة X-Purge-Key تطابق السر PURGE_ACCOUNTS_KEY.
//   2) أدمن يدوياً: Authorization: Bearer <JWT> و is_admin() = true.
// السر للمقارنة فقط: عميل القاعدة دائماً بـ SUPABASE_SERVICE_ROLE_KEY
// (انظر «Known pitfall» في CLAUDE.md).
//
// لكل حساب مستحق، بحد MAX_ACCOUNTS في التشغيل وميزانية TIME_BUDGET_MS:
//   إعادة فحص الموعد، ثم purgeUserAccount: الملفات، ثم التحقق أن لا شيء بقي،
//   ثم auth.users (الـ CASCADE يحذف portfolios وما يتبعه). فشل أي خطوة يوقف
//   ذلك الحساب وحده، ويُعاد في التشغيل التالي.
// الصفحة العامة مخفية منذ حلول الموعد (شرط في get_shared_*)، فلا كتابة هنا قبل الحذف.
//
// الرد: { ok, due, purged, failed: [{ id, stage, message }], skipped, stopped_early }
// 200 إن لم يفشل شيء، و500 إن فشل حساب واحد على الأقل، فيظهر في net._http_response.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { purgeUserAccount } from '../_shared/user-storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-purge-key',
};

const MAX_ACCOUNTS = 20;
// لا يبدأ حساباً جديداً بعدها، حتى لا تتجاوز الدالة مدتها القصوى
const TIME_BUDGET_MS = 100_000;

// مقارنة ثابتة الزمن: لا يكشف زمن الرد عدد الأحرف المطابقة
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

interface Failure {
  id: string;
  stage: string;
  message: string;
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

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const purgeKey = Deno.env.get('PURGE_ACCOUNTS_KEY')?.trim() ?? '';

    // 1) المستدعي. طلب يحمل X-Purge-Key يُقبل بالمفتاح أو يُرفض، ولا يُكمل إلى
    // مسار الأدمن. سر غير مضبوط أو فارغ يرفض كل طلب بالمفتاح، فلا يطابق فارغٌ فارغاً.
    let adminId: string | null = null;
    const headerKey = req.headers.get('X-Purge-Key');
    const isTrustedCron = headerKey !== null;

    if (isTrustedCron) {
      if (!purgeKey) {
        console.error('[purge] PURGE_ACCOUNTS_KEY غير مضبوط أو فارغ، رُفض طلب بالمفتاح');
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      if (!headerKey.trim() || !safeEqual(headerKey.trim(), purgeKey)) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ error: 'unauthorized' }, 401);
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await caller.auth.getUser();
      if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);
      const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin');
      if (adminErr || isAdmin !== true) return jsonResponse({ error: 'forbidden' }, 403);
      adminId = userData.user.id;
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2) المستحقون، والأدمن مستثنى دائماً
    const [{ data: due, error: dueErr }, { data: admins, error: adminsErr }] = await Promise.all([
      admin
        .from('portfolios')
        .select('id, deletion_scheduled_at')
        .lte('deletion_scheduled_at', new Date().toISOString())
        .order('deletion_scheduled_at', { ascending: true })
        .limit(MAX_ACCOUNTS),
      admin.from('admin_users').select('user_id'),
    ]);
    if (dueErr || adminsErr) {
      console.error('[purge] lookup error:', dueErr?.message ?? adminsErr?.message);
      return jsonResponse({ error: 'db_failed' }, 500);
    }
    const adminIds = new Set((admins ?? []).map((a: { user_id: string }) => a.user_id));

    const purged: string[] = [];
    const failed: Failure[] = [];
    let skipped = 0;
    let stoppedEarly = false;

    for (const row of (due ?? []) as { id: string; deletion_scheduled_at: string }[]) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        stoppedEarly = true;
        break;
      }
      // خط دفاع ثانٍ: admin_schedule_deletion ترفض حسابات الأدمن أصلاً
      if (adminIds.has(row.id)) {
        console.log('[purge] تخطّي حساب أدمن مجدول للحذف:', row.id);
        skipped++;
        continue;
      }

      // 3) إعادة فحص: قد يكون أُلغي منذ السرد
      const { data: current, error: currentErr } = await admin
        .from('portfolios')
        .select('deletion_scheduled_at')
        .eq('id', row.id)
        .maybeSingle();
      if (currentErr) {
        failed.push({ id: row.id, stage: 'recheck', message: currentErr.message });
        continue;
      }
      const at = current?.deletion_scheduled_at ? new Date(current.deletion_scheduled_at).getTime() : null;
      if (at === null || at > Date.now()) {
        skipped++;
        continue;
      }

      // 4) الحذف الكامل
      const result = await purgeUserAccount(admin, row.id);
      if (!result.ok) {
        failed.push({ id: row.id, stage: result.stage, message: result.message });
        continue;
      }
      purged.push(row.id);

      // السجل: نوع الفعل وموعد الحذف فقط، بلا اسم ولا بريد
      const { error: logErr } = await admin.from('admin_audit_log').insert({
        admin_id: adminId,
        action: 'portfolio.purge',
        target_portfolio_id: row.id,
        details: { type: 'purge', scheduled_at: current?.deletion_scheduled_at ?? row.deletion_scheduled_at },
      });
      if (logErr) console.error('[purge] audit log error:', row.id, logErr.message);
    }

    const summary = {
      ok: failed.length === 0,
      due: (due ?? []).length,
      purged: purged.length,
      failed,
      skipped,
      stopped_early: stoppedEarly,
      caller: isTrustedCron ? 'cron' : 'admin',
    };
    console.log('[purge] run:', JSON.stringify({ ...summary, purged_ids: purged }));

    return jsonResponse(summary, failed.length === 0 ? 200 : 500);
  } catch (err) {
    console.error('[purge] internal_error:', err instanceof Error ? err.message : typeof err);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
});

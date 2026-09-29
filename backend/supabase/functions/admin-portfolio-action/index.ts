// Supabase Edge Function: admin-portfolio-action
//
// إعادة تعيين ملف معلم أو حذفه، للأدمن فقط.
//
// المدخل: { portfolio_id: uuid, mode: 'reset' | 'delete', confirm_name: string, delete_auth?: boolean }
// الرد الناجح: { ok: true, mode, counts, storage_deleted, storage_errors, auth_deleted, auth_error? }
// الرد الفاشل: { error: <code>, message }
//
// - reset: admin_reset_portfolio_data() (معاملة واحدة) ثم حذف ملفات {id}/ في
//   evidence و evidence-video و evidence-audio. الصورة الشخصية في حاوية
//   avatars ({id}/avatar.jpg) لا تُلمس. يبقى الملف الشخصي والإعدادات و
//   ai_usage_log و portfolio_feature_overrides.
// - delete: حذف صف portfolios (الـ CASCADE يحذف الباقي) ثم ملفات {id}/ في
//   الحاويات الثلاث و avatars، ثم حساب الدخول إن طُلب delete_auth.
// قاعدة البيانات أولاً ثم التخزين: فشل التخزين يترك ملفات يتيمة تُنظَّف بإعادة
// المحاولة، وهذا أهون من شواهد تشير إلى ملفات محذوفة.
//
// هوية المستدعي من JWT فقط (عميل anon + Authorization)، لا من جسم الطلب.
// كل ما بعد التحقق بعميل SUPABASE_SERVICE_ROLE_KEY.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONTENT_BUCKETS = ['evidence', 'evidence-video', 'evidence-audio'];
// الصورة الشخصية: تُحذف مع delete فقط
const AVATAR_BUCKET = 'avatars';
const REMOVE_BATCH = 100;
const LIST_PAGE = 1000;
const MAX_DEPTH = 6;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Mode = 'reset' | 'delete';

interface ActionInput {
  portfolioId: string;
  mode: Mode;
  confirmName: string;
  deleteAuth: boolean;
}

interface StorageError {
  bucket: string;
  stage: 'list' | 'remove';
  message: string;
}

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

  const { portfolio_id, mode, confirm_name, delete_auth } = raw;
  if (typeof portfolio_id !== 'string' || !UUID_RE.test(portfolio_id)) {
    throw invalid('معرّف الملف غير صالح.');
  }
  if (mode !== 'reset' && mode !== 'delete') {
    throw invalid('نوع العملية غير صالح.');
  }
  if (typeof confirm_name !== 'string' || !confirm_name.trim()) {
    throw invalid('اسم التأكيد مطلوب.');
  }
  if (delete_auth !== undefined && typeof delete_auth !== 'boolean') {
    throw invalid('قيمة delete_auth غير صالحة.');
  }
  const deleteAuth = delete_auth === true;
  if (deleteAuth && mode !== 'delete') {
    throw invalid('حذف حساب الدخول متاح مع الحذف فقط.');
  }

  return { portfolioId: portfolio_id.toLowerCase(), mode, confirmName: confirm_name, deleteAuth };
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

// يسرد كل الملفات تحت prefix مع المجلدات الفرعية. list() يرجع مستوى واحداً،
// والمجلد يظهر كعنصر بلا id.
async function listFilesRecursive(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
  depth: number,
): Promise<string[]> {
  if (depth > MAX_DEPTH) throw new Error(`max depth exceeded at ${prefix}`);

  const files: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: LIST_PAGE, offset });
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else folders.push(path);
    }
    if (!data || data.length < LIST_PAGE) break;
  }

  for (const folder of folders) {
    files.push(...await listFilesRecursive(admin, bucket, folder, depth + 1));
  }
  return files;
}

// تسرد كل المسارات أولاً ثم تحذف: الحذف أثناء التصفح بـ offset يُسقط ملفات.
// keepAvatar حماية إضافية: الصورة الشخصية في avatars أصلاً، و reset لا يمر عليها.
async function deleteUserStorage(
  admin: SupabaseClient,
  userId: string,
  buckets: string[],
  keepAvatar: boolean,
): Promise<{ deleted: number; errors: StorageError[] }> {
  const avatarPath = `${userId}/avatar.jpg`;
  let deleted = 0;
  const errors: StorageError[] = [];

  for (const bucket of buckets) {
    let paths: string[];
    try {
      paths = await listFilesRecursive(admin, bucket, userId, 0);
    } catch (err) {
      errors.push({ bucket, stage: 'list', message: err instanceof Error ? err.message : 'list failed' });
      continue;
    }
    if (keepAvatar) paths = paths.filter(p => p !== avatarPath);

    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH);
      const { data, error } = await admin.storage.from(bucket).remove(batch);
      if (error) {
        errors.push({ bucket, stage: 'remove', message: error.message });
        continue;
      }
      deleted += data?.length ?? 0;
    }
  }

  return { deleted, errors };
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
    const { portfolioId, mode, confirmName, deleteAuth } = input;

    // 3) عميل الخدمة لكل ما بعد التحقق
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 4) الحمايات: الهدف ليس أدمن، والملف موجود، والاسم مطابق
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

    const profileName = readProfileName(portfolio.state);
    if (!profileName || profileName !== confirmName.trim()) {
      return jsonResponse({ error: 'name_mismatch', message: 'اسم التأكيد لا يطابق اسم المعلم.' }, 400);
    }

    // 5) قاعدة البيانات أولاً. إن فشلت لا يُلمس التخزين.
    let counts: Record<string, number>;
    if (mode === 'reset') {
      const { data, error } = await admin.rpc('admin_reset_portfolio_data', { p_portfolio_id: portfolioId });
      if (error) {
        console.error('[admin-portfolio-action] reset rpc error:', error.message);
        return jsonResponse({ error: 'db_failed', message: 'تعذّرت إعادة التعيين في قاعدة البيانات، ولم يُحذف شيء.' }, 500);
      }
      counts = toCounts(data);
    } else {
      const { data, error } = await admin.from('portfolios').delete().eq('id', portfolioId).select('id');
      if (error) {
        console.error('[admin-portfolio-action] delete error:', error.message);
        return jsonResponse({ error: 'db_failed', message: 'تعذّر حذف الملف من قاعدة البيانات، ولم يُحذف شيء.' }, 500);
      }
      if (!data || data.length === 0) {
        return jsonResponse({ error: 'not_found', message: 'الملف غير موجود.' }, 404);
      }
      counts = { portfolios: data.length };
    }

    // 6) التخزين
    const storage = mode === 'reset'
      ? await deleteUserStorage(admin, portfolioId, CONTENT_BUCKETS, true)
      : await deleteUserStorage(admin, portfolioId, [...CONTENT_BUCKETS, AVATAR_BUCKET], false);
    if (storage.errors.length) {
      console.error('[admin-portfolio-action] storage errors:', storage.errors.length);
    }

    // 7) حساب الدخول
    let authDeleted = false;
    let authError: string | undefined;
    if (mode === 'delete' && deleteAuth) {
      const { error } = await admin.auth.admin.deleteUser(portfolioId);
      if (error) {
        console.error('[admin-portfolio-action] auth delete error:', error.message);
        authError = 'auth_delete_failed';
      } else {
        authDeleted = true;
      }
    }

    // 8) السجل: بلا اسم ولا بريد. فشله لا يُفشل الرد لأن العملية تمت.
    const { error: logErr } = await admin.from('admin_audit_log').insert({
      admin_id: adminId,
      action: `portfolio.${mode}`,
      target_portfolio_id: portfolioId,
      details: {
        counts,
        storage_deleted: storage.deleted,
        storage_errors_count: storage.errors.length,
        delete_auth: deleteAuth,
        auth_deleted: authDeleted,
        ...(authError ? { auth_error: authError } : {}),
      },
    });
    if (logErr) console.error('[admin-portfolio-action] audit log error:', logErr.message);

    return jsonResponse({
      ok: true,
      mode,
      counts,
      storage_deleted: storage.deleted,
      storage_errors: storage.errors,
      auth_deleted: authDeleted,
      ...(authError ? { auth_error: authError } : {}),
    });
  } catch (err) {
    if (err instanceof ActionError) {
      return jsonResponse({ error: err.code, message: err.message }, err.status);
    }
    console.error('[admin-portfolio-action] internal_error:', err instanceof Error ? err.message : typeof err);
    return jsonResponse({ error: 'internal_error', message: 'حدث خطأ غير متوقع.' }, 500);
  }
});

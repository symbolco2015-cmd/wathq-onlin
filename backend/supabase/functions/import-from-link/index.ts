// Supabase Edge Function: import-from-link
//
// تستورد ملفاً من رابط مشاركة عام (Google Drive / Google Docs / OneDrive) إلى
// bucket evidence في مجلد المستخدم، وترجع الرابط العلني فقط. لا تكتب في جدول
// evidence — إنشاء الشاهد يبقى مسؤولية الواجهة عبر saveEvidence.
//
// المدخل: { url: string }
// الرد الناجح: { file_url, file_name, mime, size }
// الرد الفاشل: { error: <code>, message }
//
// كل شيء (الهوية، الحصة، الرفع) يمر عبر عميل المستخدم (anon + Authorization)،
// بلا service role. مسار الملف يُبنى من auth.getUser() حصراً، لا من الطلب.
// لا متغيرات بيئة إضافية: SUPABASE_URL و SUPABASE_ANON_KEY تلقائيتان.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'evidence';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_URL_LEN = 2048;

const PLATFORM_DAILY_LIMIT = 300;
const USER_DAILY_LIMIT = 20;

// المضيفات المسموحة لرابط المدخل نفسه — بالضبط القائمة المطلوبة.
const INPUT_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  '1drv.ms',
  'onedrive.live.com',
]);

// مضيفات تنزيل المحتوى الفعلي التي تحوّل إليها Google/Microsoft بعد رابط المشاركة
// (بدونها لا ينجح أي تنزيل). تُقبل كوجهة تحويلة فقط، لا كمدخل. لإرجاع الفحص
// الصارم على القائمة الأربعية وحدها: أفرغ المجموعتين أدناه.
const REDIRECT_EXTRA_HOSTS = new Set(['drive.usercontent.google.com']);
const REDIRECT_EXTRA_SUFFIXES = [
  '.googleusercontent.com',
  '.files.1drv.com',
  '.microsoftpersonalcontent.com',
];

// تحويلة إلى صفحة تسجيل دخول = الملف غير مشارَك علناً، لا "مضيف محظور" عادي.
const LOGIN_HOSTS = new Set([
  'accounts.google.com',
  'login.live.com',
  'login.microsoftonline.com',
]);

const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

// أنواع عامة يرجعها Drive أحياناً لملف صالح — يُستنتج النوع من امتداد اسم الملف بدلها
const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/force-download']);

const OLE2_SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
const ZIP_SIGNATURE = [0x50, 0x4B, 0x03, 0x04];

const SIGNATURES: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2D],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ZIP_SIGNATURE,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ZIP_SIGNATURE,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ZIP_SIGNATURE,
  'application/msword': OLE2_SIGNATURE,
  'application/vnd.ms-excel': OLE2_SIGNATURE,
  'application/vnd.ms-powerpoint': OLE2_SIGNATURE,
};

function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function matchesSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/webp') {
    return startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  }
  const signature = Object.hasOwn(SIGNATURES, mime) ? SIGNATURES[mime] : undefined;
  return signature ? startsWithBytes(bytes, signature) : false;
}

class ImportError extends Error {
  constructor(public code: string, message: string, public status = 200) {
    super(message);
  }
}

function isAllowedHost(host: string, isRedirect: boolean): boolean {
  if (INPUT_HOSTS.has(host)) return true;
  if (!isRedirect) return false;
  return REDIRECT_EXTRA_HOSTS.has(host) || REDIRECT_EXTRA_SUFFIXES.some(s => host.endsWith(s));
}

function assertSafeUrl(u: URL, isRedirect: boolean): void {
  if (u.protocol !== 'https:' || u.username || u.password || u.port !== '') {
    throw new ImportError('invalid_url', 'الرابط غير صالح: يجب أن يكون https بدون منفذ أو بيانات دخول.');
  }
  if (!isAllowedHost(u.hostname, isRedirect)) {
    if (isRedirect && LOGIN_HOSTS.has(u.hostname)) {
      throw new ImportError('not_public', 'الملف غير مشارَك علناً. اضبط المشاركة على "أي شخص لديه الرابط" ثم أعد المحاولة.');
    }
    throw new ImportError(
      isRedirect ? 'blocked_redirect' : 'unsupported_host',
      isRedirect
        ? 'حوّل الرابط إلى جهة غير مسموحة.'
        : 'المضيف غير مدعوم. المسموح: Google Drive، Google Docs، OneDrive.',
    );
  }
}

function parseInputUrl(raw: string): URL {
  if (raw.length > MAX_URL_LEN) throw new ImportError('invalid_url', 'الرابط طويل جداً.');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ImportError('invalid_url', 'الرابط غير صالح.');
  }
  assertSafeUrl(u, false);
  return u;
}

// يحوّل رابط المشاركة إلى رابط تنزيل مباشر
function toDirectUrl(u: URL): URL {
  const host = u.hostname;

  if (host === 'drive.google.com') {
    const m = u.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([^/]+)/);
    const isIdPath = u.pathname === '/open' || u.pathname === '/uc';
    const id = m?.[1] ?? (isIdPath ? u.searchParams.get('id') : null);
    if (!id || !ID_RE.test(id)) {
      throw new ImportError('invalid_url', 'تعذّر استخراج معرّف الملف من رابط Google Drive (المجلدات غير مدعومة).');
    }
    const out = new URL('https://drive.google.com/uc');
    out.searchParams.set('export', 'download');
    out.searchParams.set('id', id);
    const resourceKey = u.searchParams.get('resourcekey');
    if (resourceKey && /^[\w-]{1,64}$/.test(resourceKey)) out.searchParams.set('resourcekey', resourceKey);
    return out;
  }

  if (host === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
    if (!m || !ID_RE.test(m[2])) {
      throw new ImportError('invalid_url', 'رابط Google Docs غير مدعوم (المستند أو الجدول أو العرض فقط).');
    }
    const out = new URL(`https://docs.google.com/${m[1]}/d/${m[2]}/export`);
    out.searchParams.set('format', 'pdf');
    return out;
  }

  // 1drv.ms / onedrive.live.com
  const out = new URL(u.toString());
  out.hash = '';
  out.searchParams.set('download', '1');
  return out;
}

async function fetchFollowingRedirects(start: URL, signal: AbortSignal): Promise<Response> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { Accept: '*/*' },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => {});
      if (!location) throw new ImportError('fetch_failed', 'تعذّر جلب الملف من الرابط.');
      if (hop === MAX_REDIRECTS) throw new ImportError('too_many_redirects', 'الرابط يحوّل أكثر من اللازم.');

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new ImportError('fetch_failed', 'تعذّر جلب الملف من الرابط.');
      }
      assertSafeUrl(next, true);
      if (next.hostname === 'onedrive.live.com') next.searchParams.set('download', '1');
      current = next;
      continue;
    }

    return res;
  }
  throw new ImportError('too_many_redirects', 'الرابط يحوّل أكثر من اللازم.');
}

async function readBodyLimited(res: Response): Promise<Uint8Array> {
  if (!res.body) throw new ImportError('fetch_failed', 'الرد لا يحتوي على ملف.');
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new ImportError('too_large', 'حجم الملف يتجاوز الحد المسموح (10 MB).');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function normalizeMime(header: string | null): string {
  return (header ?? '').split(';')[0].trim().toLowerCase();
}

// يرجع امتداد الملف للـ MIME المقبول، أو null إن لم يكن مقبولاً. الصور محصورة
// صراحةً في jpeg/png/gif/webp (SVG وغيره مرفوض).
function extensionForMime(mime: string): string | null {
  return Object.hasOwn(MIME_TO_EXT, mime) ? MIME_TO_EXT[mime] : null;
}

function extractFileName(contentDisposition: string | null, ext: string): string {
  let name = '';
  if (contentDisposition) {
    const star = contentDisposition.match(/filename\*\s*=\s*utf-8''([^;]+)/i);
    if (star) {
      try {
        name = decodeURIComponent(star[1].trim());
      } catch { /* يُترك الاسم فارغاً ويُجرَّب filename العادي */ }
    }
    if (!name) {
      const plain = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
      if (plain) name = plain[1].trim();
    }
  }
  name = name.replace(/[\\/:*?"\x3C\x3E|\x00-\x1f]/g, '').trim().slice(0, 120);
  return name || `imported.${ext}`;
}

function extensionFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  let name = '';
  const star = contentDisposition.match(/filename\*\s*=\s*utf-8''([^;]+)/i);
  if (star) {
    try {
      name = decodeURIComponent(star[1].trim());
    } catch { /* يُجرَّب filename العادي */ }
  }
  if (!name) {
    const plain = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (plain) name = plain[1].trim();
  }
  const dot = name.lastIndexOf('.');
  return dot === -1 ? null : name.slice(dot + 1).trim().toLowerCase();
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'unauthorized', message: 'يلزم تسجيل الدخول.' }, 401);

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized', message: 'يلزم تسجيل الدخول.' }, 401);
    const userId = userData.user.id;

    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    if (typeof body?.url !== 'string' || !body.url.trim()) {
      return jsonResponse({ error: 'invalid_request', message: 'الحقل url مطلوب.' }, 400);
    }

    const directUrl = toDirectUrl(parseInputUrl(body.url.trim()));

    let res: Response;
    let bytes: Uint8Array;
    let mime: string;
    let ext: string;
    try {
      res = await fetchFollowingRedirects(directUrl, controller.signal);

      if (res.status === 401 || res.status === 403 || res.status === 404) {
        await res.body?.cancel().catch(() => {});
        throw new ImportError('not_public', 'تعذّر الوصول للملف: غير مشارَك علناً أو غير موجود.');
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new ImportError('fetch_failed', 'تعذّر جلب الملف من الرابط.');
      }

      mime = normalizeMime(res.headers.get('content-type'));
      if (mime === 'text/html' || mime === 'application/xhtml+xml') {
        await res.body?.cancel().catch(() => {});
        throw new ImportError('not_public', 'الملف غير مشارَك علناً. اضبط المشاركة على "أي شخص لديه الرابط" ثم أعد المحاولة.');
      }

      if (GENERIC_MIMES.has(mime)) {
        const inferredExt = extensionFromContentDisposition(res.headers.get('content-disposition'));
        if (inferredExt && Object.hasOwn(EXT_TO_MIME, inferredExt)) mime = EXT_TO_MIME[inferredExt];
      }

      const declaredLength = Number(res.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
        await res.body?.cancel().catch(() => {});
        throw new ImportError('too_large', 'حجم الملف يتجاوز الحد المسموح (10 MB).');
      }

      const allowedExt = extensionForMime(mime);
      if (!allowedExt) {
        console.error('[import-from-link] unsupported mime:', mime.slice(0, 100));
        await res.body?.cancel().catch(() => {});
        throw new ImportError('unsupported_type', 'نوع الملف غير مدعوم (PDF أو Office أو صورة فقط).');
      }
      ext = allowedExt;

      bytes = await readBodyLimited(res);
      if (!matchesSignature(bytes, mime)) {
        throw new ImportError('unsupported_type', 'محتوى الملف لا يطابق نوعه.');
      }
    } catch (err) {
      if (err instanceof ImportError) throw err;
      if (controller.signal.aborted) {
        throw new ImportError('timeout', 'انتهت مهلة جلب الملف، حاول مجدداً.');
      }
      throw new ImportError('fetch_failed', 'تعذّر جلب الملف من الرابط.');
    }

    // الحصة بعد نجاح كل الفحوص وقبل الرفع فقط
    const { data: allowed, error: rpcError } = await supabase.rpc('check_and_log_ai_usage', {
      p_feature: 'link_import',
      p_platform_daily_limit: PLATFORM_DAILY_LIMIT,
      p_user_daily_limit: USER_DAILY_LIMIT,
    });
    if (rpcError) {
      console.error('[import-from-link] check_and_log_ai_usage error:', rpcError.message);
      return jsonResponse({ error: 'usage_check_failed', message: 'تعذّر التحقق من الحصة اليومية.' }, 500);
    }
    if (!allowed) {
      return jsonResponse({ error: 'daily_limit_reached', message: 'بلغت الحد اليومي للاستيراد من الروابط، حاول غداً.' });
    }

    const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const path = `${userId}/link/${Date.now()}_${rand}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { cacheControl: '3600', upsert: false, contentType: mime });
    if (uploadErr) {
      console.error('[import-from-link] upload error:', uploadErr.message);
      return jsonResponse({ error: 'upload_failed', message: 'تعذّر حفظ الملف.' }, 500);
    }

    // deleteEvidence يشتق bucket والمسار من هذه الصيغة تحديداً
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const expectedPath = `/storage/v1/object/public/${BUCKET}/${path}`;
    let urlOk = false;
    try {
      urlOk = new URL(publicUrl).pathname === expectedPath;
    } catch { /* urlOk يبقى false */ }
    if (!urlOk) {
      console.error('[import-from-link] صيغة الرابط العلني غير متوقعة');
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      return jsonResponse({ error: 'upload_failed', message: 'تعذّر حفظ الملف.' }, 500);
    }

    return jsonResponse({
      file_url: publicUrl,
      file_name: extractFileName(res.headers.get('content-disposition'), ext),
      mime,
      size: bytes.byteLength,
    });
  } catch (err) {
    if (err instanceof ImportError) {
      return jsonResponse({ error: err.code, message: err.message }, err.status);
    }
    console.error('[import-from-link] internal_error:', err instanceof Error ? err.name : typeof err);
    return jsonResponse({ error: 'internal_error', message: 'حدث خطأ غير متوقع.' }, 500);
  } finally {
    clearTimeout(timer);
  }
});

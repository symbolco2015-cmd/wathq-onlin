// ملفات معلم في Storage: كل ما تحت {userId}/ في كل حاوية.
// تستعملها admin-portfolio-action و purge-scheduled-accounts.
// حذف auth.users لا يحذف ملفات Storage، فتُحذف بهذه الدوال قبله.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const CONTENT_BUCKETS = ['evidence', 'evidence-video', 'evidence-audio'];
// الصورة الشخصية: {id}/avatar.jpg
export const AVATAR_BUCKET = 'avatars';
export const ALL_USER_BUCKETS = [...CONTENT_BUCKETS, AVATAR_BUCKET];

const REMOVE_BATCH = 100;
const LIST_PAGE = 1000;
const MAX_DEPTH = 6;

export interface StorageError {
  bucket: string;
  stage: 'list' | 'remove';
  message: string;
}

// يسرد كل الملفات تحت prefix مع المجلدات الفرعية. list() يرجع مستوى واحداً،
// والمجلد يظهر كعنصر بلا id.
export async function listFilesRecursive(
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
export async function deleteUserStorage(
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

// عدد ما بقي تحت {userId}/ في الحاويات: تحقق بعد الحذف وقبل حذف الحساب.
// يرمي إن تعذّر السرد، فلا يُعدّ الفشل «فارغاً».
export async function countUserFiles(
  admin: SupabaseClient,
  userId: string,
  buckets: string[],
): Promise<number> {
  let total = 0;
  for (const bucket of buckets) {
    total += (await listFilesRecursive(admin, bucket, userId, 0)).length;
  }
  return total;
}

// حذف كامل لحساب معلم: الملفات، ثم التحقق أن لا شيء بقي، ثم auth.users
// (الـ CASCADE يحذف portfolios وما يتبعه). أي فشل يوقف قبل حذف الحساب، فلا
// يبقى ملف بلا حساب. فشل حذف الحساب بعد حذف الملفات يُعاد بأمان: كل خطوة
// تتكرر دون ضرر.
export type PurgeStage = 'storage' | 'verify_storage' | 'auth' | 'verify_portfolio';

export async function purgeUserAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true; storageDeleted: number } | { ok: false; stage: PurgeStage; message: string }> {
  const storage = await deleteUserStorage(admin, userId, ALL_USER_BUCKETS, false);
  if (storage.errors.length) {
    const e = storage.errors[0];
    return { ok: false, stage: 'storage', message: `${e.bucket}/${e.stage}: ${e.message}` };
  }

  try {
    const left = await countUserFiles(admin, userId, ALL_USER_BUCKETS);
    if (left > 0) return { ok: false, stage: 'verify_storage', message: `${left} files left` };
  } catch (err) {
    return { ok: false, stage: 'verify_storage', message: err instanceof Error ? err.message : 'list failed' };
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) return { ok: false, stage: 'auth', message: authErr.message };

  const { data: row, error: rowErr } = await admin
    .from('portfolios')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (rowErr) return { ok: false, stage: 'verify_portfolio', message: rowErr.message };
  if (row) return { ok: false, stage: 'verify_portfolio', message: 'portfolio row still exists' };

  return { ok: true, storageDeleted: storage.deleted };
}

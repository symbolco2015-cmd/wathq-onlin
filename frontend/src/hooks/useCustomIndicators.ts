import { useCallback } from 'react';
import { supabase } from '../supabaseClient';

// المؤشرات المخصصة للمعلم في section_indicators (portfolio_id = المعلم).
// الصلاحيات والحدود في القاعدة (20260930_custom_indicators_foundation.sql):
// INSERT (section_id, name_ar, portfolio_id) وUPDATE (name_ar) وDELETE للمالك،
// والحارس يفرض الحد 5 والوزن 99 ومنع اسم رسمي. هذا الملف يترجم أخطاءه فقط.

export const CUSTOM_INDICATOR_LIMIT = 5;
export const CUSTOM_NAME_MIN = 3;
export const CUSTOM_NAME_MAX = 80;

export const CUSTOM_LIMIT_MSG = `وصلت إلى الحد: ${CUSTOM_INDICATOR_LIMIT} مؤشرات مخصصة في هذا البند`;
const LENGTH_MSG = `اكتب اسماً من ${CUSTOM_NAME_MIN} إلى ${CUSTOM_NAME_MAX} حرفاً`;
const DUPLICATE_MSG = 'يوجد مؤشر بهذا الاسم في البند';
const DUPLICATE_OFFICIAL_MSG = 'يوجد مؤشر رسمي بهذا الاسم في البند';

/** نتيجة عملية: ok، أو رسالة تظهر تحت الحقل (field)، أو خطأ شبكة/عام يظهر في toast */
export interface IndicatorResult {
  ok: boolean;
  id?: string;
  field?: string;
  toast?: string;
}

const normalize = (s: string) => s.trim().toLowerCase();

/** تحقق الواجهة قبل الإرسال — الحارس في القاعدة يبقى خط الدفاع الأخير */
export function validateIndicatorName(
  name: string,
  officialNames: string[],
  customNames: string[],
): string | null {
  const n = name.trim();
  if (n.length < CUSTOM_NAME_MIN || n.length > CUSTOM_NAME_MAX) return LENGTH_MSG;
  if (officialNames.some(x => normalize(x) === normalize(n))) return DUPLICATE_OFFICIAL_MSG;
  if (customNames.some(x => normalize(x) === normalize(n))) return DUPLICATE_MSG;
  return null;
}

function translateError(error: { code?: string; message?: string }): IndicatorResult {
  const msg = error.message ?? '';
  if (msg.includes('custom_indicator_limit')) return { ok: false, field: CUSTOM_LIMIT_MSG };
  if (msg.includes('custom_indicator_duplicate_official')) return { ok: false, field: DUPLICATE_OFFICIAL_MSG };
  if (error.code === '23505') return { ok: false, field: DUPLICATE_MSG };
  if (error.code === '23514') return { ok: false, field: LENGTH_MSG };
  if (msg.includes('custom_indicator_immutable')) return { ok: false, toast: 'لا يمكن تعديل هذا المؤشر' };
  return { ok: false, toast: 'تعذّر حفظ المؤشر، حاول مجدداً' };
}

export function useCustomIndicators(userId: string | null) {
  const addIndicator = useCallback(async (sectionId: number, name: string): Promise<IndicatorResult> => {
    if (!supabase || !userId) return { ok: false, toast: 'تعذّر حفظ المؤشر، حاول مجدداً' };
    const { data, error } = await supabase
      .from('section_indicators')
      .insert({ section_id: sectionId, name_ar: name.trim(), portfolio_id: userId })
      .select('id');
    if (error) { console.error('[useCustomIndicators] add:', error); return translateError(error); }
    if (!data || data.length === 0) return { ok: false, toast: 'تعذّر حفظ المؤشر، حاول مجدداً' };
    return { ok: true, id: data[0].id as string };
  }, [userId]);

  const renameIndicator = useCallback(async (id: string, name: string): Promise<IndicatorResult> => {
    if (!supabase) return { ok: false, toast: 'تعذّر حفظ المؤشر، حاول مجدداً' };
    const { data, error } = await supabase
      .from('section_indicators')
      .update({ name_ar: name.trim() })
      .eq('id', id)
      .select('id');
    if (error) { console.error('[useCustomIndicators] rename:', error); return translateError(error); }
    // لم يُعدَّل أي صف (RLS ترفض بصمت)
    if (!data || data.length === 0) return { ok: false, toast: 'تعذّر حفظ المؤشر، حاول مجدداً' };
    return { ok: true, id };
  }, []);

  /** يحذف المؤشر فقط — يفشل إن بقي عليه شاهد (قيد evidence بلا ON DELETE) */
  const deleteIndicator = useCallback(async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    const { data, error } = await supabase
      .from('section_indicators')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) { console.error('[useCustomIndicators] delete:', error); return false; }
    return !!data && data.length > 0;
  }, []);

  return { addIndicator, renameIndicator, deleteIndicator };
}

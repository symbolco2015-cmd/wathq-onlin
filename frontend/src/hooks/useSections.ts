import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { SECS } from '../data';
import type { SectionData, SectionIndicator } from '../types';

export type SectionsStatus = 'loading' | 'ready' | 'error';

/**
 * مصدر SectionData[] الوحيد لبقية التطبيق — يدمج بيانات الأقسام الثابتة
 * (SECS في data.ts: id/ttl/icon/isStrat/isResultsSection) مع مؤشرات
 * section_indicators الحقيقية من القاعدة (id/name_ar لكل قسم، بترتيب weight).
 * subs = indicators.map(i => i.name_ar) — أسماء القاعدة معتمدة حرفياً، لا
 * تُعدَّل ولا تُطابَق مقابل أي نص ثابت بالكود.
 *
 * لا سقوط على subs قديمة مكتوبة يدوياً عند الفشل أو الفراغ: ذلك يعيد بالضبط
 * التنافر بين data.ts وsection_indicators الذي يحل عليه هذا الهوك (33 مؤشراً،
 * 3 تطابقات فقط قبل هذا التغيير). الفشل يبقى فشلاً ظاهراً — status:'error'.
 */
export function useSections() {
  const [sections, setSections] = useState<SectionData[]>([]);
  const [status, setStatus] = useState<SectionsStatus>('loading');

  // silent: تحديث بعد إضافة/تعديل/حذف مؤشر مخصص — بلا حالة 'loading' (التي
  // تستبدل التطبيق كله بشاشة البداية)، والفشل يُبقي الأقسام المحمّلة كما هي.
  const load = useCallback(async (silent = false) => {
    if (!supabase) { if (!silent) setStatus('error'); return; }
    if (!silent) setStatus('loading');
    try {
      const { data, error } = await supabase
        .from('section_indicators')
        .select('id, section_id, name_ar, weight, portfolio_id')
        .order('section_id', { ascending: true })
        .order('weight', { ascending: true })
        .order('name_ar', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('empty_section_indicators');

      const indicatorsBySection = new Map<number, SectionIndicator[]>();
      // RLS تُرجع الرسمية (portfolio_id فارغ) ومؤشرات المعلم المخصصة فقط، ووزن
      // المخصص 99 فيأتي بعد الرسمي في كل قسم
      for (const row of data as { id: string; section_id: number; name_ar: string; weight: number; portfolio_id: string | null }[]) {
        const list = indicatorsBySection.get(row.section_id) ?? [];
        list.push({ id: row.id, name_ar: row.name_ar, isCustom: row.portfolio_id !== null });
        indicatorsBySection.set(row.section_id, list);
      }

      const built: SectionData[] = SECS.map(meta => {
        const indicators = indicatorsBySection.get(meta.id) ?? [];
        return { ...meta, indicators, subs: indicators.map(i => i.name_ar) };
      });

      setSections(built);
      setStatus('ready');
    } catch (e) {
      console.error('[useSections] تعذّر تحميل مؤشرات الأقسام:', e);
      if (silent) return;
      setSections([]);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reload = useCallback(() => load(), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { sections, status, reload, refresh };
}

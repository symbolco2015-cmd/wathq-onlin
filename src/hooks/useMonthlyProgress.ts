import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export interface MonthlyProgressRow {
  section_id: number;
  year: number;
  month: number;
  evidence_count: number;
}

interface UseMonthlyProgressOptions {
  userId: string | null;
  yearStartMonth: number; // 1–12, default 9
}

const ARABIC_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
];

export function useMonthlyProgress({ userId, yearStartMonth }: UseMonthlyProgressOptions) {
  const [rows, setRows] = useState<MonthlyProgressRow[]>([]);

  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1–12
  const currentMonthName = ARABIC_MONTHS[currentMonth - 1];

  // بداية السنة الدراسية (مثلاً سبتمبر 2024 إذا yearStartMonth=9 والشهر الحالي >= 9)
  const academicStartYear = currentMonth >= yearStartMonth ? currentYear : currentYear - 1;

  const fetchData = useCallback(async () => {
    if (!userId || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('monthly_progress')
        .select('section_id, year, month, evidence_count')
        .eq('portfolio_id', userId);
      if (!error && data) {
        setRows(data as MonthlyProgressRow[]);
      }
    } catch (e) {
      console.warn('[MonthlyProgress] fetch error:', e);
    }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /** تسجيل شاهد جديد للبند والشهر الحالي */
  const recordEvidence = useCallback(async (sectionId: number) => {
    // تحديث فوري (optimistic)
    setRows(prev => {
      const idx = prev.findIndex(
        r => r.section_id === sectionId && r.year === currentYear && r.month === currentMonth
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], evidence_count: next[idx].evidence_count + 1 };
        return next;
      }
      return [...prev, { section_id: sectionId, year: currentYear, month: currentMonth, evidence_count: 1 }];
    });

    if (!userId || !supabase) return;

    try {
      const { data: existing } = await supabase
        .from('monthly_progress')
        .select('evidence_count')
        .eq('portfolio_id', userId)
        .eq('section_id', sectionId)
        .eq('year', currentYear)
        .eq('month', currentMonth)
        .maybeSingle();

      const newCount = (existing?.evidence_count ?? 0) + 1;
      await supabase.from('monthly_progress').upsert(
        {
          portfolio_id:   userId,
          section_id:     sectionId,
          year:           currentYear,
          month:          currentMonth,
          evidence_count: newCount,
        },
        { onConflict: 'portfolio_id,section_id,year,month' }
      );
    } catch (e) {
      console.warn('[MonthlyProgress] record error:', e);
    }
  }, [userId, currentYear, currentMonth]);

  /** هل الصف ضمن السنة الدراسية الحالية؟ */
  function isInAcademicYear(r: MonthlyProgressRow): boolean {
    const rFlat     = r.year * 12 + r.month;
    const startFlat = academicStartYear * 12 + yearStartMonth;
    const endFlat   = currentYear * 12 + currentMonth;
    return rFlat >= startFlat && rFlat <= endFlat;
  }

  /** إجمالي الشواهد للشهر الحالي عبر كل البنود */
  const currentMonthTotal = rows
    .filter(r => r.year === currentYear && r.month === currentMonth)
    .reduce((sum, r) => sum + r.evidence_count, 0);

  /** إجمالي الشواهد منذ بداية السنة الدراسية */
  const yearTotal = rows.filter(isInAcademicYear).reduce((sum, r) => sum + r.evidence_count, 0);

  /** عدد الأشهر المنقضية من بداية السنة (بما فيها الشهر الحالي) */
  const monthsElapsed = Math.max(
    1,
    (currentYear - academicStartYear) * 12 + (currentMonth - yearStartMonth) + 1
  );

  /** المعدل الشهري (شاهد / شهر) */
  const monthlyAvg = Math.round((yearTotal / monthsElapsed) * 10) / 10;

  /** عدد شواهد بند معين في الشهر الحالي */
  function getSectionMonthCount(sectionId: number): number {
    return rows.find(
      r => r.section_id === sectionId && r.year === currentYear && r.month === currentMonth
    )?.evidence_count ?? 0;
  }

  /** إجمالي شواهد بند معين منذ بداية السنة الدراسية */
  function getSectionYearTotal(sectionId: number): number {
    return rows
      .filter(r => r.section_id === sectionId && isInAcademicYear(r))
      .reduce((sum, r) => sum + r.evidence_count, 0);
  }

  return {
    rows,
    recordEvidence,
    getSectionMonthCount,
    getSectionYearTotal,
    currentMonthTotal,
    currentMonthName,
    currentYear,
    currentMonth,
    yearTotal,
    monthsElapsed,
    monthlyAvg,
    refetch: fetchData,
  };
}
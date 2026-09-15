import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export interface TeachingStrategy {
  id: string;
  name_ar: string;
  is_global: boolean;
}

/** كتالوج استراتيجيات التدريس (بند 4) — عامة (is_global=true، مشتركة لكل
 * المعلمين) + خاصة بهذا المعلم (created_by=userId). RLS على teaching_strategies
 * تفرض هذا النطاق فعلياً، فالاستعلام هنا لا يحتاج فلترة يدوية إضافية. */
export function useTeachingStrategies(userId: string | null) {
  const [strategies, setStrategies] = useState<TeachingStrategy[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStrategies = useCallback(async () => {
    if (!userId || !supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('teaching_strategies')
        .select('id, name_ar, is_global')
        .order('is_global', { ascending: false })
        .order('name_ar', { ascending: true });
      if (error) {
        console.error('[TeachingStrategies]', error);
        return;
      }
      setStrategies(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchStrategies(); }, [fetchStrategies]);

  /** يضيف استراتيجية خاصة جديدة (is_global=false, created_by=userId). عند
   * تكرار الاسم ضمن استراتيجيات هذا المعلم (unique_global_name) تُعاد رسالة
   * واضحة للمستدعي بدل خطأ Supabase الخام (رمز postgres 23505). */
  const addStrategy = async (name: string): Promise<{ strategy: TeachingStrategy } | { error: 'duplicate' | 'unknown' }> => {
    if (!userId || !supabase) return { error: 'unknown' };
    const { data, error } = await supabase
      .from('teaching_strategies')
      .insert({ name_ar: name, is_global: false, created_by: userId })
      .select('id, name_ar, is_global')
      .single();

    if (error) {
      if (error.code === '23505') return { error: 'duplicate' };
      console.error('[TeachingStrategies] addStrategy', error);
      return { error: 'unknown' };
    }

    await fetchStrategies();
    return { strategy: data };
  };

  return { strategies, loading, addStrategy, refetch: fetchStrategies };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export type EvidenceType = 'file' | 'image' | 'link' | 'note' | 'audio' | 'video';

export interface SupabaseEvidence {
  id: string;
  portfolio_id: string;
  section_id: number;
  indicator_id: string | null;
  title: string;
  description: string | null;
  impact: string | null;
  context_grade: string | null;
  context_subject: string | null;
  academic_term: string | null;
  evidence_type: EvidenceType;
  file_url: string | null;
  link_url: string | null;
  self_reflection: string | null;
  created_at: string;
}

// روابط Supabase العلنية تتبع الصيغة: .../storage/v1/object/public/<bucket>/<path>
// نستخرج اسم الـ bucket ديناميكياً بدل افتراضه ثابتاً ('evidence')، لأن أنواع
// شواهد مختلفة (مثل 'video') تُخزَّن في bucket مستقل (evidence-video).
const PUBLIC_URL_MARKER = '/storage/v1/object/public/';

const getBucketAndPathFromUrl = (publicUrl: string): { bucket: string; path: string } | null => {
  if (!publicUrl) return null;
  const markerIdx = publicUrl.indexOf(PUBLIC_URL_MARKER);
  if (markerIdx === -1) return null;
  const rest = publicUrl.slice(markerIdx + PUBLIC_URL_MARKER.length); // "<bucket>/<path>"
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;
  return { bucket: rest.slice(0, slashIdx), path: rest.slice(slashIdx + 1) };
};

export interface SectionCompletion {
  section_id: number;
  name_ar: string;
  completion_pct: number;
  evidence_count: number;
}

export function useSupabaseEvidence(
  portfolioId: string | null,
  onEvRemoved?: (sectionId: number, createdAt: string) => void,
) {
  const [evidence, setEvidence]     = useState<SupabaseEvidence[]>([]);
  const [completion, setCompletion] = useState<SectionCompletion[]>([]);
  const [loading, setLoading]       = useState(false);

  const fetch = useCallback(async () => {
    if (!portfolioId || !supabase) return;
    setLoading(true);
    try {
      const [evRes, compRes] = await Promise.all([
        supabase
          .from('evidence')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .order('created_at', { ascending: false }),
        supabase
          .from('portfolio_completion')
          .select('*')
          .eq('portfolio_id', portfolioId),
      ]);
      setEvidence(evRes.data  ?? []);
      setCompletion(compRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addEvidence = async (payload: {
    section_id: number;
    indicator_id?: string;
    title: string;
    description?: string;
    impact?: string;
    context_grade?: string;
    academic_term?: string;
    evidence_type: EvidenceType;
    file_url?: string;
    link_url?: string;
    self_reflection?: string;
  }, createdAt?: string) => {
    if (!portfolioId || !supabase) return null;
    const { data, error } = await supabase
      .from('evidence')
      .insert({ portfolio_id: portfolioId, ...payload, ...(createdAt ? { created_at: createdAt } : {}) })
      .select()
      .single();
    if (error) { console.error('[Supabase Evidence]', error); return null; }
    await fetch();
    return data as SupabaseEvidence;
  };

  const deleteEvidence = async (id: string): Promise<void> => {
    if (!supabase) return;

    const evItem = evidence.find(e => e.id === id);

    const { data, error } = await supabase
      .from('evidence')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      console.error('[Supabase Evidence] delete error:', error.message, error);
      throw new Error(error.message);
    }

    // إذا لم يُحذف أي صف (RLS تمنع الحذف بصمت) — أبلغ بالخطأ ولا تحدّث الواجهة
    if (!data || data.length === 0) {
      throw new Error('لم يُحذف الشاهد من قاعدة البيانات');
    }

    if (evItem?.file_url) {
      const parsed = getBucketAndPathFromUrl(evItem.file_url);
      if (parsed) {
        try {
          const { error: storageError } = await supabase.storage.from(parsed.bucket).remove([parsed.path]);
          if (storageError) {
            console.error('[Supabase Evidence] فشل حذف الملف من Storage:', storageError.message, storageError);
          }
        } catch (storageErr) {
          console.error('[Supabase Evidence] فشل حذف الملف من Storage:', storageErr);
        }
      }
    }

    if (evItem && onEvRemoved) {
      onEvRemoved(evItem.section_id, evItem.created_at);
    }

    setEvidence(prev => prev.filter(e => e.id !== id));
  };

  const getBySection = (sectionId: number) =>
    evidence.filter(e => e.section_id === sectionId);

  const getCompletion = (sectionId: number) =>
    completion.find(c => c.section_id === sectionId)?.completion_pct ?? 0;

  const overallPct = completion.length > 0
    ? Math.round(completion.reduce((s, c) => s + (c.completion_pct || 0), 0) / 11)
    : 0;

  return {
    evidence,
    completion,
    loading,
    addEvidence,
    deleteEvidence,
    getBySection,
    getCompletion,
    overallPct,
    refetch: fetch,
  };
}

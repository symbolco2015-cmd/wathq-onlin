import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export type EvidenceType = 'file' | 'image' | 'link' | 'note' | 'audio' | 'video';

export interface SupabaseEvidence {
  id: string;
  portfolio_id: string;
  section_id: number | null;
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
  /** 'weekly' | 'semester' | null — يُستخدم فقط لأدلة مؤشر "إعداد خطة فصلية
   *  موزعة" ضمن بند 6 (إعداد خطة التعلم)، بقية الأدلة تُخزَّن NULL دائماً */
  frequency: 'weekly' | 'semester' | null;
  /** معرّف استراتيجية التدريس (teaching_strategies.id) — غير NULL فقط لأدلة
   *  بند 4 (isStrat) المُضافة عبر تدفّق "استراتيجيات التدريس" الجديد. */
  strategy_id: string | null;
}

/** الحقول التي يسمح نموذج التعديل بتغييرها — لا ملف ولا نوع ولا قسم */
export interface EvidenceUpdatePatch {
  title?: string;
  description?: string | null;
  impact?: string | null;
  context_grade?: string | null;
  context_subject?: string | null;
  academic_term?: string | null;
  self_reflection?: string | null;
  frequency?: 'weekly' | 'semester' | null;
  /** NOT NULL في القاعدة */
  indicator_id?: string;
}

const EDITABLE_FIELDS: (keyof EvidenceUpdatePatch)[] = [
  'title', 'description', 'impact', 'context_grade', 'context_subject',
  'academic_term', 'self_reflection', 'frequency', 'indicator_id',
];

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

export function useSupabaseEvidence(
  portfolioId: string | null,
  onEvRemoved?: (sectionId: number, createdAt: string) => void,
) {
  const [evidence, setEvidence]     = useState<SupabaseEvidence[]>([]);
  const [loading, setLoading]       = useState(false);

  const fetch = useCallback(async () => {
    if (!portfolioId || !supabase) return;
    setLoading(true);
    try {
      const evRes = await supabase
        .from('evidence')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('created_at', { ascending: false });
      setEvidence(evRes.data  ?? []);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addEvidence = async (payload: {
    section_id: number | null;
    indicator_id?: string;
    title: string;
    description?: string;
    impact?: string;
    context_grade?: string;
    context_subject?: string;
    academic_term?: string;
    evidence_type: EvidenceType;
    file_url?: string;
    link_url?: string;
    self_reflection?: string;
    frequency?: 'weekly' | 'semester';
    strategy_id?: string;
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

  /** يعدّل حقول الشاهد المسموحة فقط. القسم لا يتغيّر، فعدّاد الشهر لا يُمس. */
  const updateEvidence = async (id: string, patch: EvidenceUpdatePatch): Promise<boolean> => {
    if (!supabase) return false;
    // نسخ الحقول المسموحة وحدها، حتى لو مُرِّر كائن فيه حقول أكثر
    const clean: EvidenceUpdatePatch = {};
    for (const k of EDITABLE_FIELDS) {
      if (k in patch) (clean as Record<string, unknown>)[k] = patch[k];
    }
    const { data, error } = await supabase
      .from('evidence')
      .update(clean)
      .eq('id', id)
      .select('id');
    if (error) { console.error('[Supabase Evidence] update error:', error.message, error); return false; }
    // لم يُعدَّل أي صف (RLS ترفض بصمت)
    if (!data || data.length === 0) { console.error('[Supabase Evidence] لم يُعدَّل الشاهد في قاعدة البيانات'); return false; }
    await fetch();
    return true;
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

    // العمود section_id يقبل الفراغ في القاعدة — شاهد بلا قسم لا يُحتسب في
    // monthly_progress أصلاً، فتخطَّ إنقاص العدّاد الشهري بدل تمرير null كـ sectionId
    if (evItem && onEvRemoved && evItem.section_id !== null) {
      onEvRemoved(evItem.section_id, evItem.created_at);
    }

    setEvidence(prev => prev.filter(e => e.id !== id));
  };

  const getBySection = (sectionId: number) =>
    evidence.filter(e => e.section_id === sectionId);

  return {
    evidence,
    loading,
    addEvidence,
    updateEvidence,
    deleteEvidence,
    getBySection,
    refetch: fetch,
  };
}

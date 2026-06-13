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

export interface SectionCompletion {
  section_id: number;
  name_ar: string;
  completion_pct: number;
  evidence_count: number;
}

export function useSupabaseEvidence(portfolioId: string | null) {
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
  }) => {
    if (!portfolioId || !supabase) return null;
    const { data, error } = await supabase
      .from('evidence')
      .insert({ portfolio_id: portfolioId, ...payload })
      .select()
      .single();
    if (error) { console.error('[Supabase Evidence]', error); return null; }
    await fetch();
    return data as SupabaseEvidence;
  };

  const deleteEvidence = async (id: string) => {
    if (!supabase) return;
    await supabase.from('evidence').delete().eq('id', id);
    await fetch();
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

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { AppState } from '../types';

interface PublicProfileResult {
  state: AppState | null;
  loading: boolean;
  error: string | null;
}

export function usePublicProfile(userId: string | null): PublicProfileResult {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setState(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (!supabase) {
      setError('لا يمكن تحميل الملف العام — الاتصال بقاعدة البيانات غير متاح.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from('portfolios')
      .select('state')
      .eq('id', userId)
      .single()
      .then(({ data, error: sbError }) => {
        if (cancelled) return;

        // PGRST116 = "no rows found" — ملف غير موجود
        if (sbError && sbError.code !== 'PGRST116') {
          console.error('[usePublicProfile]', sbError);
        }

        if (!data?.state) {
          setError('لم يتم العثور على ملف الإنجاز لهذا المستخدم.');
          setState(null);
        } else {
          setState(data.state as AppState);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { state, loading, error };
}
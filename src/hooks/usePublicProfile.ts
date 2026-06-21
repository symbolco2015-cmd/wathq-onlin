import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { PublicPortfolioState } from '../types';

interface PublicProfileResult {
  state: PublicPortfolioState | null;
  loading: boolean;
  error: string | null;
}

export function usePublicProfile(userId: string | null): PublicProfileResult {
  const [state, setState] = useState<PublicPortfolioState | null>(null);
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

    // get_shared_portfolio هي SECURITY DEFINER RPC تتحقق من تفعيل المشاركة
    // (share_enabled = true) قبل إرجاع أي بيانات — لا قراءة مباشرة على جدول portfolios.
    supabase
      .rpc('get_shared_portfolio', { target_id: userId })
      .then(({ data, error: sbError }) => {
        if (cancelled) return;

        if (sbError) {
          console.error('[usePublicProfile]', sbError);
        }

        if (!data) {
          setError('لم يتم العثور على ملف الإنجاز لهذا المستخدم.');
          setState(null);
        } else {
          setState(data as PublicPortfolioState);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { state, loading, error };
}

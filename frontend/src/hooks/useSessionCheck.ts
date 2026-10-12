import { useEffect, useRef } from 'react';
import { isAuthApiError, isAuthSessionMissingError, type AuthError } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

// getSession تقرأ الجلسة من التخزين المحلي دون سؤال الخادم، فتبقى جلسة حساب
// محذوف مفتوحة حتى ينتهي توكن الوصول. getUser تسأل الخادم. نفحص عند التفعيل،
// وعند العودة إلى الواجهة بحد أدنى 30 دقيقة بين فحصين (كما في useSwUpdate).
const SESSION_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** الأخطاء التي تعني أن المستخدم أو جلسته لم يعد موجوداً على الخادم.
 *  - user_not_found: «User to which the API request relates no longer exists» (رموز أخطاء Supabase Auth)
 *  - session_not_found: تحوّله المكتبة إلى AuthSessionMissingError (auth-js lib/fetch.js)
 *  - refresh_token_not_found: انتهى التوكن وفشل التجديد لأن الجلسة غير موجودة
 *  غيرها (انقطاع الشبكة، 5xx، أي رمز آخر) لا يُعدّ جلسة باطلة أبداً. */
function isInvalidSession(error: AuthError): boolean {
  const code = error.code;
  if (code === 'user_not_found' || code === 'refresh_token_not_found') return isAuthApiError(error);
  return isAuthSessionMissingError(error);
}

/** يستدعي onInvalid إن رفض الخادم المستخدم أو جلسته. لا يسجّل الخروج بنفسه. */
export function useSessionCheck(enabled: boolean, onInvalid: () => void) {
  const onInvalidRef = useRef(onInvalid);
  onInvalidRef.current = onInvalid;

  useEffect(() => {
    if (!enabled || !supabase) return;
    const client = supabase;
    let cancelled = false;
    let running = false;
    let lastCheck = 0;

    const check = async () => {
      if (running) return;
      running = true;
      lastCheck = Date.now();
      try {
        const { error } = await client.auth.getUser();
        if (cancelled || !error) return;
        if (isInvalidSession(error)) {
          onInvalidRef.current();
        } else {
          console.warn('[useSessionCheck] تعذّر التحقق من الجلسة:', error.code ?? error.status, error.message);
        }
      } catch (err) {
        console.warn('[useSessionCheck] تعذّر التحقق من الجلسة:', err);
      } finally {
        running = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < SESSION_CHECK_INTERVAL_MS) return;
      void check();
    };

    void check();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);
}

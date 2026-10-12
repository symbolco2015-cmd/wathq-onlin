import { useState, useEffect, useRef } from 'react';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import type { ToastKind } from './UI';
import { BTN_PRI } from './SectionView';

// صفحة /auth/confirm: روابط رسائل Supabase الجديدة (token_hash + type) تصل
// هنا بدل نطاق supabase.co. التأكيد لا يحدث عند التحميل، بل عند الضغط فقط:
// برامج فحص البريد (Outlook وHotmail) تفتح الروابط تلقائياً، فتستهلك الرابط
// لو أكّدناه فور فتح الصفحة. الروابط القديمة (#access_token على /) لا تمر من هنا.

type ConfirmType = 'email' | 'signup' | 'recovery' | 'email_change';

const COPY: Record<ConfirmType, { title: string; desc: string; button: string; icon: string }> = {
  email: { title: 'تأكيد بريدك الإلكتروني', desc: 'اضغط الزر لتفعيل حسابك في وثّق.', button: 'تأكيد البريد', icon: 'ti-mail-check' },
  signup: { title: 'تأكيد بريدك الإلكتروني', desc: 'اضغط الزر لتفعيل حسابك في وثّق.', button: 'تأكيد البريد', icon: 'ti-mail-check' },
  recovery: { title: 'إعادة تعيين كلمة المرور', desc: 'اضغط «متابعة» لاختيار كلمة مرور جديدة.', button: 'متابعة', icon: 'ti-lock-cog' },
  email_change: { title: 'تأكيد البريد الجديد', desc: 'اضغط الزر لاعتماد بريدك الجديد في حسابك.', button: 'تأكيد البريد', icon: 'ti-mail-check' },
};

const isConfirmType = (t: string | null): t is ConfirmType =>
  t === 'email' || t === 'signup' || t === 'recovery' || t === 'email_change';

interface AuthConfirmProps {
  onDone: (page: 'dashboard' | 'auth') => void;
  onToast: (msg: string, kind: ToastKind) => void;
}

export default function AuthConfirm({ onDone, onToast }: AuthConfirmProps) {
  // يُقرأ الرابط مرة واحدة عند التركيب، قبل أن يُمسح من شريط العنوان
  const [params] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const type = q.get('type');
    return { tokenHash: q.get('token_hash'), type: isConfirmType(type) ? type : null };
  });
  const valid = !!params.tokenHash && !!params.type;

  const [status, setStatus] = useState<'idle' | 'loading' | 'failed' | 'offline'>(valid ? 'idle' : 'failed');
  // نص زر الفشل يتبع وجهته: لوحة التحكم إن كانت هناك جلسة، وإلا صفحة الدخول
  const [hasSession, setHasSession] = useState(false);
  // الرابط يُستعمل مرة واحدة: الحارس يمنع استدعاءً ثانياً قبل أن يتعطّل الزر
  const runningRef = useRef(false);

  useEffect(() => {
    if (status !== 'failed' || !supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(!!data.session);
    });
    return () => { cancelled = true; };
  }, [status]);

  const handleConfirm = async () => {
    if (runningRef.current || !params.tokenHash || !params.type) return;
    if (!supabase) { setStatus('offline'); return; }
    runningRef.current = true;
    setStatus('loading');

    const type = params.type;
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: type as EmailOtpType });

    if (error) {
      console.warn('[AuthConfirm] تعذّر التأكيد:', error.code ?? error.status);
      // انقطاع الشبكة: الرابط لم يُستهلك بعد، فيبقى في العنوان والزر فعّالاً لإعادة المحاولة
      if (isAuthRetryableFetchError(error)) {
        runningRef.current = false;
        setStatus('offline');
        return;
      }
      window.history.replaceState(null, '', '/auth/confirm');
      setStatus('failed');
      return;
    }

    window.history.replaceState(null, '', '/');

    if (type === 'recovery') {
      // verifyOtp أطلق PASSWORD_RECOVERY فعلاً، فتفتح Auth شاشة «تعيين كلمة مرور جديدة»
      onDone('auth');
      return;
    }
    if (type === 'email_change') {
      if (data.session) {
        onToast('تم تأكيد بريدك الجديد', 'success');
        onDone('dashboard');
      } else {
        // أول رابطَي «تغيير البريد الآمن»: لا جلسة جديدة بعد
        onToast('قُبل الرابط. أكمل التأكيد من الرابط المرسل إلى بريدك الآخر.', 'info');
        const { data: current } = await supabase.auth.getSession();
        onDone(current.session ? 'dashboard' : 'auth');
      }
      return;
    }
    onToast('تم تأكيد بريدك الإلكتروني', 'success');
    onDone('dashboard');
  };

  const handleBack = () => {
    window.history.replaceState(null, '', '/');
    onDone(hasSession ? 'dashboard' : 'auth');
  };

  const copy = params.type ? COPY[params.type] : null;
  const failed = status === 'failed' || !copy;
  const loading = status === 'loading';

  return (
    <div dir="rtl" className="min-h-dvh flex items-center justify-center px-4 py-6 bg-[var(--bg)]">
      <div className="bg-[var(--s1)] border border-[var(--bd2)] rounded-[var(--r-lg)] p-6 sm:p-8 w-full max-w-[480px] text-center">
        <img src="/brand/logo-primary-ondark.svg" alt="وثّق" className="w-[116px] h-auto mx-auto mb-6" />

        {failed ? (
          <>
            <h1 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] mb-3">تعذّر التأكيد</h1>
            <div role="alert" className="flex items-start justify-center gap-2 text-[length:var(--fs-sm)] text-[var(--danger)] leading-relaxed mb-2">
              <i className="ti ti-alert-circle text-[24px] shrink-0" aria-hidden="true"></i>
              <span>انتهت صلاحية الرابط أو استُعمل من قبل.</span>
            </div>
            {!hasSession && (
              <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed mb-6">
                يمكنك طلب رابط جديد من صفحة الدخول.
              </p>
            )}
            <button type="button" className={`${BTN_PRI} w-full ${hasSession ? 'mt-4' : ''}`} onClick={handleBack}>
              <i className={`ti ${hasSession ? 'ti-layout-dashboard' : 'ti-login'} text-[20px]`} aria-hidden="true"></i>
              {hasSession ? 'الذهاب إلى لوحة التحكم' : 'العودة لتسجيل الدخول'}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] mb-3">{copy.title}</h1>
            <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed mb-6">{copy.desc}</p>
            <button
              type="button"
              className={`${BTN_PRI} w-full disabled:opacity-40 disabled:cursor-wait`}
              onClick={handleConfirm}
              disabled={loading}
            >
              <i className={`ti ${loading ? 'ti-loader animate-spin motion-reduce:animate-none' : copy.icon} text-[20px]`} aria-hidden="true"></i>
              {loading ? 'جاري التأكيد...' : copy.button}
            </button>
            {status === 'offline' && (
              <div role="alert" className="mt-3 flex items-start justify-center gap-2 text-[length:var(--fs-sm)] text-[var(--danger)] leading-relaxed">
                <i className="ti ti-wifi-off text-[20px] shrink-0" aria-hidden="true"></i>
                <span>تعذّر الاتصال بالخادم، تحقق من اتصالك ثم أعد المحاولة.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

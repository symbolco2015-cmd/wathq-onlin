import { useEffect, useState } from 'react';
import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { BTN_SM } from './SectionView';

const RESEND_COOLDOWN_MS = 60_000;

interface CheckEmailScreenProps {
  email: string;
  // 'signup': just registered. 'unconfirmed': tried to log in before confirming.
  variant: 'signup' | 'unconfirmed';
  // Must be the same URL passed to signUp, so the resent link lands in the same place
  emailRedirectTo: string;
  onChangeEmail: () => void;
  onGoLogin: () => void;
}

// Resend errors are classified by code / status, never by the English message text.
function mapResendError(err: unknown): string {
  if (isAuthRetryableFetchError(err))
    return 'تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت.';
  if (isAuthError(err)) {
    if (err.code === 'over_email_send_rate_limit' || err.code === 'over_request_rate_limit' || err.status === 429)
      return 'حاولت كثيراً، انتظر قليلاً ثم أعد المحاولة';
  }
  return 'تعذّرت إعادة الإرسال، حاول بعد قليل.';
}

export default function CheckEmailScreen({ email, variant, emailRedirectTo, onChangeEmail, onGoLogin }: CheckEmailScreenProps) {
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  // Tick once per second only while the cooldown is running
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const handleResend = async () => {
    if (!supabase || sending || secondsLeft > 0) return;
    setSending(true);
    setResult(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
      if (error) throw error;
      setResult({ ok: true, msg: 'أُعيد الإرسال. تحقق من بريدك.' });
    } catch (err) {
      console.error('Resend confirmation error:', err);
      setResult({ ok: false, msg: mapResendError(err) });
    } finally {
      // Every press starts the cooldown, whether it succeeded or failed
      const t = Date.now();
      setNow(t);
      setCooldownUntil(t + RESEND_COOLDOWN_MS);
      setSending(false);
    }
  };

  return (
    <div className="relative z-10 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center mb-4">
        <i className="ti ti-mail-check text-[32px] text-[var(--accent)]" aria-hidden="true"></i>
      </div>

      <h2 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] mb-3">
        {variant === 'signup' ? 'تحقق من بريدك الإلكتروني' : 'حسابك لم يُفعَّل بعد'}
      </h2>

      <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed mb-6">
        {variant === 'signup' ? 'أرسلنا رابط التفعيل إلى:' : 'فعّل حسابك من الرابط الذي أرسلناه سابقاً إلى:'}
        <br />
        <span dir="ltr" className="inline-block font-bold text-[var(--t1)] break-all my-1">{email}</span>
        {variant === 'signup' && (
          <>
            <br />
            افتح الرسالة واضغط الرابط لتفعيل حسابك.
          </>
        )}
      </p>

      <div className="w-full flex items-start gap-3 bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4 mb-6 text-start">
        <i className="ti ti-alert-triangle text-[length:var(--fs-lg)] text-[var(--warn)] shrink-0" aria-hidden="true"></i>
        <div>
          <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-1">لم تصلك الرسالة؟</div>
          <div className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
            تحقق من مجلد البريد غير المرغوب فيه (Junk أو Spam)، وانقل الرسالة إلى البريد الوارد. قد تستغرق الرسالة دقيقة أو دقيقتين.
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`${BTN_SM} self-center disabled:opacity-40 disabled:cursor-not-allowed`}
        onClick={handleResend}
        disabled={sending || secondsLeft > 0}
      >
        <i className={`ti ${sending ? 'ti-loader animate-spin' : 'ti-send'}`} aria-hidden="true"></i>
        {secondsLeft > 0 ? `إعادة الإرسال بعد ${secondsLeft} ث` : 'إعادة إرسال الرابط'}
      </button>

      {result && (
        <div
          role="status"
          className={`mt-3 text-[length:var(--fs-sm)] ${result.ok ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}
        >
          {result.msg}
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          className="bg-transparent border-none p-0 cursor-pointer text-[length:var(--fs-sm)] text-[var(--t2)] hover:text-[var(--t1)]"
          onClick={onChangeEmail}
        >
          تغيير البريد
        </button>
        <button
          type="button"
          className="bg-transparent border-none p-0 cursor-pointer text-[length:var(--fs-sm)] text-[var(--t2)] hover:text-[var(--t1)]"
          onClick={onGoLogin}
        >
          لديّ حساب مؤكد؟ تسجيل الدخول
        </button>
      </div>
    </div>
  );
}

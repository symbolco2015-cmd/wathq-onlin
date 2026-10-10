import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import CheckEmailScreen from './CheckEmailScreen';
import type { ToastKind } from './UI';
import { BTN_PRI } from './SectionView';
import { FIELD, LABEL, BTN_2ND, toggleBtn } from './formStyles';

// الدخول بحساب مايكروسوفت غير مفعّل بعد: ينتظر إعداد Entra ID وموافقة الوزارة.
// الزر ودالته handleOAuth('azure') باقيان في الكود، ولتفعيله غيّر القيمة إلى true.
const MICROSOFT_AUTH_ENABLED = false;

// أيقونة التسمية فوق الحقل
const LABEL_ICON = 'ti text-[16px] text-[var(--t3)]';
// الروابط الثانوية: محايدة مع خط تحت عند المرور
const LINK = 'bg-transparent border-none cursor-pointer text-[var(--t2)] hover:underline disabled:opacity-40';
// زر الدخول بحساب خارجي
const BTN_OAUTH = `${BTN_2ND} w-full border-[var(--bd2)] text-[var(--t1)] cursor-pointer hover:bg-[var(--s2)] disabled:opacity-40`;

interface AuthProps {
  onLoginSuccess: () => void;
  onToast: (msg: string, kind: ToastKind) => void;
  // True when the user arrived through a password-recovery email link
  recovery?: boolean;
  // Called after the new password has been saved successfully
  onRecoveryComplete?: () => void;
}

type AuthMode = 'login' | 'reg' | 'forgot' | 'update' | 'check';

// Maps raw Supabase / network error messages to friendly Arabic strings.
// Never expose internal error details to the user.
function mapAuthError(err: any, fallback: string): string {
  const msg: string = (err?.message ?? '').toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (msg.includes('email not confirmed'))
    return 'يرجى تأكيد بريدك الإلكتروني أولاً.';
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'هذا البريد الإلكتروني مسجّل مسبقاً.';
  if (msg.includes('email address is invalid') || msg.includes('unable to validate email'))
    return 'صيغة البريد الإلكتروني غير صالحة.';
  if (msg.includes('password should be at least') || msg.includes('weak_password'))
    return 'كلمة المرور قصيرة جداً، يرجى اختيار كلمة أقوى.';
  if (msg.includes('too many requests') || msg.includes('rate limit') || msg.includes('over_email_send_rate_limit'))
    return 'عدد المحاولات تجاوز الحد المسموح، يرجى الانتظار قليلاً ثم المحاولة مجدداً.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch'))
    return 'تعذّر الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت.';
  if (msg.includes('session') || msg.includes('token') || msg.includes('expired'))
    return 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.';

  return fallback;
}

export default function Auth({ onLoginSuccess, onToast, recovery, onRecoveryComplete }: AuthProps) {
  const [mode, setMode] = useState<AuthMode>(recovery ? 'update' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  // Which title the "check your email" screen shows: after sign-up, or after a login with an unconfirmed email
  const [checkVariant, setCheckVariant] = useState<'signup' | 'unconfirmed'>('signup');
  // Persistent message under the register form (e.g. email already registered)
  const [regError, setRegError] = useState<string | null>(null);

  // Same confirmation-link target for signUp and for resend
  const emailRedirectTo = window.location.origin;

  // Switch to the "set new password" screen as soon as a recovery link is detected
  useEffect(() => {
    if (recovery) setMode('update');
  }, [recovery]);

  const handleAuth = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!supabase) {
      onToast('تعذّر الاتصال بالخادم، حاول لاحقاً.', 'error');
      return;
    }

    if (!email || !password || (mode === 'reg' && !name)) {
      onToast('الرجاء تعبئة كافة الحقول المطلوبة.', 'error');
      return;
    }

    if (mode === 'reg' && password.length < 12) {
      onToast('كلمة المرور يجب أن تكون 12 حرفاً على الأقل.', 'error');
      return;
    }

    setLoading(true);
    setRegError(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        onToast('مرحباً بك في منصة وثّق!', 'success');
        setTimeout(() => {
          onLoginSuccess();
        }, 700);
      } else {
        // Registration
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: {
              full_name: name,
            }
          }
        });

        // With confirmations on, Supabase returns a user with no identities (and sends
        // no email) instead of an error when the address is already registered.
        // With confirmations off, it returns an error code instead.
        const isDuplicate =
          (Array.isArray(data.user?.identities) && data.user.identities.length === 0) ||
          error?.code === 'user_already_exists' || error?.code === 'email_exists';

        if (isDuplicate) {
          setRegError('هذا البريد مسجّل من قبل. سجّل الدخول، أو استعمل «نسيت كلمة المرور».');
          return;
        }

        if (error) throw error;

        if (data.session) {
          onToast('تم إنشاء حسابك وتسجيل الدخول بنجاح', 'success');
          setTimeout(() => {
            onLoginSuccess();
          }, 700);
        } else {
          setCheckVariant('signup');
          setMode('check');
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      if (mode === 'login' && err?.code === 'email_not_confirmed') {
        setCheckVariant('unconfirmed');
        setMode('check');
        return;
      }
      onToast(mapAuthError(err, 'حدث خطأ أثناء عملية المصادقة، يرجى المحاولة مجدداً.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Step 1 of recovery: send the reset email
  const handleForgot = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!supabase) {
      onToast('تعذّر الاتصال بالخادم، حاول لاحقاً.', 'error');
      return;
    }

    if (!email) {
      onToast('الرجاء إدخال بريدك الإلكتروني أولاً.', 'error');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) throw error;

      onToast('تم إرسال رابط استعادة كلمة المرور إلى بريدك', 'success');
      setMode('login');
    } catch (err: any) {
      console.error('Reset password error:', err);
      onToast(mapAuthError(err, 'تعذّر إرسال رابط الاستعادة، يرجى المحاولة لاحقاً.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 of recovery: save the new password for the recovered session
  const handleUpdatePassword = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!supabase) {
      onToast('تعذّر الاتصال بالخادم، حاول لاحقاً.', 'error');
      return;
    }

    if (!password || !confirmPassword) {
      onToast('الرجاء تعبئة كلمة المرور وتأكيدها.', 'error');
      return;
    }

    if (password.length < 12) {
      onToast('كلمة المرور يجب أن تكون 12 حرفاً على الأقل.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      onToast('كلمتا المرور غير متطابقتين.', 'error');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      onToast('تم تحديث كلمة المرور بنجاح', 'success');
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        onRecoveryComplete?.();
      }, 700);
    } catch (err: any) {
      console.error('Update password error:', err);
      onToast(mapAuthError(err, 'تعذّر تحديث كلمة المرور، يرجى المحاولة مجدداً.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'azure') => {
    if (!supabase) {
      onToast('تعذّر الاتصال بالخادم، حاول لاحقاً.', 'error');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        }
      });

      if (error) throw error;
    } catch (err: any) {
      console.error(`${provider} Login error:`, err);
      onToast(mapAuthError(err, 'حدث خطأ أثناء محاولة تسجيل الدخول، يرجى المحاولة مجدداً.'), 'error');
    }
  };

  const isReg = mode === 'reg';

  const features = [
    { icon: 'ti-report-analytics', title: 'نسبة جاهزية تلقائية', desc: 'مؤشرات موزعة على أقسام ملف الإنجاز، مع نسبة جاهزية تُحسب فور إضافة كل شاهد.' },
    { icon: 'ti-bulb', title: 'أدوات مصممة للمعلم', desc: 'توثيق سريع بالصورة، اقتراحات ذكية بالذكاء الاصطناعي، وتذكير موسمي بمواعيد التوثيق.' },
    { icon: 'ti-share', title: 'صفحة عرض لمدراء المدارس', desc: 'رابط مشاركة عام لملفك يطّلع عليه المدير أو المشرف دون الحاجة لإنشاء حساب دخول.' },
  ];

  return (
    // الخلفية المصمتة تغطي Background.tsx المشتركة خلف صفحة الدخول
    <div dir="rtl" className="min-h-dvh flex flex-col lg:flex-row bg-[var(--bg)]">
      {/* Right side (first in DOM → right in RTL): login/register form card */}
      <div className="w-full lg:w-1/2 flex items-start lg:items-center justify-center px-4 py-6 lg:p-8">
        <div className="bg-[var(--s1)] border border-[var(--bd2)] rounded-[var(--r-lg)] p-6 sm:p-8 w-full max-w-[480px]">
          <div className="text-center mb-8">
            <img src="/brand/logo-primary-ondark.svg" alt="وثّق" className="w-[116px] h-auto mx-auto mb-4" />
            <div className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
              ملف الإنجاز الرقمي للمعلم السعودي
            </div>
          </div>

          {(mode === 'login' || mode === 'reg') && (
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                aria-pressed={mode === 'login'}
                className={toggleBtn(mode === 'login')}
                onClick={() => { setMode('login'); setRegError(null); }}
                disabled={loading}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                aria-pressed={mode === 'reg'}
                className={toggleBtn(mode === 'reg')}
                onClick={() => { setMode('reg'); setRegError(null); }}
                disabled={loading}
              >
                حساب جديد
              </button>
            </div>
          )}

        {(mode === 'forgot' || mode === 'update') && (
          <div className="mb-6 text-center bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
            <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] mb-2 flex items-center justify-center gap-2">
              <i className={`ti ${mode === 'forgot' ? 'ti-mail-question' : 'ti-lock-cog'} text-[20px] text-[var(--t2)]`} aria-hidden="true"></i>
              {mode === 'forgot' ? 'استعادة كلمة المرور' : 'تعيين كلمة مرور جديدة'}
            </div>
            <div className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
              {mode === 'forgot'
                ? 'أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.'
                : 'اختر كلمة مرور جديدة لحسابك ثم قم بتأكيدها.'}
            </div>
          </div>
        )}

        {mode === 'check' && (
          <CheckEmailScreen
            email={email}
            variant={checkVariant}
            emailRedirectTo={emailRedirectTo}
            onChangeEmail={() => { setPassword(''); setMode('reg'); }}
            onGoLogin={() => { setPassword(''); setMode('login'); }}
          />
        )}

        {mode !== 'check' && (
        <form onSubmit={(e) => e.preventDefault()}>
          {mode === 'reg' && (
            <div className="mb-4">
              <label htmlFor="auth-name" className={LABEL}>
                <i className={`${LABEL_ICON} ti-user`} aria-hidden="true"></i> الاسم الكامل
              </label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
                placeholder="الاسم الثلاثي"
                required
                disabled={loading}
              />
            </div>
          )}

          {mode !== 'update' && (
            <div className="mb-4">
              <label htmlFor="auth-email" className={LABEL}>
                <i className={`${LABEL_ICON} ti-mail`} aria-hidden="true"></i> البريد الإلكتروني
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setRegError(null); }}
                className={FIELD}
                placeholder="example@edu.sa"
                required
                disabled={loading}
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="mb-4">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="auth-password" className={LABEL}>
                  <i className={`${LABEL_ICON} ti-lock`} aria-hidden="true"></i> {mode === 'update' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className={`${LINK} mb-2 p-0 text-[length:var(--fs-xs)]`}
                    onClick={() => setMode('forgot')}
                    disabled={loading}
                  >
                    نسيت كلمة المرور؟
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          )}

          {mode === 'update' && (
            <div className="mb-4">
              <label htmlFor="auth-confirm" className={LABEL}>
                <i className={`${LABEL_ICON} ti-lock-check`} aria-hidden="true"></i> تأكيد كلمة المرور
              </label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={FIELD}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          )}

          <button
            type="submit"
            className={`${BTN_PRI} w-full mt-2 disabled:opacity-40 disabled:cursor-wait`}
            onClick={mode === 'forgot' ? handleForgot : mode === 'update' ? handleUpdatePassword : handleAuth}
            disabled={loading}
          >
            <i className={`ti ${loading ? 'ti-loader animate-spin motion-reduce:animate-none' : (mode === 'login' ? 'ti-login' : isReg ? 'ti-user-plus' : mode === 'forgot' ? 'ti-send' : 'ti-device-floppy')} text-[20px]`} aria-hidden="true"></i>
            {loading ? 'جاري التحميل...' : (mode === 'login' ? 'دخول إلى الحساب' : isReg ? 'إنشاء الحساب' : mode === 'forgot' ? 'إرسال رابط الاستعادة' : 'حفظ كلمة المرور الجديدة')}
          </button>

          {isReg && regError && (
            <div role="alert" className="mt-3 flex items-start justify-center gap-2 text-[length:var(--fs-sm)] text-[var(--danger)] leading-relaxed">
              <i className="ti ti-alert-circle text-[20px] shrink-0" aria-hidden="true"></i>
              <span>{regError}</span>
            </div>
          )}

          {(mode === 'forgot' || mode === 'update') && (
            <button
              type="button"
              className={`${LINK} w-full h-11 mt-2 text-[length:var(--fs-sm)] font-bold flex items-center justify-center gap-2`}
              onClick={() => { setMode('login'); setConfirmPassword(''); }}
              disabled={loading}
            >
              <i className="ti ti-arrow-right text-[16px]" aria-hidden="true"></i>
              العودة لتسجيل الدخول
            </button>
          )}

          {(mode === 'login' || mode === 'reg') && (
          <>
          <div className="my-6 flex items-center">
            <div className="flex-grow border-t border-[var(--bd)]"></div>
            <span className="flex-shrink-0 mx-4 text-[var(--t3)] text-[length:var(--fs-xs)] font-bold">أو المتابعة عبر</span>
            <div className="flex-grow border-t border-[var(--bd)]"></div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              className={BTN_OAUTH}
              onClick={() => handleOAuth('google')}
              disabled={loading}
            >
              <i className="ti ti-brand-google text-[20px]" aria-hidden="true"></i>
              المتابعة بحساب جوجل
            </button>
            {MICROSOFT_AUTH_ENABLED && (
            <button
              type="button"
              className={BTN_OAUTH}
              onClick={() => handleOAuth('azure')}
              disabled={loading}
            >
              <i className="ti ti-brand-windows text-[20px]" aria-hidden="true"></i>
              المتابعة بحساب مايكروسوفت
            </button>
            )}
          </div>
          </>
          )}
        </form>
        )}
        </div>
      </div>

      {/* Left side (second in DOM → left in RTL): platform info panel, desktop only */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-8">
        <div className="max-w-[440px]">
          <div className="inline-flex items-center gap-2 py-1 px-3 rounded-[var(--r-full)] border border-[var(--bd)] text-[length:var(--fs-xs)] font-bold text-[var(--t2)] mb-8">
            <img src="/brand/mark.svg" alt="" aria-hidden="true" className="h-[16px] w-auto" />
            منصة وثّق
          </div>
          <h2 className="text-[length:var(--fs-xl)] font-bold leading-snug text-[var(--t1)] mb-3">
            ملف إنجازك المهني
            <br />
            <span className="text-[var(--t2)]">
              {isReg ? 'يبدأ من هنا' : 'بانتظارك'}
            </span>
          </h2>
          <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed mb-8">
            ابنِ ملف إنجازك المهني بذكاء: نظّم شواهدك وأنشطتك التعليمية في أقسام ملف الإنجاز، وتابع نسبة جاهزيتك تلقائياً، وصدّر ملفك PDF منسقاً وجاهزاً للطباعة والمشاركة بنقرة واحدة.
          </p>
          <div className="flex flex-col gap-4">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4 bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
                <div className="shrink-0 w-11 h-11 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[20px] text-[var(--t2)]">
                  <i className={`ti ${f.icon}`} aria-hidden="true"></i>
                </div>
                <div>
                  <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-1">{f.title}</div>
                  <div className="text-[length:var(--fs-xs)] text-[var(--t2)] leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

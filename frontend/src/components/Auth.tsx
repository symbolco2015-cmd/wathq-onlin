import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface AuthProps {
  onLoginSuccess: () => void;
  onToast: (msg: string, icon?: string) => void;
  spawnParticles: (rect: DOMRect) => void;
  // True when the user arrived through a password-recovery email link
  recovery?: boolean;
  // Called after the new password has been saved successfully
  onRecoveryComplete?: () => void;
}

type AuthMode = 'login' | 'reg' | 'forgot' | 'update';

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

export default function Auth({ onLoginSuccess, onToast, spawnParticles, recovery, onRecoveryComplete }: AuthProps) {
  const [mode, setMode] = useState<AuthMode>(recovery ? 'update' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Switch to the "set new password" screen as soon as a recovery link is detected
  useEffect(() => {
    if (recovery) setMode('update');
  }, [recovery]);

  const handleAuth = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!supabase) {
      onToast('لم يتم تهيئة Supabase. الرجاء ضبط إعدادات الاتصال في ملف .env', '⚠️');
      return;
    }

    if (!email || !password || (mode === 'reg' && !name)) {
      onToast('الرجاء تعبئة كافة الحقول المطلوبة.', '⚠️');
      return;
    }

    if (mode === 'reg' && password.length < 12) {
      onToast('كلمة المرور يجب أن تكون 12 حرفاً على الأقل.', '⚠️');
      return;
    }

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    spawnParticles(rect);
    
    // Simulate button ripple/scale
    btn.style.transform = 'scale(.96)';
    setTimeout(() => {
      btn.style.transform = '';
    }, 200);

    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        onToast('مرحباً بك في منصة وثّق! 👋', '🎉');
        setTimeout(() => {
          onLoginSuccess();
        }, 700);
      } else {
        // Registration
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          onToast('تم إنشاء حسابك وتسجيل الدخول بنجاح ✓', '✓');
          setTimeout(() => {
            onLoginSuccess();
          }, 700);
        } else {
          onToast('تم إنشاء الحساب! يرجى تأكيد بريدك الإلكتروني ✉️', '✉️');
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      onToast(mapAuthError(err, 'حدث خطأ أثناء عملية المصادقة، يرجى المحاولة مجدداً.'), '❌');
    } finally {
      setLoading(false);
    }
  };

  // Step 1 of recovery: send the reset email
  const handleForgot = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!supabase) {
      onToast('لم يتم تهيئة Supabase. الرجاء ضبط إعدادات الاتصال في ملف .env', '⚠️');
      return;
    }

    if (!email) {
      onToast('الرجاء إدخال بريدك الإلكتروني أولاً.', '⚠️');
      return;
    }

    const btn = e.currentTarget;
    spawnParticles(btn.getBoundingClientRect());
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) throw error;

      onToast('تم إرسال رابط استعادة كلمة المرور إلى بريدك ✉️', '✉️');
      setMode('login');
    } catch (err: any) {
      console.error('Reset password error:', err);
      onToast(mapAuthError(err, 'تعذّر إرسال رابط الاستعادة، يرجى المحاولة لاحقاً.'), '❌');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 of recovery: save the new password for the recovered session
  const handleUpdatePassword = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!supabase) {
      onToast('لم يتم تهيئة Supabase. الرجاء ضبط إعدادات الاتصال في ملف .env', '⚠️');
      return;
    }

    if (!password || !confirmPassword) {
      onToast('الرجاء تعبئة كلمة المرور وتأكيدها.', '⚠️');
      return;
    }

    if (password.length < 12) {
      onToast('كلمة المرور يجب أن تكون 12 حرفاً على الأقل.', '⚠️');
      return;
    }

    if (password !== confirmPassword) {
      onToast('كلمتا المرور غير متطابقتين.', '⚠️');
      return;
    }

    const btn = e.currentTarget;
    spawnParticles(btn.getBoundingClientRect());
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      onToast('تم تحديث كلمة المرور بنجاح ✓', '✓');
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        onRecoveryComplete?.();
      }, 700);
    } catch (err: any) {
      console.error('Update password error:', err);
      onToast(mapAuthError(err, 'تعذّر تحديث كلمة المرور، يرجى المحاولة مجدداً.'), '❌');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'azure') => {
    if (!supabase) {
      onToast('لم يتم تهيئة Supabase. الرجاء ضبط إعدادات الاتصال في ملف .env', '⚠️');
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
      onToast(mapAuthError(err, 'حدث خطأ أثناء محاولة تسجيل الدخول، يرجى المحاولة مجدداً.'), '❌');
    }
  };

  const isReg = mode === 'reg';
  // Only flips between 'login' and 'reg' colors — forgot/update stay on the green (login) accent,
  // so the blade-sweep (keyed on this) doesn't replay when navigating into/out of those sub-flows.
  const accentKey = isReg ? 'gold' : 'green';

  const inputFocusClasses = isReg
    ? 'focus:bg-[var(--gold)]/5 focus:border-[var(--gold)]/40 focus:shadow-[0_0_0_4px_rgba(201,162,39,.15),inset_0_1px_0_rgba(255,255,255,.05)]'
    : 'focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_4px_rgba(42,122,68,.15),inset_0_1px_0_rgba(255,255,255,.05)]';

  const underlineClasses = isReg
    ? 'from-[var(--gold)] via-[var(--gold3)] to-[var(--gold)]'
    : 'from-[var(--em7)] via-[var(--gold)] to-[var(--em7)]';

  const features = [
    { icon: 'ti-report-analytics', title: 'نظام تقييم تلقائي', desc: 'أكثر من 33 مؤشراً فرعياً موزعة على 11 قسماً، مع احتساب نقاطك فور إضافة كل شاهد.' },
    { icon: 'ti-bulb', title: 'أدوات مصممة للمعلم', desc: 'توثيق سريع بالصورة أو الصوت، اقتراحات ذكية بالذكاء الاصطناعي، وتذكير موسمي بمواعيد التوثيق.' },
    { icon: 'ti-share', title: 'صفحة عرض لمدراء المدارس', desc: 'رابط مشاركة عام لملفك يطّلع عليه المدير أو المشرف دون الحاجة لإنشاء حساب دخول.' },
  ];

  return (
    <div dir="rtl" className="min-h-[calc(100vh-72px)] flex flex-col lg:flex-row relative overflow-hidden">
      {/* Scan line effect */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-5">
        <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--em7)] to-transparent" style={{ animation: 'scanLine 8s linear infinite' }}></div>
      </div>

      {/* Geometric shapes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute border border-[var(--em7)]/10 rounded-[20%] w-[300px] h-[300px] -top-20 -right-[60px] rotate-[20deg]" style={{ animation: 'float 8s ease-in-out infinite' }}></div>
        <div className="absolute border border-[var(--em7)]/10 rounded-full w-[200px] h-[200px] -bottom-10 -left-10 rotate-[-15deg]" style={{ animation: 'float 10s ease-in-out infinite 2s' }}></div>
        <div className="absolute border border-[var(--em7)]/10 rounded-[20%] w-[150px] h-[150px] top-[30%] left-[5%] rotate-[35deg]" style={{ animation: 'float 7s ease-in-out infinite 1s' }}></div>
        <div className="absolute border border-[var(--em7)]/10 rounded-full w-[80px] h-[80px] top-[15%] right-[8%] bg-[var(--gold)]/5" style={{ animation: 'floatR 5s ease-in-out infinite' }}></div>
      </div>

      {/* Right side (first in DOM → right in RTL): login/register form card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-5 sm:p-8 relative z-10">
        <div className="relative bg-[#0c1c12]/80 backdrop-blur-[40px] saturate-150 border border-[var(--em7)]/15 rounded-[28px] py-[52px] px-12 w-full max-w-[480px] shadow-[0_0_0_1px_rgba(82,196,120,.05),0_40px_100px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.05)] overflow-hidden" style={{ animation: 'scaleIn .8s var(--sp) both' }}>
          <div className="absolute -top-px right-[15%] left-[15%] h-px pointer-events-none overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--em7)] via-[var(--gold)] via-[var(--em7)] to-transparent transition-opacity duration-700" style={{ opacity: isReg ? 0 : 0.6 }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--gold)] via-[var(--gold3)] via-[var(--gold)] to-transparent transition-opacity duration-700" style={{ opacity: isReg ? 0.6 : 0 }}></div>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(42,122,68,.12),transparent_70%)] pointer-events-none z-0"></div>

          <div className="text-center mb-10 relative z-10">
            <div className="inline-flex items-center justify-center w-[84px] h-[84px] rounded-[24px] bg-gradient-to-br from-[var(--em3)] to-[var(--em6)] text-[40px] text-white mb-5 shadow-[0_0_0_1px_rgba(82,196,120,.3),0_16px_48px_rgba(42,122,68,.6)] relative overflow-hidden" style={{ animation: 'float 4s ease-in-out infinite' }}>
              <div className="absolute -top-1/2 -right-1/2 w-[70%] h-[70%] bg-white/15 rounded-full blur-[10px]"></div>
              <i className="ti ti-certificate"></i>
            </div>
            <div className="text-[30px] font-black tracking-[-.5px] mb-2 text-transparent bg-clip-text bg-[linear-gradient(135deg,var(--em8)_0%,var(--gold3)_50%,var(--em9)_100%)] bg-[length:200%_auto]" style={{ animation: 'goldShimmer 4s linear infinite' }}>
              منصة وثّق
            </div>
            <div className="font-[var(--font2)] text-[14px] text-[var(--text3)] tracking-wide leading-relaxed">
              ملف الإنجاز الرقمي للمعلم السعودي
            </div>
          </div>

          {(mode === 'login' || mode === 'reg') && (
            <div className="flex bg-white/5 border border-[var(--line)] rounded-xl p-1 mb-9 gap-[3px] relative z-10">
              <button
                type="button"
                className={`flex-1 py-2.5 rounded-[11px] cursor-pointer text-[14px] font-bold transition-all duration-700 font-[var(--font)] border-none ${mode === 'login' ? 'bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white shadow-[0_4px_16px_rgba(42,122,68,.5)]' : 'bg-transparent text-[var(--text3)] hover:text-white'}`}
                onClick={() => setMode('login')}
                disabled={loading}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                className={`flex-1 py-2.5 rounded-[11px] cursor-pointer text-[14px] font-bold transition-all duration-700 font-[var(--font)] border-none ${mode === 'reg' ? 'bg-gradient-to-br from-[var(--gold)] to-[var(--gold3)] text-[var(--surf0)] shadow-[0_4px_16px_rgba(201,162,39,.5)]' : 'bg-transparent text-[var(--text3)] hover:text-white'}`}
                onClick={() => setMode('reg')}
                disabled={loading}
              >
                حساب جديد
              </button>
            </div>
          )}

        {(mode === 'forgot' || mode === 'update') && (
          <div className="mb-9 relative z-10 text-center bg-[var(--em7)]/5 border border-[var(--em7)]/15 rounded-xl py-4 px-5">
            <div className="text-[15px] font-bold text-white mb-1.5 flex items-center justify-center gap-2">
              <i className={`ti ${mode === 'forgot' ? 'ti-mail-question' : 'ti-lock-cog'} text-[var(--em8)]`}></i>
              {mode === 'forgot' ? 'استعادة كلمة المرور' : 'تعيين كلمة مرور جديدة'}
            </div>
            <div className="text-[12.5px] text-[var(--text3)] leading-relaxed">
              {mode === 'forgot'
                ? 'أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.'
                : 'اختر كلمة مرور جديدة لحسابك ثم قم بتأكيدها.'}
            </div>
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} className="relative z-10">
          {mode === 'reg' && (
            <div className="mb-5 relative group">
              <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text3)] mb-2.5 tracking-wide uppercase">
                <i className="ti ti-user text-[16px] text-[var(--em7)]"></i> الاسم الكامل
              </div>
              <div className="relative">
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full py-3.5 px-5 bg-white/5 border-[1.5px] border-white/10 rounded-xl text-[15px] font-[var(--font)] text-white outline-none transition-all duration-700 placeholder-[var(--text4)] ${inputFocusClasses} peer`}
                  placeholder="الاسم الثلاثي"
                  required
                  disabled={loading}
                />
                <div className={`absolute bottom-0 right-0 left-0 h-[2px] bg-gradient-to-r ${underlineClasses} rounded-b-xl scale-x-0 origin-right transition-transform duration-400 peer-focus:scale-x-100`}></div>
              </div>
            </div>
          )}

          {mode !== 'update' && (
            <div className="mb-5 relative group">
              <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text3)] mb-2.5 tracking-wide uppercase">
                <i className="ti ti-mail text-[16px] text-[var(--em7)]"></i> البريد الإلكتروني
              </div>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full py-3.5 px-5 bg-white/5 border-[1.5px] border-white/10 rounded-xl text-[15px] font-[var(--font)] text-white outline-none transition-all duration-700 placeholder-[var(--text4)] ${inputFocusClasses} peer`}
                  placeholder="example@edu.sa"
                  required
                  disabled={loading}
                />
                <div className={`absolute bottom-0 right-0 left-0 h-[2px] bg-gradient-to-r ${underlineClasses} rounded-b-xl scale-x-0 origin-right transition-transform duration-400 peer-focus:scale-x-100`}></div>
              </div>
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="mb-5 relative group">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text3)] tracking-wide uppercase">
                  <i className="ti ti-lock text-[16px] text-[var(--em7)]"></i> {mode === 'update' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}
                </div>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="text-[12px] font-bold text-[var(--em8)] hover:text-[var(--gold3)] transition-colors duration-200 bg-transparent border-none cursor-pointer p-0"
                    onClick={() => setMode('forgot')}
                    disabled={loading}
                  >
                    نسيت كلمة المرور؟
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full py-3.5 px-5 bg-white/5 border-[1.5px] border-white/10 rounded-xl text-[15px] font-[var(--font)] text-white outline-none transition-all duration-700 placeholder-[var(--text4)] ${inputFocusClasses} peer`}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <div className={`absolute bottom-0 right-0 left-0 h-[2px] bg-gradient-to-r ${underlineClasses} rounded-b-xl scale-x-0 origin-right transition-transform duration-400 peer-focus:scale-x-100`}></div>
              </div>
            </div>
          )}

          {mode === 'update' && (
            <div className="mb-5 relative group">
              <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text3)] mb-2.5 tracking-wide uppercase">
                <i className="ti ti-lock-check text-[16px] text-[var(--em7)]"></i> تأكيد كلمة المرور
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full py-3.5 px-5 bg-white/5 border-[1.5px] border-white/10 rounded-xl text-[15px] font-[var(--font)] text-white outline-none transition-all duration-700 placeholder-[var(--text4)] ${inputFocusClasses} peer`}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
                <div className={`absolute bottom-0 right-0 left-0 h-[2px] bg-gradient-to-r ${underlineClasses} rounded-b-xl scale-x-0 origin-right transition-transform duration-400 peer-focus:scale-x-100`}></div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full p-4 mt-3 rounded-xl text-[16px] font-black font-[var(--font)] cursor-pointer relative overflow-hidden flex items-center justify-center gap-2.5 hover:-translate-y-[3px] active:translate-y-0 active:scale-95 border-none transition-transform duration-300 disabled:opacity-50 disabled:cursor-wait"
            onClick={mode === 'forgot' ? handleForgot : mode === 'update' ? handleUpdatePassword : handleAuth}
            disabled={loading}
          >
            <span
              className="absolute inset-0 bg-gradient-to-br from-[var(--em3)] via-[var(--em6)] to-[var(--em4)] bg-[length:200%_auto] shadow-[0_0_0_1px_rgba(82,196,120,.3),0_8px_28px_rgba(42,122,68,.6)] transition-opacity duration-700"
              style={{ opacity: isReg ? 0 : 1, animation: 'gradientFlow 3s linear infinite' }}
            ></span>
            <span
              className="absolute inset-0 bg-gradient-to-br from-[var(--gold)] via-[var(--gold3)] to-[var(--gold2)] bg-[length:200%_auto] shadow-[0_0_0_1px_rgba(201,162,39,.4),0_8px_28px_rgba(201,162,39,.55)] transition-opacity duration-700"
              style={{ opacity: isReg ? 1 : 0, animation: 'gradientFlow 3s linear infinite' }}
            ></span>
            <i className={`ti ${loading ? 'ti-loader animate-spin' : (mode === 'login' ? 'ti-login' : mode === 'reg' ? 'ti-user-plus' : mode === 'forgot' ? 'ti-send' : 'ti-device-floppy')} relative z-10 transition-colors duration-700 ${isReg ? 'text-[var(--surf0)]' : 'text-white'}`}></i>
            <span className={`relative z-10 transition-colors duration-700 ${isReg ? 'text-[var(--surf0)]' : 'text-white'}`}>{loading ? 'جاري التحميل...' : (mode === 'login' ? 'دخول إلى الحساب' : mode === 'reg' ? 'إنشاء الحساب' : mode === 'forgot' ? 'إرسال رابط الاستعادة' : 'حفظ كلمة المرور الجديدة')}</span>
          </button>

          {(mode === 'forgot' || mode === 'update') && (
            <button
              type="button"
              className="w-full mt-4 text-[13px] font-bold text-[var(--text3)] hover:text-white transition-colors duration-200 bg-transparent border-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              onClick={() => { setMode('login'); setConfirmPassword(''); }}
              disabled={loading}
            >
              <i className="ti ti-arrow-right text-[15px]"></i>
              العودة لتسجيل الدخول
            </button>
          )}

          {(mode === 'login' || mode === 'reg') && (
          <>
          <div className="relative my-7 flex items-center">
            <div className="flex-grow border-t border-[var(--em7)]/20"></div>
            <span className="flex-shrink-0 mx-4 text-[var(--text4)] text-[12.5px] font-bold">أو المتابعة عبر</span>
            <div className="flex-grow border-t border-[var(--em7)]/20"></div>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              type="button"
              className="w-full py-3.5 px-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[14px] font-bold text-white transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
              onClick={() => handleOAuth('google')}
              disabled={loading}
            >
              <i className="ti ti-brand-google text-[20px]"></i>
              حساب جوجل (Google)
            </button>
            <button 
              type="button"
              className="w-full py-3.5 px-5 bg-[#0078d4]/10 hover:bg-[#0078d4]/20 border border-[#0078d4]/30 rounded-xl text-[14px] font-bold text-white transition-all duration-300 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
              onClick={() => handleOAuth('azure')}
              disabled={loading}
            >
              <i className="ti ti-brand-windows text-[20px] text-[#00a4ef]"></i>
              حساب مايكروسوفت (Microsoft)
            </button>
          </div>
          </>
          )}
        </form>
        </div>
      </div>

      {/* Left side (second in DOM → left in RTL): platform info panel, desktop only */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative z-10">
        <div className="max-w-[440px]">
          <div className="inline-flex items-center gap-2 py-1.5 px-4 rounded-full border border-[var(--line2)] bg-white/5 text-[12px] font-bold text-[var(--text3)] tracking-wide mb-8">
            <i className="ti ti-certificate text-[var(--em7)]"></i>
            منصة وثّق
          </div>
          <h2 className="text-[38px] font-black leading-[1.15] text-white mb-2">
            ملف إنجازك المهني
            <br />
            <span className={`transition-colors duration-700 ${isReg ? 'text-[var(--gold3)]' : 'text-[var(--em8)]'}`}>
              {isReg ? 'يبدأ من هنا' : 'بانتظارك'}
            </span>
          </h2>
          <p className="text-[14.5px] text-[var(--text3)] leading-relaxed font-[var(--font2)] mb-10">
            ابنِ ملف إنجازك المهني بذكاء: نظّم شواهدك وأنشطتك التعليمية في 11 قسماً مبرمجاً، واحسب نقاط تقييمك تلقائياً، وصدر ملفك كـ PDF منسق وجاهز للطباعة والمشاركة بنقرة واحدة.
          </p>
          <div className="flex flex-col gap-4">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4 bg-white/[.03] border border-[var(--line)] rounded-2xl p-4">
                <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-[20px] transition-colors duration-700 ${isReg ? 'bg-[var(--gold)]/10 text-[var(--gold3)]' : 'bg-[var(--em7)]/10 text-[var(--em8)]'}`}>
                  <i className={`ti ${f.icon}`}></i>
                </div>
                <div>
                  <div className="text-[14.5px] font-bold text-white mb-1">{f.title}</div>
                  <div className="text-[12.5px] text-[var(--text3)] leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Blade sweep — replays on every login↔register accent switch */}
      <div
        key={accentKey}
        aria-hidden="true"
        className="hidden lg:block absolute inset-y-0 w-[140px] pointer-events-none z-20"
        style={{
          left: '50%',
          marginLeft: '-70px',
          filter: 'blur(18px)',
          background: isReg
            ? 'linear-gradient(90deg, transparent, rgba(245,216,120,.35), rgba(201,162,39,.55), rgba(245,216,120,.35), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(125,217,155,.35), rgba(82,196,120,.55), rgba(125,217,155,.35), transparent)',
          animation: 'sweepBlade 1s var(--sp) both',
        }}
      ></div>
    </div>
  );
}


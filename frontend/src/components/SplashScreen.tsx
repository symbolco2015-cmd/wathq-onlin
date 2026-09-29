import { useEffect, useState } from 'react';
import { useSupportContacts } from '../hooks/useSupportContacts';

interface SplashScreenProps {
  failed?: boolean;
  onRetry?: () => void;
}

type Phase = 'blank' | 'splash' | 'slow' | 'fail';

// شاشة البداية حسب wathq-prototype.html (splash / failView):
// أقل من 400ms: خلفية --brand فارغة فقط. بعد 4 ثوانٍ: سطر البطء.
// بعد 12 ثانية: حالة الفشل. المؤقتات تُنظَّف عند فك التركيب.
export default function SplashScreen({ failed = false, onRetry }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>(failed ? 'fail' : 'blank');
  const { email, whatsapp } = useSupportContacts();

  useEffect(() => {
    if (failed) return;
    const timers = [
      setTimeout(() => setPhase('splash'), 400),
      setTimeout(() => setPhase('slow'), 4000),
      setTimeout(() => setPhase('fail'), 12000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [failed]);

  const retry = () => {
    if (onRetry) onRetry();
    else window.location.reload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[500] flex flex-col items-center justify-center"
      style={{
        background: phase === 'blank' ? 'var(--brand)' : 'radial-gradient(70% 50% at 50% 40%, #124a31 0%, var(--brand) 65%)',
        color: 'var(--brand-cream)',
      }}
    >
      {phase === 'splash' || phase === 'slow' ? (
        <>
          <img
            src="/brand/logo-primary-ondark.svg"
            alt="وثّق"
            width={116}
            className="block w-[116px] h-auto motion-safe:animate-[splashBreathe_2.4s_ease-in-out_infinite]"
          />
          <div className="mt-[14px] text-[length:var(--fs-sm)]" style={{ color: 'rgba(247,245,239,.62)' }}>
            ملف إنجازك المهني
          </div>
          <div
            className="relative mt-[26px] w-[132px] h-[3px] overflow-hidden rounded-[var(--r-full)]"
            style={{ background: 'rgba(247,245,239,.12)' }}
          >
            <i
              className="absolute top-0 bottom-0 right-[30%] w-[40%] rounded-[var(--r-full)] motion-safe:animate-[splashBar_1.25s_cubic-bezier(.4,0,.2,1)_infinite]"
              style={{ background: 'var(--brand-gold)' }}
            />
          </div>
          <div
            className={`mt-4 min-h-[20px] text-[length:var(--fs-sm)] transition-opacity duration-[400ms] motion-reduce:transition-none ${phase === 'slow' ? 'opacity-100' : 'opacity-0'}`}
            style={{ color: 'rgba(247,245,239,.8)' }}
          >
            الاتصال أبطأ من المعتاد…
          </div>
        </>
      ) : phase === 'fail' ? (
        <div className="flex flex-col items-center text-center px-8 motion-safe:animate-[splashFade_.3s_ease]">
          <div
            className="w-14 h-14 flex items-center justify-center rounded-[var(--r-md)] text-[32px]"
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)' }}
          >
            <i className="ti ti-wifi-off" aria-hidden="true"></i>
          </div>
          <h2 className="mt-[18px] text-[length:var(--fs-lg)] font-bold">تعذّر الاتصال</h2>
          <p className="mt-1.5 max-w-[300px] text-[length:var(--fs-sm)] leading-[1.8]" style={{ color: 'rgba(247,245,239,.78)' }}>
            تأكد من اتصالك بالإنترنت ثم أعد المحاولة. شواهدك محفوظة ولن تضيع.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 h-11 px-4 inline-flex items-center justify-center gap-[7px] rounded-[var(--r-sm)] text-[length:var(--fs-sm)] font-bold cursor-pointer border"
            style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#04210f' }}
          >
            <i className="ti ti-refresh" aria-hidden="true"></i>
            إعادة المحاولة
          </button>
          <small className="mt-3 text-[length:var(--fs-xs)]" style={{ color: 'rgba(247,245,239,.55)' }}>
            إذا استمرت المشكلة تواصل معنا:{' '}
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: 'var(--brand-cream)' }}
            >
              واتساب
            </a>
            {' · '}
            <a href={`mailto:${email}`} className="underline" style={{ color: 'var(--brand-cream)' }}>
              البريد
            </a>
          </small>
        </div>
      ) : null}
    </div>
  );
}

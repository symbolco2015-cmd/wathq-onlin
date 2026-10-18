import { useState, useRef } from 'react';
import type { ToastKind } from './UI';
import { BTN_PRI, BTN_GH } from './SectionView';
import { formatDate } from '../utils';
import type { RestoreAccountResult } from '../hooks/useAppStore';

// شاشة المهلة: الأدمن جدول حذف الحساب (portfolios.deletion_scheduled_at)، فلا
// تُفتح اللوحة ولا يُكتب شيء حتى «استعادة حسابي». بنمط AuthConfirm.tsx.
// بعد الموعد وقبل الحذف النهائي اليومي لا استعادة (restore_my_account ترفض)،
// فيبقى «تسجيل الخروج» وحده.

interface AccountDeletionScreenProps {
  scheduledAt: string;
  onRestore: () => Promise<RestoreAccountResult>;
  onSignOut: () => Promise<void>;
  onToast: (msg: string, kind: ToastKind) => void;
}

export default function AccountDeletionScreen({ scheduledAt, onRestore, onSignOut, onToast }: AccountDeletionScreenProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  // الموعد قد يحلّ والشاشة مفتوحة، فيؤكده رد الخادم
  const [expired, setExpired] = useState(() => new Date(scheduledAt).getTime() <= Date.now());
  const [signingOut, setSigningOut] = useState(false);
  const runningRef = useRef(false);

  const handleRestore = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatus('loading');
    const result = await onRestore();
    runningRef.current = false;
    if (result === 'ok') {
      onToast('استُعيد حسابك', 'success');
      return;
    }
    if (result === 'expired') {
      setExpired(true);
      setStatus('idle');
      return;
    }
    setStatus('failed');
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await onSignOut();
  };

  const loading = status === 'loading';
  const busy = loading || signingOut;
  const date = formatDate(scheduledAt, 'long');

  return (
    <div dir="rtl" className="min-h-dvh flex items-center justify-center px-4 py-6 bg-[var(--bg)]">
      <div className="bg-[var(--s1)] border border-[var(--bd2)] rounded-[var(--r-lg)] p-6 sm:p-8 w-full max-w-[480px] text-center">
        <div className="text-center mb-3">
          <img src="/brand/logo-primary-ondark.svg" alt="وثّق" className="w-[116px] h-auto mx-auto mb-6" />
          <h1 className="text-center text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">
            {expired ? 'انتهت مهلة استعادة حسابك' : `حسابك مجدول للحذف في ${date}.`}
          </h1>
        </div>

        <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed mb-6">
          {expired
            ? 'سيُحذف حسابك وكل شواهده وملفاته نهائياً خلال يوم.'
            : 'إن استعدته الآن يعود كما كان، بشواهدك وصفحتك العامة.'}
        </p>

        <div className="grid gap-2">
          {!expired && (
            <button
              type="button"
              className={`${BTN_PRI} w-full disabled:opacity-40 disabled:cursor-wait`}
              onClick={handleRestore}
              disabled={busy}
            >
              <i className={`ti ${loading ? 'ti-loader animate-spin motion-reduce:animate-none' : 'ti-arrow-back-up'} text-[20px]`} aria-hidden="true"></i>
              {loading ? 'جاري الاستعادة...' : 'استعادة حسابي'}
            </button>
          )}
          <button
            type="button"
            className={`${BTN_GH} w-full hover:text-[var(--t1)] disabled:opacity-40 disabled:cursor-wait`}
            onClick={handleSignOut}
            disabled={busy}
          >
            <i className="ti ti-logout text-[20px]" aria-hidden="true"></i>
            تسجيل الخروج
          </button>
        </div>

        {status === 'failed' && (
          <div role="alert" className="mt-3 flex items-start justify-center gap-2 text-[length:var(--fs-sm)] text-[var(--danger)] leading-relaxed">
            <i className="ti ti-wifi-off text-[20px] shrink-0" aria-hidden="true"></i>
            <span>تعذّرت الاستعادة. تحقق من اتصالك ثم أعد المحاولة.</span>
          </div>
        )}
      </div>
    </div>
  );
}

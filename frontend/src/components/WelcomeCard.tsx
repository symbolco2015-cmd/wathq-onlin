import type { ReactNode } from 'react';
import { BTN_SM, BTN_GH_SM } from './SectionView';

// بطاقة الترحيب في رئيسية اللوحة — ثلاث خطوات. العرض فقط: الشروط والكتابة في Dashboard.

interface WelcomeCardProps {
  /** الخطوة 1: صورة موجودة أو «متابعة بدون صورة» */
  profileDone: boolean;
  /** الخطوة 2: شاهد واحد على الأقل */
  evidenceDone: boolean;
  /** الخطوة 3: share_enabled */
  shareDone: boolean;
  /** المحفّز الاختياري: وسائل التواصل الخمس كلها فارغة */
  showContactNudge: boolean;
  onOpenSettings: () => void;
  onAddEvidence: () => void;
  onSkipAvatar: () => void;
  onDismiss: () => void;
}

interface StepProps {
  done: boolean;
  title: string;
  line: string;
  action?: ReactNode;
  extra?: ReactNode;
}

function Step({ done, title, line, action, extra }: StepProps) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 w-5 h-5 shrink-0 rounded-[var(--r-full)] flex items-center justify-center ${done ? 'bg-[var(--accent)] text-[var(--bg)]' : 'border border-[var(--bd2)]'}`}
        aria-hidden="true"
      >
        {done && <i className="ti ti-check text-[length:var(--fs-xs)]" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-[length:var(--fs-sm)] font-bold ${done ? 'text-[var(--t3)]' : 'text-[var(--t1)]'}`}>{title}</div>
        <div className={`mt-0.5 text-[length:var(--fs-xs)] ${done ? 'text-[var(--t3)]' : 'text-[var(--t2)]'}`}>{line}</div>
        {extra}
        {!done && action && <div className="mt-2 flex flex-wrap items-center gap-3">{action}</div>}
      </div>
    </div>
  );
}

export default function WelcomeCard({
  profileDone, evidenceDone, shareDone, showContactNudge,
  onOpenSettings, onAddEvidence, onSkipAvatar, onDismiss,
}: WelcomeCardProps) {
  const n = [profileDone, evidenceDone, shareDone].filter(Boolean).length;
  const allDone = n === 3;

  return (
    <section className="mb-4 p-4 rounded-[var(--r-lg)] border border-[var(--bd)] bg-[var(--s1)]">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] leading-normal">
          {allDone ? 'اكتمل ملفك، أحسنت' : 'ابدأ ملف إنجازك في ثلاث خطوات'}
        </h2>
        <button type="button" onClick={onDismiss} className={`${BTN_GH_SM} shrink-0`}>إخفاء</button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="shrink-0 text-[length:var(--fs-xs)] text-[var(--t3)]">{n} من 3</span>
        <span className="flex-1 h-1.5 rounded-[var(--r-full)] bg-[var(--s3)] overflow-hidden">
          <span
            className="block h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-350"
            style={{ width: `${(n / 3) * 100}%` }}
          />
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <Step
          done={profileDone}
          title="أكمل ملفك"
          line="أضف صورتك أو شعاراً يمثلك ليظهر في صفحتك العامة"
          extra={showContactNudge && (
            <div className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--t3)]">
              اختياري: أضف وسيلة تواصل ليصل إليك زوار{' '}
              <button type="button" onClick={onOpenSettings} className="underline cursor-pointer text-[var(--t2)]">صفحتك</button>
            </div>
          )}
          action={<>
            <button type="button" onClick={onOpenSettings} className={BTN_SM}>
              <i className="ti ti-photo text-[16px]" /> إضافة صورة
            </button>
            <button type="button" onClick={onSkipAvatar} className="text-[length:var(--fs-xs)] text-[var(--t3)] underline cursor-pointer">
              متابعة بدون صورة
            </button>
          </>}
        />
        <Step
          done={evidenceDone}
          title="أضف أول شاهد"
          line="وثّق أول عمل في أي بند"
          action={
            <button type="button" onClick={onAddEvidence} className={BTN_SM}>
              <i className="ti ti-plus text-[16px]" /> إضافة شاهد
            </button>
          }
        />
        <Step
          done={shareDone}
          title="شارك صفحتك"
          line="فعّل صفحتك العامة لتشاركها"
          action={
            <button type="button" onClick={onOpenSettings} className={BTN_SM}>
              <i className="ti ti-share text-[16px]" /> تفعيل
            </button>
          }
        />
      </div>
    </section>
  );
}

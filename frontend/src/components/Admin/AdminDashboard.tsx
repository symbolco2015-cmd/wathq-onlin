import React, { useState, useMemo, useEffect } from 'react';
import type { AdminUser, PlatformStats, PortfolioFeatureOverride, PortfolioActionResult, DeletionScheduleResult } from '../../hooks/useAdminStore';
import type { Announcement, AcademicDate } from '../../types';
import { formatDate } from '../../utils';
import { Modal, SelectDropdown } from '../UI';
import type { ToastKind } from '../UI';
import { FIELD, LABEL, HINT, BTN_2ND, toggleBtn } from '../formStyles';
import { BTN_PRI, BTN_GH, BTN_DNG, BTN_DNGF, BTN_GH_SM } from '../SectionView';
import UserCard, { UserAvatar, ActiveStatus, CountBadge, DeletionBadge, UnconfirmedBadge, isUserActive } from './UserCard';

const SEMESTER_BOUNDARY_OPTIONS = [
  { value: 'start', label: 'بداية الفصل' },
  { value: 'end', label: 'نهاية الفصل' },
];
const SEMESTER_NUMBER_OPTIONS = [
  { value: '1', label: 'الفصل الأول' },
  { value: '2', label: 'الفصل الثاني' },
  { value: '3', label: 'الفصل الثالث' },
];

// مفتاح الميزة التجريبية الوحيدة المُدارة حالياً من تبويب "الميزات التجريبية".
// أضف مفاتيح أخرى هنا مستقبلاً إذا احتاجت المنصة ميزات تجريبية إضافية بنفس النمط.
const IMAGE_SUGGESTION_FEATURE_KEY = 'image_suggestion';

// أنماط لوحة الإدارة — DESIGN.md: البطاقة --s1، والعناصر الداخلية --s2، والأيقونة محايدة
const CARD = 'bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)]';
const CARD_TITLE = 'flex items-center gap-2 text-[length:var(--fs-md)] font-bold text-[var(--t1)]';
const ICON_BOX = 'w-11 h-11 shrink-0 rounded-[var(--r-sm)] bg-[var(--s2)] border border-[var(--bd)] flex items-center justify-center text-[var(--t2)] text-[length:var(--fs-lg)]';
const ICON_BTN = 'w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--bd2)] bg-transparent text-[var(--t2)] text-[length:var(--fs-md)] cursor-pointer transition-colors duration-150 hover:bg-[var(--s2)] hover:text-[var(--t1)]';
const BTN_OUTLINE = `${BTN_2ND} border-[var(--bd2)] text-[var(--t2)] cursor-pointer hover:bg-[var(--s2)] hover:text-[var(--t1)]`;
const EMPTY = 'flex flex-col items-center gap-2 py-12 px-4 text-center text-[length:var(--fs-sm)] text-[var(--t3)]';
const ICON_BTN_DNG = 'w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--danger)]/35 bg-transparent text-[var(--danger)] text-[length:var(--fs-md)] cursor-pointer transition-colors duration-150 hover:bg-[var(--s2)]';
// مثل FIELD لكن بلا ارتفاع ثابت
const TEXTAREA = 'w-full min-h-[140px] px-3 py-3 bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-sm)] text-[length:var(--fs-md)] sm:text-[length:var(--fs-sm)] leading-relaxed text-[var(--t1)] placeholder:text-[var(--t3)] outline-none resize-y transition-colors duration-150 focus:border-[var(--accent)]';
const CHIP = 'inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] border border-[var(--bd)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold text-[var(--t2)] whitespace-nowrap';
// صفوف قوائم التعاميم والمواعيد والاستثناءات — الصف قيد التعديل بحد أوضح لا بالأخضر
const ROW = 'flex items-start gap-3 p-3 sm:p-4 rounded-[var(--r-sm)] border bg-[var(--s2)]';
const ROW_IDLE = 'border-[var(--bd)]';
const ROW_EDITING = 'border-[var(--bd2)]';
const ROW_TITLE = 'text-[length:var(--fs-sm)] font-bold text-[var(--t1)] truncate';
const FORM_BTN_PRI = `${BTN_PRI} transition-opacity duration-150 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed`;
const FORM_BTN_CANCEL = `${BTN_OUTLINE} disabled:opacity-40 disabled:cursor-not-allowed`;

// تصنيف التعميم: لون النقطة يطابق NotificationsSheet عند المعلم
const ANN_CATEGORY_OPTIONS = [
  { value: 'admin', label: 'تعميم إداري' },
  { value: 'tech', label: 'تحديث برمجي' },
  { value: 'urgent', label: 'تنبيه عاجل' },
];
const ANN_CATEGORY_BADGE: Record<Announcement['category'], { label: string; dot: string }> = {
  admin: { label: 'تعميم إداري', dot: 'bg-[var(--info)]' },
  tech: { label: 'تحديث', dot: 'bg-[var(--t2)]' },
  urgent: { label: 'تنبيه عاجل', dot: 'bg-[var(--danger)]' },
};

function DotLabel({ dot, label, strong = false }: { dot: string; label: string; strong?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-[length:var(--fs-xs)] font-bold ${strong ? 'text-[var(--t1)]' : 'text-[var(--t2)]'}`}>
      <span className={`w-2 h-2 shrink-0 rounded-[var(--r-full)] ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

const tabBtn = (active: boolean) =>
  `shrink-0 h-11 px-4 inline-flex items-center gap-2 rounded-[var(--r-sm)] border text-[length:var(--fs-sm)] font-bold whitespace-nowrap cursor-pointer transition-colors duration-150 ${active
    ? 'bg-[var(--s2)] border-[var(--bd2)] text-[var(--t1)]'
    : 'bg-transparent border-transparent text-[var(--t3)] hover:text-[var(--t2)]'}`;

/* ─────────────────────────────────────────────
   Stat Card
───────────────────────────────────────────── */
function StatCard({ icon, label, value, sub }: {
  icon: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className={`${CARD} flex items-center gap-4 p-4`}>
      <div className={ICON_BOX}>
        <i className={`ti ${icon}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[length:var(--fs-xl)] font-bold text-[var(--t1)] leading-none">{value}</div>
        <div className="text-[length:var(--fs-xs)] font-bold text-[var(--t2)] mt-2">{label}</div>
        {sub && <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1">{sub}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mini Bar Chart — أعمدة --t2 بلا تدرّج ولا ظل
───────────────────────────────────────────── */
function MiniBarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-28">
      {data.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, d.count > 0 ? 8 : 3);
        const label = formatDate(d.date, 'weekday');
        return (
          <div key={i} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end" title={`${label}: ${d.count} مستخدم`}>
            <div className="w-full flex-1 flex items-end">
              <div className="w-full bg-[var(--t2)] rounded-t-[var(--r-sm)] transition-[height] duration-[350ms]" style={{ height: `${pct}%` }} />
            </div>
            <span className="mt-1 max-w-full truncate text-[length:var(--fs-xs)] text-[var(--t3)]">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Distribution — شريط --t2 على مسار --s3
───────────────────────────────────────────── */
function DistributionList({ data, title, limit = 5 }: {
  data: Record<string, number>; title: string; limit?: number;
}) {
  const sorted = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  return (
    <div className={`${CARD} p-4`}>
      <div className={`${CARD_TITLE} mb-4`}>{title}</div>
      <div className="flex flex-col gap-3">
        {sorted.map(([key, count], i) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-1.5 bg-[var(--s3)] rounded-[var(--r-full)] overflow-hidden">
                <div className="h-full bg-[var(--t2)] rounded-[var(--r-full)] transition-[width] duration-[350ms]" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="min-w-0 truncate text-[length:var(--fs-xs)] font-bold text-[var(--t2)]" title={key}>{key}</span>
                <span className="shrink-0 text-[length:var(--fs-xs)] text-[var(--t3)]">{count} ({pct}%)</span>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="p-4 text-center text-[length:var(--fs-sm)] text-[var(--t3)]">لا توجد بيانات</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Feature Override Row — استثناء فردي لمعلم واحد لميزة تجريبية محددة
───────────────────────────────────────────── */
function FeatureOverrideRow({ user, override, onSetOverride, onRemoveOverride }: {
  user: AdminUser;
  override: PortfolioFeatureOverride | undefined;
  onSetOverride: (enabled: boolean) => Promise<boolean>;
  onRemoveOverride: () => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);
  const mode: 'enabled' | 'disabled' | 'default' = override ? (override.enabled ? 'enabled' : 'disabled') : 'default';

  const applyMode = async (next: 'enabled' | 'disabled' | 'default') => {
    if (next === mode) return;
    setSaving(true);
    try {
      if (next === 'default') await onRemoveOverride();
      else await onSetOverride(next === 'enabled');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${ROW} ${ROW_IDLE} flex-col lg:flex-row lg:items-center transition-opacity duration-150 ${saving ? 'opacity-60' : ''}`}>
      <div className="w-full lg:w-auto lg:flex-1 min-w-0">
        <h4 className={ROW_TITLE}>{user.name}</h4>
        <p className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1 truncate text-right" dir="ltr">{user.email || '—'}</p>
      </div>
      <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-2">
        <button type="button" disabled={saving} className={`${toggleBtn(mode === 'enabled')} px-3 disabled:cursor-wait`} onClick={() => applyMode('enabled')}>استثناء فردي: تفعيل</button>
        <button type="button" disabled={saving} className={`${toggleBtn(mode === 'disabled')} px-3 disabled:cursor-wait`} onClick={() => applyMode('disabled')}>استثناء فردي: تعطيل</button>
        <button type="button" disabled={saving} className={`${toggleBtn(mode === 'default')} px-3 disabled:cursor-wait`} onClick={() => applyMode('default')}>بدون استثناء (اتبع الإعداد العام)</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   User Row
───────────────────────────────────────────── */
const TD = 'px-3 py-3 align-middle';
const TH = 'px-3 py-3 text-right text-[length:var(--fs-xs)] font-bold text-[var(--t2)] whitespace-nowrap';
const TH_SORT = `${TH} cursor-pointer select-none hover:text-[var(--t1)]`;

function UserRow({ user, onView, onCancelDeletion }: {
  user: AdminUser; onView: (u: AdminUser) => void; onCancelDeletion: (u: AdminUser) => Promise<void>;
}) {
  const [cancelling, setCancelling] = useState(false);
  const lastActive = user.updated_at
    ? formatDate(user.updated_at, 'long')
    : '—';

  return (
    <tr className="border-b border-[var(--bd)] last:border-b-0 transition-colors duration-150 hover:bg-[var(--s2)]">
      <td className={`${TD} w-14`}>
        <UserAvatar user={user} />
      </td>
      <td className={TD}>
        <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{user.name}</div>
        <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1 text-right" dir="ltr">{user.email || '—'}</div>
        {(user.emailUnconfirmed || user.deletionScheduledAt) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {user.emailUnconfirmed && <UnconfirmedBadge />}
            {user.deletionScheduledAt && <DeletionBadge at={user.deletionScheduledAt} />}
          </div>
        )}
      </td>
      <td className={TD}>
        <span className="inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] border border-[var(--bd)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold text-[var(--t2)] whitespace-nowrap">{user.role}</span>
      </td>
      <td className={TD}>
        <span className="block max-w-[140px] truncate text-[length:var(--fs-xs)] text-[var(--t3)]" title={user.school}>{user.school}</span>
      </td>
      <td className={TD}>
        <CountBadge icon="ti-files" count={user.evidenceCount} />
      </td>
      <td className={TD}>
        <CountBadge icon="ti-bulb" count={user.strategiesCount} />
      </td>
      <td className={TD}>
        <ActiveStatus active={isUserActive(user)} />
      </td>
      <td className={`${TD} text-[length:var(--fs-xs)] text-[var(--t3)] whitespace-nowrap`}>{lastActive}</td>
      <td className={TD}>
        <div className="flex items-center gap-2">
          {user.deletionScheduledAt && (
            <button
              type="button"
              className={`${BTN_GH_SM} border-[var(--bd2)] hover:text-[var(--t1)] disabled:cursor-not-allowed`}
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                try { await onCancelDeletion(user); } finally { setCancelling(false); }
              }}
            >
              إلغاء الحذف
            </button>
          )}
          <button className={ICON_BTN} onClick={() => onView(user)} title="عرض التفاصيل" aria-label="عرض التفاصيل">
            <i className="ti ti-eye" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────
   User Detail Modal
───────────────────────────────────────────── */
/** مهلة الحذف: تطابق interval '10 days' في admin_schedule_deletion. للعرض فقط قبل الجدولة */
const DELETION_GRACE_DAYS = 10;

function UserDetailModal({ user, onClose, onDeleteNow, onReset, onScheduleDeletion, onCancelDeletion, onToast, shareUrl }: {
  user: AdminUser;
  onClose: () => void;
  onDeleteNow: (id: string, confirmEmail: string) => Promise<PortfolioActionResult>;
  onReset: (id: string, confirmName: string) => Promise<PortfolioActionResult>;
  onScheduleDeletion: (id: string) => Promise<DeletionScheduleResult>;
  onCancelDeletion: (id: string) => Promise<DeletionScheduleResult>;
  onToast: (msg: string, kind: ToastKind) => void;
  shareUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  // لوحة التأكيد المفتوحة: إعادة التعيين (بالاسم)، أو جدولة الحذف، أو الحذف الفوري (بالبريد)
  const [pending, setPending] = useState<'reset' | 'schedule' | 'deleteNow' | null>(null);
  const deleteConfirmOpen = pending === 'schedule' || pending === 'deleteNow';
  const [typedName, setTypedName] = useState('');
  const [running, setRunning] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const nameMatches = typedName.trim() !== '' && typedName.trim() === user.name.trim();
  const emailMatches = typedName.trim() !== '' && !!user.email
    && typedName.trim().toLowerCase() === user.email.trim().toLowerCase();
  // التاريخ في نافذة التأكيد قبل الجدولة؛ الموعد الحقيقي من القاعدة بعدها
  const plannedDeletionDate = useMemo(
    () => formatDate(new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000), 'long'),
    [pending]
  );

  const openConfirm = (mode: 'reset' | 'schedule' | 'deleteNow') => {
    setPending(mode);
    setTypedName('');
    setInlineError('');
  };

  const cancelConfirm = () => {
    setPending(null);
    setInlineError('');
  };

  // Esc يغلق لوحة التأكيد إن كانت مفتوحة، وإلا يغلق النافذة — ولا شيء أثناء التنفيذ
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || running) return;
      if (pending) cancelConfirm();
      else onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pending, running, onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      onToast('تم نسخ الرابط بنجاح', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDeleteNow = async () => {
    if (!emailMatches) return;
    setInlineError('');
    setRunning(true);
    try {
      const res = await onDeleteNow(user.id, typedName.trim());
      if (res.ok) {
        onToast('حُذف الحساب وكل ملفاته نهائياً', 'success');
        onClose();
      } else {
        setInlineError('message' in res ? res.message : 'تعذّر تنفيذ العملية، حاول مجدداً');
      }
    } catch (e: unknown) {
      console.error('Immediate delete error:', e);
      setInlineError('تعذّر تنفيذ العملية، حاول مجدداً');
    } finally {
      setRunning(false);
    }
  };

  const handleSchedule = async () => {
    setInlineError('');
    setRunning(true);
    try {
      const res = await onScheduleDeletion(user.id);
      if (res.ok) {
        const date = res.scheduledAt ? formatDate(res.scheduledAt, 'long') : plannedDeletionDate;
        onToast(`جُدول حذف الحساب في ${date}`, 'success');
        setPending(null);
      } else {
        setInlineError('message' in res ? res.message : 'تعذّر تنفيذ العملية، حاول مجدداً');
      }
    } finally {
      setRunning(false);
    }
  };

  const handleCancelDeletion = async () => {
    setInlineError('');
    setRunning(true);
    try {
      const res = await onCancelDeletion(user.id);
      if (res.ok) onToast('أُلغي حذف الحساب', 'success');
      else setInlineError('message' in res ? res.message : 'تعذّر تنفيذ العملية، حاول مجدداً');
    } finally {
      setRunning(false);
    }
  };

  const handleReset = async () => {
    if (!nameMatches) return;
    setInlineError('');
    setRunning(true);
    try {
      const res = await onReset(user.id, typedName.trim());
      if (res.ok) {
        if (res.storageErrors > 0) onToast('تم، لكن تعذّر حذف بعض الملفات. أعد المحاولة لاحقاً', 'error');
        else onToast('تم إعادة تعيين بيانات المستخدم', 'success');
        onClose();
      } else {
        setInlineError('message' in res ? res.message : 'تعذّر تنفيذ العملية، حاول مجدداً');
      }
    } catch (e: unknown) {
      console.error('Reset portfolio error:', e);
      setInlineError('تعذّر تنفيذ العملية، حاول مجدداً');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] bg-black/60 flex items-center justify-center p-4"
      style={{ animation: 'fadeIn .25s both' }}
      onClick={e => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="umodal-title"
        className="w-full max-w-[520px] max-h-[90dvh] overflow-y-auto bg-[var(--s1)] border border-[var(--bd2)] rounded-[var(--r-lg)]"
        style={{ animation: 'scaleIn .35s var(--sp) both' }}
      >
        {/* Header */}
        <div className="relative flex items-center gap-4 p-6 pl-16 border-b border-[var(--bd)]">
          <UserAvatar user={user} size="lg" />
          <div className="min-w-0">
            <div id="umodal-title" className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">{user.name}</div>
            <div className="text-[length:var(--fs-sm)] text-[var(--t2)] mt-1">{user.role} — {user.school}</div>
            <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1 text-right break-all" dir="ltr">{user.email}</div>
            {user.emailUnconfirmed && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <UnconfirmedBadge />
                <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">يُحذف تلقائياً بعد 7 أيام من تسجيله إن لم يؤكّد بريده.</span>
              </div>
            )}
          </div>
          <button className={`${ICON_BTN} absolute left-3 top-3`} onClick={onClose} aria-label="إغلاق"><i className="ti ti-x" /></button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 border-b border-[var(--bd)]">
          {[
            { icon: 'ti-files', value: user.evidenceCount, label: 'أدلة' },
            { icon: 'ti-bulb', value: user.strategiesCount, label: 'استراتيجية' },
            { icon: 'ti-calendar', value: user.yearsOfExperience, label: 'سنوات خبرة' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center gap-1 py-4 px-2 text-center border-l border-[var(--bd)]">
              <i className={`ti ${s.icon} text-[length:var(--fs-lg)] text-[var(--t2)]`} />
              <span className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] leading-none">{s.value}</span>
              <small className="text-[length:var(--fs-xs)] text-[var(--t3)]">{s.label}</small>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1 py-4 px-2 text-center">
            <i className="ti ti-id text-[length:var(--fs-lg)] text-[var(--t2)]" />
            <span className="text-[length:var(--fs-xs)] font-bold text-[var(--t1)] leading-5" dir="ltr" title={user.id}>{user.id.slice(0, 8)}…</span>
            <small className="text-[length:var(--fs-xs)] text-[var(--t3)]">المعرّف</small>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b border-[var(--bd)]">
          <div className="flex flex-col gap-1">
            <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">تاريخ الانضمام</span>
            <span className="text-[length:var(--fs-sm)] font-bold text-[var(--t2)]">{formatDate(user.created_at, 'long')}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">آخر تحديث</span>
            <span className="text-[length:var(--fs-sm)] font-bold text-[var(--t2)]">{user.updated_at ? formatDate(user.updated_at, 'long') : '—'}</span>
          </div>
        </div>

        {/* Inline Error Banner */}
        {inlineError && (
          <div role="alert" className="mx-6 mt-4 flex items-start gap-2 p-3 rounded-[var(--r-sm)] border border-[var(--danger)]/35 bg-[var(--danger)]/10 text-[length:var(--fs-sm)] text-[var(--danger)] leading-relaxed">
            <i className="ti ti-alert-circle text-[length:var(--fs-md)] shrink-0 mt-0.5" />
            {inlineError}
          </div>
        )}

        {/* مجدول للحذف: الموعد وإلغاء الحذف */}
        {user.deletionScheduledAt && (
          <div className="mx-6 mt-4 p-4 flex items-center justify-between gap-3 flex-wrap rounded-[var(--r-md)] border border-[var(--danger)]/35">
            <div className="flex flex-col gap-1 min-w-0">
              <DeletionBadge at={user.deletionScheduledAt} />
              <span className="text-[length:var(--fs-xs)] text-[var(--t3)] leading-relaxed">
                يستطيع المعلم استعادة حسابه قبل {formatDate(user.deletionScheduledAt, 'long')} بتسجيل الدخول.
              </span>
            </div>
            <button
              type="button"
              className={`${BTN_GH_SM} border-[var(--bd2)] hover:text-[var(--t1)] disabled:cursor-not-allowed`}
              onClick={handleCancelDeletion}
              disabled={running}
            >
              <i className={`ti ${running ? 'ti-loader animate-spin motion-reduce:animate-none' : 'ti-arrow-back-up'}`} /> إلغاء الحذف
            </button>
          </div>
        )}

        {/* لوحة تأكيد جدولة الحذف: قابلة للإلغاء، فلا كتابة */}
        {pending === 'schedule' && (
          <div className="mx-6 mt-4 p-4 flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--danger)]/35">
            <div className="flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--danger)]">
              <i className="ti ti-trash text-[length:var(--fs-md)]" />
              حذف الحساب
            </div>
            <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
              سيُحذف حساب <strong className="font-bold text-[var(--t1)]">{user.name}</strong> وكل شواهده وملفاته نهائياً في{' '}
              <strong className="font-bold text-[var(--t1)]">{plannedDeletionDate}</strong>. يستطيع المعلم استعادة حسابه قبل ذلك بتسجيل الدخول.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                className={`${BTN_DNGF} min-w-[180px] disabled:opacity-40 disabled:cursor-not-allowed`}
                onClick={handleSchedule}
                disabled={running}
              >
                <i className={`ti ${running ? 'ti-loader animate-spin motion-reduce:animate-none' : 'ti-calendar-x'}`} />
                {running ? 'جاري الجدولة...' : 'جدولة الحذف'}
              </button>
              <button
                className={`${BTN_GH} hover:text-[var(--t1)] disabled:opacity-40 disabled:cursor-not-allowed`}
                onClick={cancelConfirm}
                disabled={running}
              >
                <i className="ti ti-x" /> إلغاء
              </button>
            </div>
          </div>
        )}

        {/* لوحة تأكيد بالكتابة: إعادة التعيين بالاسم، والحذف الفوري بالبريد كاملاً */}
        {(pending === 'reset' || pending === 'deleteNow') && (() => {
          const isDelete = pending === 'deleteNow';
          const matches = isDelete ? emailMatches : nameMatches;
          return (
            <div className="mx-6 mt-4 p-4 flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--danger)]/35">
              <div className="flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--danger)]">
                <i className={`ti ${isDelete ? 'ti-trash' : 'ti-refresh'} text-[length:var(--fs-md)]`} />
                {isDelete ? 'حذف فوري بلا مهلة' : 'إعادة تعيين الملف'}
              </div>

              <div className="text-[length:var(--fs-xs)] text-[var(--t2)] leading-relaxed">
                <div>
                  <strong className="font-bold text-[var(--t1)]">سيُحذف: </strong>
                  {isDelete
                    ? 'الحساب وحساب الدخول الآن، ومعه الأدلة وملفاتها، وعدّاد الشهر، وتحليل النتائج، وتقارير الحصاد، والملخصات، والصورة الشخصية. لا استعادة بعده. لحسابات التجربة فقط.'
                    : 'الأدلة وملفاتها، وعدّاد الشهر، وتحليل النتائج، وتقارير الحصاد، والملخصات.'}
                </div>
                {!isDelete && (
                  <div>
                    <strong className="font-bold text-[var(--t1)]">سيبقى: </strong>
                    الحساب، والملف الشخصي، والصورة.
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-2 text-[length:var(--fs-sm)] text-[var(--t2)]">
                <span>
                  {isDelete ? 'اكتب بريد المعلم كاملاً للتأكيد: ' : 'اكتب اسم المعلم للتأكيد: '}
                  <strong className="font-bold text-[var(--t1)] break-all" dir={isDelete ? 'ltr' : undefined}>
                    {isDelete ? user.email : user.name}
                  </strong>
                </span>
                <input
                  type={isDelete ? 'email' : 'text'}
                  dir={isDelete ? 'ltr' : undefined}
                  value={typedName}
                  onChange={e => setTypedName(e.target.value)}
                  disabled={running}
                  autoComplete="off"
                  className={FIELD}
                />
              </label>

              <div className="flex gap-2 flex-wrap">
                <button
                  className={`${BTN_DNGF} min-w-[180px] disabled:cursor-not-allowed ${!matches && !running ? 'opacity-40' : ''}`}
                  onClick={isDelete ? handleDeleteNow : handleReset}
                  disabled={!matches || running}
                >
                  <i className={`ti ${running ? 'ti-loader animate-spin' : 'ti-alert-triangle'}`} />
                  {running
                    ? (isDelete ? 'جاري الحذف...' : 'جاري إعادة التعيين...')
                    : (isDelete ? 'تأكيد الحذف الفوري' : 'تأكيد إعادة التعيين')}
                </button>
                <button
                  className={`${BTN_GH} hover:text-[var(--t1)] disabled:opacity-40 disabled:cursor-not-allowed`}
                  onClick={cancelConfirm}
                  disabled={running}
                >
                  <i className="ti ti-x" /> إلغاء
                </button>
              </div>
            </div>
          );
        })()}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap p-6 pb-3">
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BTN_PRI} min-w-[140px] no-underline transition-opacity duration-150 hover:opacity-90`}
          >
            <i className="ti ti-external-link" /> عرض ملف الإنجاز
          </a>
          <button className={`${BTN_GH} min-w-[140px] hover:text-[var(--t1)]`} onClick={handleCopy}>
            <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} />
            {copied ? 'تم النسخ!' : 'نسخ الرابط'}
          </button>

          {/* Reset Button — يفتح لوحة التأكيد فقط */}
          <button
            className={`${BTN_DNG} min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed ${pending === 'reset' ? 'bg-[var(--danger)]/10' : 'bg-transparent'}`}
            onClick={() => openConfirm('reset')}
            disabled={running}
          >
            <i className="ti ti-refresh" /> إعادة تعيين
          </button>

          {/* حذف الحساب بمهلة — يفتح لوحة التأكيد فقط. المجدول يُلغى من شارته أعلاه،
              ويختفي ما دامت لوحة تأكيد حذف مفتوحة، فلا يُظن الضغط عليه معطّلاً */}
          {!user.deletionScheduledAt && !deleteConfirmOpen && (
            <button
              className={`${BTN_DNG} min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed bg-transparent`}
              onClick={() => openConfirm('schedule')}
              disabled={running}
            >
              <i className="ti ti-trash" /> حذف الحساب
            </button>
          )}
        </div>

        {/* الحذف الفوري: رابط صغير لا زر بارز، لحسابات التجربة */}
        {deleteConfirmOpen ? (
          <div className="pb-3" />
        ) : (
          <div className="px-6 pb-6">
            <button
              type="button"
              className="h-9 inline-flex items-center gap-1 bg-transparent border-0 p-0 text-[length:var(--fs-xs)] text-[var(--t3)] underline cursor-pointer hover:text-[var(--danger)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => openConfirm('deleteNow')}
              disabled={running}
            >
              حذف فوري بلا مهلة (لحسابات التجربة)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main AdminDashboard
───────────────────────────────────────────── */
interface AdminDashboardProps {
  users: AdminUser[];
  stats: PlatformStats | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onDeleteUserNow: (id: string, confirmEmail: string) => Promise<PortfolioActionResult>;
  onResetUser: (id: string, confirmName: string) => Promise<PortfolioActionResult>;
  onScheduleDeletion: (id: string) => Promise<DeletionScheduleResult>;
  onCancelDeletion: (id: string) => Promise<DeletionScheduleResult>;
  onExportCSV: (users: AdminUser[]) => void;
  onToast: (msg: string, kind: ToastKind) => void;
  getShareUrl: (id: string) => string;
  onPublishAnnouncement?: (title: string, content: string, category: 'tech' | 'admin' | 'urgent', attachmentUrl?: string) => Promise<boolean>;
  onUpdateAnnouncement?: (id: string, title: string, content: string, category: 'tech' | 'admin' | 'urgent', attachmentUrl?: string) => Promise<boolean>;
  onDeleteAnnouncement?: (id: string) => Promise<boolean>;
  announcements?: Announcement[];
  onPublishAcademicDate?: (title: string, date: string, hijriLabel?: string, semesterBoundary?: 'start' | 'end' | null, semesterNumber?: 1 | 2 | 3 | null) => Promise<boolean>;
  onUpdateAcademicDate?: (id: string, title: string, date: string, hijriLabel?: string, semesterBoundary?: 'start' | 'end' | null, semesterNumber?: 1 | 2 | 3 | null) => Promise<boolean>;
  onDeleteAcademicDate?: (id: string) => Promise<boolean>;
  academicDates?: AcademicDate[];
  featureFlags?: Record<string, boolean>;
  featureOverrides?: PortfolioFeatureOverride[];
  onSetGlobalFeatureFlag?: (featureKey: string, enabled: boolean) => Promise<boolean>;
  onSetPortfolioFeatureOverride?: (portfolioId: string, featureKey: string, enabled: boolean) => Promise<boolean>;
  onRemovePortfolioFeatureOverride?: (portfolioId: string, featureKey: string) => Promise<boolean>;
}

export default function AdminDashboard({
  users, stats, loading, error, onReload, onDeleteUserNow, onResetUser, onScheduleDeletion, onCancelDeletion, onExportCSV, onToast, getShareUrl, onPublishAnnouncement, onUpdateAnnouncement, onDeleteAnnouncement, announcements, onPublishAcademicDate, onUpdateAcademicDate, onDeleteAcademicDate, academicDates,
  featureFlags, featureOverrides, onSetGlobalFeatureFlag, onSetPortfolioFeatureOverride, onRemovePortfolioFeatureOverride,
}: AdminDashboardProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'evidenceCount' | 'updated_at' | 'created_at'>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  // النافذة تعرض النسخة المحدَّثة بعد إعادة التحميل (الجدولة والإلغاء يغيّران الموعد)
  const liveSelectedUser = selectedUser ? (users.find(u => u.id === selectedUser.id) ?? selectedUser) : null;

  // «إلغاء الحذف» من القائمة مباشرة
  const handleCancelDeletion = async (u: AdminUser) => {
    const res = await onCancelDeletion(u.id);
    if ('message' in res) onToast(res.message, 'error');
    else onToast('أُلغي حذف الحساب', 'success');
  };
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'announcements' | 'academic-dates' | 'features'>('users');
  const [featureSearch, setFeatureSearch] = useState('');
  const [savingGlobalFlag, setSavingGlobalFlag] = useState(false);

  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annCategory, setAnnCategory] = useState<'tech' | 'admin' | 'urgent'>('admin');
  const [annAttachmentUrl, setAnnAttachmentUrl] = useState('');
  const [publishingAnn, setPublishingAnn] = useState(false);
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);

  // Only real (DB) announcements are manageable — exclude the demo/placeholder ones
  const manageableAnnouncements = (announcements || []).filter(a => !String(a.id).startsWith('mock-'));
  const hasMockOnly = (announcements?.length || 0) > 0 && manageableAnnouncements.length === 0;

  const resetAnnForm = () => {
    setAnnTitle('');
    setAnnContent('');
    setAnnCategory('admin');
    setAnnAttachmentUrl('');
    setEditingAnnId(null);
  };

  const startEditAnnouncement = (ann: Announcement) => {
    setEditingAnnId(ann.id);
    setAnnTitle(ann.title);
    setAnnContent(ann.content);
    setAnnCategory(ann.category);
    setAnnAttachmentUrl(ann.attachment_url || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // تأكيد حذف تعميم أو موعد عبر نافذة Modal
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'announcement' | 'date'; id: string } | null>(null);

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      if (onDeleteAnnouncement) {
        const ok = await onDeleteAnnouncement(id);
        if (ok) {
          onToast('تم حذف التعميم بنجاح', 'success');
        } else {
          onToast('فشل حذف التعميم. تأكد من صلاحيات الأدمن', 'error');
        }
      } else {
        onToast('ميزة الحذف غير متوفرة في وضع التشغيل المحلي', 'info');
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ أثناء محاولة الحذف', 'error');
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) {
      onToast('يرجى ملء جميع الحقول المطلوبة', 'error');
      return;
    }
    
    setPublishingAnn(true);
    try {
      if (editingAnnId) {
        // ── Edit mode ──
        if (onUpdateAnnouncement) {
          const ok = await onUpdateAnnouncement(editingAnnId, annTitle.trim(), annContent.trim(), annCategory, annAttachmentUrl.trim());
          if (ok) {
            onToast('تم تحديث التعميم بنجاح', 'success');
            resetAnnForm();
          } else {
            onToast('فشل تحديث التعميم. تأكد من صلاحيات الأدمن', 'error');
          }
        } else {
          onToast('ميزة التعديل غير متوفرة في وضع التشغيل المحلي', 'info');
        }
      } else {
        // ── Create mode ──
        if (onPublishAnnouncement) {
          const ok = await onPublishAnnouncement(annTitle.trim(), annContent.trim(), annCategory, annAttachmentUrl.trim());
          if (ok) {
            onToast('تم نشر التعميم بنجاح لجميع المستخدمين', 'success');
            resetAnnForm();
          } else {
            onToast('فشل نشر التعميم. تأكد من اتصالك وصلاحيات الأدمن', 'error');
          }
        } else {
          onToast('ميزة النشر غير متوفرة في وضع التشغيل المحلي', 'info');
        }
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ غير متوقع', 'error');
    } finally {
      setPublishingAnn(false);
    }
  };

  const [adTitle, setAdTitle] = useState('');
  const [adDate, setAdDate] = useState('');
  const [adHijriLabel, setAdHijriLabel] = useState('');
  // حقلا "طرف الفصل" و"رقم الفصل" — اختياريان بالكامل، يُستخدمان فقط لبناء
  // قائمة "الفصول المتاحة" في تقرير الحصاد الفصلي (Dashboard.tsx)، لا أثر لهما
  // على عرض المواعيد الدراسية العادي في لوحة المعلم.
  const [adSemesterBoundary, setAdSemesterBoundary] = useState('');
  const [adSemesterNumber, setAdSemesterNumber] = useState('');
  const [publishingAd, setPublishingAd] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);

  const sortedAcademicDates = useMemo(
    () => [...(academicDates || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [academicDates]
  );

  const imageSuggestionOverrides = useMemo(
    () => (featureOverrides || []).filter(o => o.feature === IMAGE_SUGGESTION_FEATURE_KEY),
    [featureOverrides]
  );

  const matchedFeatureUsers = useMemo(() => {
    const q = featureSearch.trim().toLowerCase();
    if (!q) return [];
    return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0, 8);
  }, [users, featureSearch]);

  const handleToggleGlobalFlag = async (enabled: boolean) => {
    if (!onSetGlobalFeatureFlag) return;
    setSavingGlobalFlag(true);
    try {
      const ok = await onSetGlobalFeatureFlag(IMAGE_SUGGESTION_FEATURE_KEY, enabled);
      onToast(ok ? 'تم تحديث إعداد الميزة بنجاح' : 'فشل تحديث إعداد الميزة', ok ? 'success' : 'error');
    } finally {
      setSavingGlobalFlag(false);
    }
  };

  const resetAdForm = () => {
    setAdTitle('');
    setAdDate('');
    setAdHijriLabel('');
    setAdSemesterBoundary('');
    setAdSemesterNumber('');
    setEditingAdId(null);
  };

  const startEditAcademicDate = (ad: AcademicDate) => {
    setEditingAdId(ad.id);
    setAdTitle(ad.title);
    setAdDate(ad.date);
    setAdHijriLabel(ad.hijri_label || '');
    setAdSemesterBoundary(ad.semester_boundary || '');
    setAdSemesterNumber(ad.semester_number ? String(ad.semester_number) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAcademicDate = async (id: string) => {
    try {
      if (onDeleteAcademicDate) {
        const ok = await onDeleteAcademicDate(id);
        if (ok) {
          onToast('تم حذف الموعد بنجاح', 'success');
        } else {
          onToast('فشل حذف الموعد. تأكد من صلاحيات الأدمن', 'error');
        }
      } else {
        onToast('ميزة الحذف غير متوفرة في وضع التشغيل المحلي', 'info');
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ أثناء محاولة الحذف', 'error');
    }
  };

  const handlePublishAcademicDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adTitle.trim() || !adDate.trim()) {
      onToast('يرجى ملء عنوان الموعد وتاريخه الميلادي', 'error');
      return;
    }

    setPublishingAd(true);
    try {
      const semesterBoundary = adSemesterBoundary ? (adSemesterBoundary as 'start' | 'end') : null;
      const semesterNumber = adSemesterNumber ? (Number(adSemesterNumber) as 1 | 2 | 3) : null;
      if (editingAdId) {
        if (onUpdateAcademicDate) {
          const ok = await onUpdateAcademicDate(editingAdId, adTitle.trim(), adDate, adHijriLabel.trim(), semesterBoundary, semesterNumber);
          if (ok) {
            onToast('تم تحديث الموعد بنجاح', 'success');
            resetAdForm();
          } else {
            onToast('فشل تحديث الموعد. تأكد من صلاحيات الأدمن', 'error');
          }
        } else {
          onToast('ميزة التعديل غير متوفرة في وضع التشغيل المحلي', 'info');
        }
      } else {
        if (onPublishAcademicDate) {
          const ok = await onPublishAcademicDate(adTitle.trim(), adDate, adHijriLabel.trim(), semesterBoundary, semesterNumber);
          if (ok) {
            onToast('تمت إضافة الموعد الدراسي بنجاح', 'success');
            resetAdForm();
          } else {
            onToast('فشلت إضافة الموعد. تأكد من اتصالك وصلاحيات الأدمن', 'error');
          }
        } else {
          onToast('ميزة الإضافة غير متوفرة في وضع التشغيل المحلي', 'info');
        }
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ غير متوقع', 'error');
    } finally {
      setPublishingAd(false);
    }
  };

  const filteredUsers = useMemo(() => {
    let list = [...users];

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.school.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    }

    // Filter
    if (filterActive !== 'all') {
      const now = Date.now();
      const threshold = 30 * 24 * 60 * 60 * 1000;
      list = list.filter(u => {
        const isActive = u.updated_at
          ? (now - new Date(u.updated_at).getTime()) < threshold
          : false;
        return filterActive === 'active' ? isActive : !isActive;
      });
    }

    // Sort
    list.sort((a, b) => {
      let va: any = a[sortBy];
      let vb: any = b[sortBy];
      if (typeof va === 'string' && typeof vb === 'string') {
        if (sortBy === 'updated_at' || sortBy === 'created_at') {
          va = va ? new Date(va).getTime() : 0;
          vb = vb ? new Date(vb).getTime() : 0;
        } else {
          va = va.toLowerCase();
          vb = vb.toLowerCase();
        }
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [users, search, sortBy, sortDir, filterActive]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return <i className="ti ti-selector ms-1 text-[var(--t3)]" />;
    return <i className={`ti ${sortDir === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down'} ms-1 text-[var(--t1)]`} />;
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <div className={`${ICON_BOX} w-14 h-14 rounded-[var(--r-md)] text-[length:var(--fs-xl)] motion-safe:animate-pulse`}>
          <i className="ti ti-shield-check" />
        </div>
        <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">جاري تحميل بيانات الأدمن...</div>
        <div className="text-[length:var(--fs-sm)] text-[var(--t3)]">الرجاء الانتظار</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <i className="ti ti-alert-octagon text-[length:var(--fs-xl)] text-[var(--danger)]" />
        <div className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">خطأ في تحميل البيانات</div>
        <div className="max-w-[400px] text-[length:var(--fs-sm)] text-[var(--t2)]">{error}</div>
        <div className="text-[length:var(--fs-xs)] text-[var(--t3)] bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-sm)] px-4 py-2">
          تأكد من إعداد جدول <code className="text-[var(--t1)]" dir="ltr">admin_users</code> وسياسات RLS في Supabase.
        </div>
        <div className="flex mt-2">
          <button className={`${BTN_PRI} transition-opacity duration-150 hover:opacity-90`} onClick={onReload}>
            <i className="ti ti-refresh" /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-[1300px] mx-auto px-4 sm:px-6 pt-8 pb-20">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className={ICON_BOX}><i className="ti ti-shield-check" /></div>
          <div className="min-w-0">
            <h1 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] m-0">لوحة تحكم الأدمن</h1>
            <p className="text-[length:var(--fs-sm)] text-[var(--t3)] m-0 mt-1">إدارة المستخدمين وإحصائيات المنصة</p>
          </div>
        </div>
        <button className={BTN_OUTLINE} onClick={onReload} title="تحديث البيانات">
          <i className="ti ti-refresh" />
          <span>تحديث</span>
        </button>
      </div>

      {/* Tabs — تتمرر أفقياً داخل شريطها وحده على الجوال */}
      <div role="tablist" className={`${CARD} flex gap-1 p-1 mb-6 w-full md:w-fit max-w-full overflow-x-auto`}>
        {([
          { id: 'overview', icon: 'ti-chart-bar', label: 'نظرة عامة' },
          { id: 'users', icon: 'ti-users', label: 'المستخدمون', count: users.length },
          { id: 'announcements', icon: 'ti-speakerphone', label: 'نشر تعميم' },
          { id: 'academic-dates', icon: 'ti-calendar-event', label: 'المواعيد الدراسية', count: sortedAcademicDates.length },
          { id: 'features', icon: 'ti-flask', label: 'الميزات التجريبية', count: imageSuggestionOverrides.length },
        ] as const).map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={tabBtn(activeTab === t.id)}
            onClick={() => setActiveTab(t.id)}
          >
            <i className={`ti ${t.icon} text-[length:var(--fs-md)]`} /> {t.label}
            {'count' in t && (
              <span className="rounded-[var(--r-full)] bg-[var(--s3)] px-2 text-[length:var(--fs-xs)] font-bold text-[var(--t2)]">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && stats && (
        <div>
          {/* Stats Grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4 mb-6">
            <StatCard icon="ti-users" label="إجمالي المستخدمين" value={stats.totalUsers} sub="مسجّل في المنصة" />
            <StatCard icon="ti-activity" label="المستخدمون النشطون" value={stats.activeUsers} sub="آخر 30 يوماً" />
            <StatCard icon="ti-files" label="إجمالي الأدلة" value={stats.totalEvidence} sub={`معدل ${stats.avgEvidence} لكل مستخدم`} />
            <StatCard icon="ti-certificate" label="ملفات موثّقة" value={stats.verifiedUsers} sub="أدلة ≥ 5 واستراتيجيات ≥ 2" />
            <StatCard icon="ti-user-plus" label="انضم هذا الأسبوع" value={stats.newUsersThisWeek} sub="آخر 7 أيام" />
          </div>

          {/* Chart + Distributions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Signups Chart */}
            <div className={`${CARD} p-4`}>
              <div className={`${CARD_TITLE} mb-4`}>
                <i className="ti ti-chart-bar text-[var(--t2)]" />
                <span>التسجيلات (آخر 7 أيام)</span>
              </div>
              <MiniBarChart data={stats.dailySignups} />
            </div>

            {/* Distributions */}
            <DistributionList
              title="توزيع جهات العمل"
              data={stats.schoolsDistribution}
              limit={6}
            />
            <DistributionList
              title="توزيع المسميات الوظيفية"
              data={stats.rolesDistribution}
              limit={6}
            />
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <div className="flex flex-col gap-4">
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <i className="ti ti-search absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--fs-md)] text-[var(--t3)] pointer-events-none" />
              <input
                type="text"
                placeholder="بحث بالاسم أو البريد أو المدرسة..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${FIELD} pr-10 pl-11`}
              />
              {search && (
                <button
                  className="absolute left-0 top-0 w-11 h-11 inline-flex items-center justify-center bg-transparent border-0 text-[var(--t3)] cursor-pointer hover:text-[var(--t1)]"
                  onClick={() => setSearch('')}
                  aria-label="مسح البحث"
                >
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  className={`${toggleBtn(filterActive === f)} px-4 whitespace-nowrap`}
                  onClick={() => setFilterActive(f)}
                >
                  {f === 'all' ? 'الكل' : f === 'active' ? 'نشط' : 'غير نشط'}
                </button>
              ))}
            </div>
            <div className="text-[length:var(--fs-sm)] text-[var(--t3)] whitespace-nowrap">
              {filteredUsers.length} من {users.length} مستخدم
            </div>
            <button
              className={BTN_OUTLINE}
              onClick={() => { onExportCSV(filteredUsers); onToast('تم تصدير الملف بنجاح', 'success'); }}
              title="تصدير المستخدمين كملف CSV"
            >
              <i className="ti ti-file-spreadsheet" /> تصدير CSV
            </button>
          </div>

          {/* Table — desktop only، تمرير أفقي داخل الجدول لا للصفحة */}
          <div className={`hidden md:block ${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="bg-[var(--s2)] border-b border-[var(--bd)]">
                  <th className={`${TH} w-14`}></th>
                  <th className={TH_SORT} onClick={() => toggleSort('name')}>
                    الاسم <SortIcon col="name" />
                  </th>
                  <th className={TH}>المسمى الوظيفي</th>
                  <th className={TH}>جهة العمل</th>
                  <th className={TH_SORT} onClick={() => toggleSort('evidenceCount')}>
                    الأدلة <SortIcon col="evidenceCount" />
                  </th>
                  <th className={TH}>الاستراتيجيات</th>
                  <th className={TH}>الحالة</th>
                  <th className={TH_SORT} onClick={() => toggleSort('updated_at')}>
                    آخر نشاط <SortIcon col="updated_at" />
                  </th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                    <UserRow key={u.id} user={u} onView={setSelectedUser} onCancelDeletion={handleCancelDeletion} />
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className={EMPTY}>
                <i className="ti ti-search-off text-[length:var(--fs-xl)]" />
                <span>لا توجد نتائج مطابقة</span>
              </div>
            )}
          </div>

          {/* Cards — mobile only، نفس filteredUsers المستخدمة في الجدول أعلاه */}
          <div className="flex flex-col gap-2 md:hidden">
            {filteredUsers.map(u => (
              <UserCard key={u.id} user={u} onView={setSelectedUser} onCancelDeletion={handleCancelDeletion} />
            ))}
            {filteredUsers.length === 0 && (
              <div className={EMPTY}>
                <i className="ti ti-search-off text-[length:var(--fs-xl)]" />
                <span>لا توجد نتائج مطابقة</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ANNOUNCEMENTS TAB ── */}
      {activeTab === 'announcements' && (
        <div className="max-w-[720px] mx-auto flex flex-col gap-6">
          <div className={`${CARD} p-4 sm:p-6`}>
            <div className={`${CARD_TITLE} mb-4`}>
              <i className={`ti ${editingAnnId ? 'ti-edit' : 'ti-speakerphone'} text-[var(--t2)]`} />
              <span>{editingAnnId ? 'تعديل التعميم' : 'نشر تعميم أو تحديث جديد للمستخدمين'}</span>
            </div>

            <form onSubmit={handlePublishAnnouncement} className="flex flex-col gap-4">
              <div>
                <label htmlFor="ann-title" className={LABEL}>عنوان التعميم / التحديث</label>
                <input
                  id="ann-title"
                  type="text"
                  required
                  placeholder="مثال: تحديثات هامة بخصوص تعبئة ملف الإنجاز"
                  value={annTitle}
                  onChange={e => setAnnTitle(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className={LABEL}>التصنيف</span>
                  <SelectDropdown
                    options={ANN_CATEGORY_OPTIONS}
                    value={annCategory}
                    onChange={v => setAnnCategory(v as Announcement['category'])}
                    placeholder="التصنيف"
                    triggerClassName={FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="ann-attachment" className={LABEL}>رابط مرفق (اختياري)</label>
                  <input
                    id="ann-attachment"
                    type="url"
                    dir="ltr"
                    placeholder="https://example.com/document.pdf"
                    value={annAttachmentUrl}
                    onChange={e => setAnnAttachmentUrl(e.target.value)}
                    className={FIELD}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ann-content" className={LABEL}>محتوى التعميم</label>
                <textarea
                  id="ann-content"
                  required
                  rows={6}
                  placeholder="اكتب تفاصيل التعميم أو التحديث هنا بالتفصيل..."
                  value={annContent}
                  onChange={e => setAnnContent(e.target.value)}
                  className={TEXTAREA}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button type="submit" disabled={publishingAnn} className={FORM_BTN_PRI}>
                  {publishingAnn ? (
                    <>
                      <i className="ti ti-loader animate-spin" />
                      <span>{editingAnnId ? 'جاري حفظ التعديلات...' : 'جاري النشر...'}</span>
                    </>
                  ) : (
                    <>
                      <i className={`ti ${editingAnnId ? 'ti-device-floppy' : 'ti-send'}`} />
                      <span>{editingAnnId ? 'حفظ التعديلات' : 'نشر التعميم الآن'}</span>
                    </>
                  )}
                </button>
                {editingAnnId && (
                  <button type="button" onClick={resetAnnForm} disabled={publishingAnn} className={FORM_BTN_CANCEL}>
                    <i className="ti ti-x" />
                    <span>إلغاء التعديل</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List of existing announcements */}
          <div className={`${CARD} p-4 sm:p-6`}>
            <div className={`${CARD_TITLE} mb-4`}>
              <i className="ti ti-list text-[var(--t2)]" />
              <span>التعاميم المنشورة حالياً ({manageableAnnouncements.length})</span>
            </div>

            {manageableAnnouncements.length > 0 ? (
              <div className="flex flex-col gap-3">
                {manageableAnnouncements.map((ann) => {
                  const cat = ANN_CATEGORY_BADGE[ann.category] ?? ANN_CATEGORY_BADGE.tech;
                  return (
                    <div key={ann.id} className={`${ROW} ${editingAnnId === ann.id ? ROW_EDITING : ROW_IDLE}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <DotLabel dot={cat.dot} label={cat.label} />
                          <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">{formatDate(ann.created_at, 'long')}</span>
                        </div>
                        <h4 className={ROW_TITLE}>{ann.title}</h4>
                        <p className="text-[length:var(--fs-xs)] text-[var(--t2)] mt-1 line-clamp-1">{ann.content}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          className={ICON_BTN}
                          title="تعديل التعميم"
                          aria-label="تعديل التعميم"
                          onClick={() => startEditAnnouncement(ann)}
                        >
                          <i className="ti ti-edit" />
                        </button>
                        <button
                          type="button"
                          className={ICON_BTN_DNG}
                          title="حذف التعميم"
                          aria-label="حذف التعميم"
                          onClick={() => setPendingDelete({ kind: 'announcement', id: ann.id })}
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={EMPTY}>
                <i className="ti ti-speakerphone text-[length:var(--fs-xl)]" />
                <span>لا توجد تعاميم منشورة حالياً</span>
                {hasMockOnly && (
                  <p className={`${HINT} max-w-[420px] leading-relaxed`}>
                    التعاميم الظاهرة للمستخدمين الآن هي <b className="font-bold text-[var(--t2)]">نماذج ترحيبية تجريبية</b> (غير قابلة للتعديل أو الحذف).
                    انشر تعميماً حقيقياً من الأعلى وسيحل محلها تلقائياً.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ACADEMIC DATES TAB ── */}
      {activeTab === 'academic-dates' && (
        <div className="max-w-[720px] mx-auto flex flex-col gap-6">
          <div className={`${CARD} p-4 sm:p-6`}>
            <div className={`${CARD_TITLE} mb-4`}>
              <i className={`ti ${editingAdId ? 'ti-edit' : 'ti-calendar-event'} text-[var(--t2)]`} />
              <span>{editingAdId ? 'تعديل موعد دراسي' : 'إضافة موعد دراسي جديد'}</span>
            </div>

            <form onSubmit={handlePublishAcademicDate} className="flex flex-col gap-4">
              <div>
                <label htmlFor="ad-title" className={LABEL}>عنوان الموعد</label>
                <input
                  id="ad-title"
                  type="text"
                  required
                  placeholder="مثال: عودة المعلمين والمعلمات الممارسين للتدريس"
                  value={adTitle}
                  onChange={e => setAdTitle(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ad-date" className={LABEL}>التاريخ الميلادي</label>
                  <input
                    id="ad-date"
                    type="date"
                    required
                    value={adDate}
                    onChange={e => setAdDate(e.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="ad-hijri" className={LABEL}>التاريخ الهجري (للعرض فقط، اختياري)</label>
                  <input
                    id="ad-hijri"
                    type="text"
                    placeholder="مثال: ١٠ صفر ١٤٤٨ هـ"
                    value={adHijriLabel}
                    onChange={e => setAdHijriLabel(e.target.value)}
                    className={FIELD}
                  />
                </div>
              </div>

              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className={LABEL}>طرف الفصل الدراسي (اختياري)</span>
                    <SelectDropdown
                      options={SEMESTER_BOUNDARY_OPTIONS}
                      value={adSemesterBoundary}
                      onChange={setAdSemesterBoundary}
                      placeholder="بلا"
                      allowClear
                      triggerClassName={FIELD}
                    />
                  </div>
                  <div>
                    <span className={LABEL}>رقم الفصل الدراسي (اختياري)</span>
                    <SelectDropdown
                      options={SEMESTER_NUMBER_OPTIONS}
                      value={adSemesterNumber}
                      onChange={setAdSemesterNumber}
                      placeholder="بلا"
                      allowClear
                      triggerClassName={FIELD}
                    />
                  </div>
                </div>
                <p className={`${HINT} mt-2 leading-relaxed`}>
                  يُستخدم هذان الحقلان فقط لبناء قائمة "الفصول المتاحة" في تقرير الحصاد الفصلي — أضِف موعدي بداية ونهاية بنفس رقم الفصل ليظهر كخيار جاهز للمعلمين.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button type="submit" disabled={publishingAd} className={FORM_BTN_PRI}>
                  {publishingAd ? (
                    <>
                      <i className="ti ti-loader animate-spin" />
                      <span>{editingAdId ? 'جاري حفظ التعديلات...' : 'جاري الإضافة...'}</span>
                    </>
                  ) : (
                    <>
                      <i className={`ti ${editingAdId ? 'ti-device-floppy' : 'ti-plus'}`} />
                      <span>{editingAdId ? 'حفظ التعديلات' : 'إضافة الموعد'}</span>
                    </>
                  )}
                </button>
                {editingAdId && (
                  <button type="button" onClick={resetAdForm} disabled={publishingAd} className={FORM_BTN_CANCEL}>
                    <i className="ti ti-x" />
                    <span>إلغاء التعديل</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List of existing academic dates */}
          <div className={`${CARD} p-4 sm:p-6`}>
            <div className={`${CARD_TITLE} mb-4`}>
              <i className="ti ti-list text-[var(--t2)]" />
              <span>المواعيد الدراسية المضافة حالياً ({sortedAcademicDates.length})</span>
            </div>

            {sortedAcademicDates.length > 0 ? (
              <div className="flex flex-col gap-3">
                {sortedAcademicDates.map((ad) => (
                  <div key={ad.id} className={`${ROW} ${editingAdId === ad.id ? ROW_EDITING : ROW_IDLE}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={CHIP}>{formatDate(ad.date, 'long')}</span>
                        {ad.hijri_label && (
                          <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">{ad.hijri_label}</span>
                        )}
                        {ad.semester_number && (
                          <span className={CHIP}>
                            الفصل {ad.semester_number}{ad.semester_boundary === 'start' ? ' — بداية' : ad.semester_boundary === 'end' ? ' — نهاية' : ''}
                          </span>
                        )}
                      </div>
                      <h4 className={ROW_TITLE}>{ad.title}</h4>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className={ICON_BTN}
                        title="تعديل الموعد"
                        aria-label="تعديل الموعد"
                        onClick={() => startEditAcademicDate(ad)}
                      >
                        <i className="ti ti-edit" />
                      </button>
                      <button
                        type="button"
                        className={ICON_BTN_DNG}
                        title="حذف الموعد"
                        aria-label="حذف الموعد"
                        onClick={() => setPendingDelete({ kind: 'date', id: ad.id })}
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={EMPTY}>
                <i className="ti ti-calendar-event text-[length:var(--fs-xl)]" />
                <span>لا توجد مواعيد دراسية مضافة حالياً</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FEATURES TAB ── */}
      {activeTab === 'features' && (
        <div className="max-w-[720px] mx-auto flex flex-col gap-6">
          {/* السويتش العام — زرّان صريحان لا مفتاح، تفادياً لضغطة خاطئة تغيّر التطبيق عند الجميع */}
          <div className={`${CARD} p-4 sm:p-6`}>
            <div className={`${CARD_TITLE} mb-4`}>
              <i className="ti ti-flask text-[var(--t2)]" />
              <span>اقتراح تلقائي من الصورة (Beta)</span>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">تفعيل اقتراح الصورة للمنصة بالكامل</div>
                <p className={`${HINT} leading-relaxed`}>
                  عند التفعيل يظهر زر "اقترح لي وصفاً" لكل المعلمين عند إضافة شاهد من نوع صورة، ما لم يوجد استثناء فردي لحساب معيّن أدناه يتجاوز هذا الإعداد.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingGlobalFlag}
                  aria-pressed={!!featureFlags?.[IMAGE_SUGGESTION_FEATURE_KEY]}
                  className={`${toggleBtn(!!featureFlags?.[IMAGE_SUGGESTION_FEATURE_KEY])} px-3 disabled:cursor-wait`}
                  onClick={() => handleToggleGlobalFlag(true)}
                >
                  مفعّلة للجميع
                </button>
                <button
                  type="button"
                  disabled={savingGlobalFlag}
                  aria-pressed={!featureFlags?.[IMAGE_SUGGESTION_FEATURE_KEY]}
                  className={`${toggleBtn(!featureFlags?.[IMAGE_SUGGESTION_FEATURE_KEY])} px-3 disabled:cursor-wait`}
                  onClick={() => handleToggleGlobalFlag(false)}
                >
                  معطّلة للجميع
                </button>
              </div>
            </div>
          </div>

          {/* استثناء فردي */}
          <div className={`${CARD} p-4 sm:p-6`}>
            <div className={`${CARD_TITLE} mb-4`}>
              <i className="ti ti-user-cog text-[var(--t2)]" />
              <span>استثناء فردي لمعلم محدد</span>
            </div>
            <div>
              <label htmlFor="feature-search" className={LABEL}>ابحث بالاسم أو البريد الإلكتروني</label>
              <input
                id="feature-search"
                type="text"
                placeholder="مثال: أحمد أو ahmed@edu.sa"
                value={featureSearch}
                onChange={e => setFeatureSearch(e.target.value)}
                className={FIELD}
              />
            </div>

            {featureSearch.trim() && (
              <div className="flex flex-col gap-3 mt-4">
                {matchedFeatureUsers.length > 0 ? matchedFeatureUsers.map(u => (
                  <FeatureOverrideRow
                    key={u.id}
                    user={u}
                    override={imageSuggestionOverrides.find(o => o.portfolio_id === u.id)}
                    onSetOverride={enabled => onSetPortfolioFeatureOverride
                      ? onSetPortfolioFeatureOverride(u.id, IMAGE_SUGGESTION_FEATURE_KEY, enabled)
                      : Promise.resolve(false)}
                    onRemoveOverride={() => onRemovePortfolioFeatureOverride
                      ? onRemovePortfolioFeatureOverride(u.id, IMAGE_SUGGESTION_FEATURE_KEY)
                      : Promise.resolve(false)}
                  />
                )) : (
                  <div className="py-6 text-center text-[length:var(--fs-sm)] text-[var(--t3)]">
                    <span>لا يوجد معلم مطابق للبحث</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* قائمة الاستثناءات الحالية */}
          <div className={`${CARD} p-4 sm:p-6`}>
            <div className={`${CARD_TITLE} mb-4`}>
              <i className="ti ti-list text-[var(--t2)]" />
              <span>الاستثناءات الفردية الحالية ({imageSuggestionOverrides.length})</span>
            </div>

            {imageSuggestionOverrides.length > 0 ? (
              <div className="flex flex-col gap-3">
                {imageSuggestionOverrides.map(o => {
                  const u = users.find(us => us.id === o.portfolio_id);
                  return (
                    <div key={o.portfolio_id} className={`${ROW} ${ROW_IDLE}`}>
                      <div className="flex-1 min-w-0">
                        <div className="mb-1">
                          <DotLabel
                            dot={o.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--idle)]'}
                            label={o.enabled ? 'استثناء: مفعّلة' : 'استثناء: معطّلة'}
                            strong={o.enabled}
                          />
                        </div>
                        <h4 className={ROW_TITLE}>{u?.name || 'مستخدم محذوف'}</h4>
                        <p className="text-[length:var(--fs-xs)] text-[var(--t3)] mt-1 truncate text-right" dir="ltr">{u?.email || o.portfolio_id}</p>
                      </div>

                      <button
                        type="button"
                        className={ICON_BTN_DNG}
                        title="إزالة الاستثناء"
                        aria-label="إزالة الاستثناء"
                        onClick={async () => {
                          const ok = onRemovePortfolioFeatureOverride
                            ? await onRemovePortfolioFeatureOverride(o.portfolio_id, IMAGE_SUGGESTION_FEATURE_KEY)
                            : false;
                          onToast(ok ? 'تمت إزالة الاستثناء بنجاح' : 'فشلت إزالة الاستثناء', ok ? 'success' : 'error');
                        }}
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={EMPTY}>
                <i className="ti ti-flask text-[length:var(--fs-xl)]" />
                <span>لا توجد استثناءات فردية حالياً</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {liveSelectedUser && (
        <UserDetailModal
          user={liveSelectedUser}
          onClose={() => setSelectedUser(null)}
          onDeleteNow={async (id, confirmEmail) => {
            const res = await onDeleteUserNow(id, confirmEmail);
            if (res.ok) setSelectedUser(null);
            return res;
          }}
          onReset={async (id, confirmName) => {
            const res = await onResetUser(id, confirmName);
            if (res.ok) setSelectedUser(null);
            return res;
          }}
          onScheduleDeletion={onScheduleDeletion}
          onCancelDeletion={onCancelDeletion}
          onToast={onToast}
          shareUrl={getShareUrl(liveSelectedUser.id)}
        />
      )}

      {/* تأكيد حذف تعميم أو موعد */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        tone="danger"
        icon="ti-trash"
        title={pendingDelete?.kind === 'date' ? 'حذف الموعد' : 'حذف التعميم'}
        subtitle=""
        onConfirm={() => {
          if (!pendingDelete) return;
          const { kind, id } = pendingDelete;
          setPendingDelete(null);
          if (kind === 'announcement') void handleDeleteAnnouncement(id);
          else void handleDeleteAcademicDate(id);
        }}
      >
        <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
          {pendingDelete?.kind === 'date'
            ? 'هل أنت متأكد من حذف هذا الموعد الدراسي؟ سيتم إزالته من تذكيرات جميع المعلمين فوراً.'
            : 'هل أنت متأكد من حذف هذا التعميم؟ سيتم إزالته من عند جميع المستخدمين فوراً.'}
        </p>
      </Modal>
    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import type { AdminUser, PlatformStats, PortfolioFeatureOverride, PortfolioActionResult } from '../../hooks/useAdminStore';
import type { Announcement, AcademicDate } from '../../types';
import { formatDate } from '../../utils';
import { SelectDropdown } from '../UI';
import type { ToastKind } from '../UI';
import { FIELD, BTN_2ND, toggleBtn } from '../formStyles';
import { BTN_PRI, BTN_GH, BTN_DNG, BTN_DNGF } from '../SectionView';
import UserCard, { UserAvatar, ActiveStatus, CountBadge, isUserActive } from './UserCard';

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
    <div
      className="ann-manage-item"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--line2)',
        borderRadius: '16px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
        opacity: saving ? 0.6 : 1,
        transition: 'opacity .2s',
      }}
    >
      <div style={{ flex: 1, minWidth: '160px' }}>
        <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'white', margin: 0 }}>{user.name}</h4>
        <p style={{ fontSize: '12px', color: 'var(--text4)', margin: '2px 0 0' }}>{user.email || '—'}</p>
      </div>
      <div className="filter-btns">
        <button type="button" disabled={saving} className={`filter-btn ${mode === 'enabled' ? 'active' : ''}`} onClick={() => applyMode('enabled')}>استثناء فردي: تفعيل</button>
        <button type="button" disabled={saving} className={`filter-btn ${mode === 'disabled' ? 'active' : ''}`} onClick={() => applyMode('disabled')}>استثناء فردي: تعطيل</button>
        <button type="button" disabled={saving} className={`filter-btn ${mode === 'default' ? 'active' : ''}`} onClick={() => applyMode('default')}>بدون استثناء (اتبع الإعداد العام)</button>
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

function UserRow({ user, onView }: {
  user: AdminUser; onView: (u: AdminUser) => void;
}) {
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
        <button className={ICON_BTN} onClick={() => onView(user)} title="عرض التفاصيل" aria-label="عرض التفاصيل">
          <i className="ti ti-eye" />
        </button>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────
   User Detail Modal
───────────────────────────────────────────── */
function UserDetailModal({ user, onClose, onDelete, onReset, onToast, shareUrl }: {
  user: AdminUser;
  onClose: () => void;
  onDelete: (id: string, confirmName: string, deleteAuth: boolean) => Promise<PortfolioActionResult>;
  onReset: (id: string, confirmName: string) => Promise<PortfolioActionResult>;
  onToast: (msg: string, kind: ToastKind) => void;
  shareUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  // لوحة التأكيد: العملية المفتوحة، والاسم المكتوب، وخيار حذف حساب الدخول
  const [pending, setPending] = useState<'reset' | 'delete' | null>(null);
  const [typedName, setTypedName] = useState('');
  const [deleteAuth, setDeleteAuth] = useState(false);
  const [running, setRunning] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const nameMatches = typedName.trim() !== '' && typedName.trim() === user.name.trim();

  const openConfirm = (mode: 'reset' | 'delete') => {
    setPending(mode);
    setTypedName('');
    setDeleteAuth(false);
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

  const handleDelete = async () => {
    if (!nameMatches) return;
    setInlineError('');
    setRunning(true);
    try {
      const res = await onDelete(user.id, typedName.trim(), deleteAuth);
      if (res.ok) {
        if (res.authError) onToast('حُذف الملف، لكن تعذّر حذف حساب الدخول', 'error');
        else if (res.storageErrors > 0) onToast('تم، لكن تعذّر حذف بعض الملفات. أعد المحاولة لاحقاً', 'error');
        else onToast('تم حذف بيانات المستخدم نهائياً', 'success');
        onClose();
      } else {
        setInlineError('message' in res ? res.message : 'تعذّر تنفيذ العملية، حاول مجدداً');
      }
    } catch (e: unknown) {
      console.error('Delete portfolio error:', e);
      setInlineError('تعذّر تنفيذ العملية، حاول مجدداً');
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

        {/* Confirm Panel — إعادة التعيين أو الحذف بكتابة اسم المعلم */}
        {pending && (() => {
          const isDelete = pending === 'delete';
          return (
            <div className="mx-6 mt-4 p-4 flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--danger)]/35">
              <div className="flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--danger)]">
                <i className={`ti ${isDelete ? 'ti-trash' : 'ti-refresh'} text-[length:var(--fs-md)]`} />
                {isDelete ? 'حذف الملف نهائياً' : 'إعادة تعيين الملف'}
              </div>

              <div className="text-[length:var(--fs-xs)] text-[var(--t2)] leading-relaxed">
                <div>
                  <strong className="font-bold text-[var(--t1)]">سيُحذف: </strong>
                  {isDelete
                    ? 'الملف كاملاً، ومعه الأدلة وملفاتها، وعدّاد الشهر، وتحليل النتائج، وتقارير الحصاد، والملخصات، ومعه الصورة الشخصية.'
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
                  اكتب اسم المعلم للتأكيد: <strong className="font-bold text-[var(--t1)]">{user.name}</strong>
                </span>
                <input
                  type="text"
                  value={typedName}
                  onChange={e => setTypedName(e.target.value)}
                  disabled={running}
                  autoComplete="off"
                  className={FIELD}
                />
              </label>

              {isDelete && (
                <label className={`flex items-start gap-2 py-2 ${running ? 'cursor-default' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={deleteAuth}
                    onChange={e => setDeleteAuth(e.target.checked)}
                    disabled={running}
                    className="mt-1 w-4 h-4 shrink-0 accent-[var(--danger)]"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-[length:var(--fs-sm)] text-[var(--t2)]">حذف حساب الدخول أيضاً</span>
                    <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">لن يستطيع المعلم تسجيل الدخول بهذا البريد بعدها</span>
                  </span>
                </label>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  className={`${BTN_DNGF} min-w-[180px] disabled:cursor-not-allowed ${!nameMatches && !running ? 'opacity-40' : ''}`}
                  onClick={isDelete ? handleDelete : handleReset}
                  disabled={!nameMatches || running}
                >
                  <i className={`ti ${running ? 'ti-loader animate-spin' : 'ti-alert-triangle'}`} />
                  {running
                    ? (isDelete ? 'جاري الحذف...' : 'جاري إعادة التعيين...')
                    : (isDelete ? 'تأكيد الحذف النهائي' : 'تأكيد إعادة التعيين')}
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
        <div className="flex gap-2 flex-wrap p-6">
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
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

          {/* Delete Button — يفتح لوحة التأكيد فقط */}
          <button
            className={`${BTN_DNG} min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed ${pending === 'delete' ? 'bg-[var(--danger)]/10' : 'bg-transparent'}`}
            onClick={() => openConfirm('delete')}
            disabled={running}
          >
            <i className="ti ti-trash" /> حذف البيانات
          </button>
        </div>
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
  onDeleteUser: (id: string, confirmName: string, deleteAuth: boolean) => Promise<PortfolioActionResult>;
  onResetUser: (id: string, confirmName: string) => Promise<PortfolioActionResult>;
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
  users, stats, loading, error, onReload, onDeleteUser, onResetUser, onExportCSV, onToast, getShareUrl, onPublishAnnouncement, onUpdateAnnouncement, onDeleteAnnouncement, announcements, onPublishAcademicDate, onUpdateAcademicDate, onDeleteAcademicDate, academicDates,
  featureFlags, featureOverrides, onSetGlobalFeatureFlag, onSetPortfolioFeatureOverride, onRemovePortfolioFeatureOverride,
}: AdminDashboardProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'evidenceCount' | 'updated_at' | 'created_at'>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
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

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التعميم؟ سيتم إزالته من عند جميع المستخدمين فوراً.')) {
      return;
    }
    
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
    if (!window.confirm('هل أنت متأكد من حذف هذا الموعد الدراسي؟ سيتم إزالته من تذكيرات جميع المعلمين فوراً.')) {
      return;
    }

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
                    <UserRow key={u.id} user={u} onView={setSelectedUser} />
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
              <UserCard key={u.id} user={u} onView={setSelectedUser} />
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
        <div className="admin-announcements-tab" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
          <div className="announcement-form-card">
            <div className="form-header">
              <i className={`ti ${editingAnnId ? 'ti-edit' : 'ti-speakerphone'}`} />
              <span>{editingAnnId ? 'تعديل التعميم' : 'نشر تعميم أو تحديث جديد للمستخدمين'}</span>
            </div>

            <form onSubmit={handlePublishAnnouncement} className="ann-form">
              <div className="form-group">
                <label>عنوان التعميم / التحديث</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تحديثات هامة بخصوص تعبئة ملف الإنجاز"
                  value={annTitle}
                  onChange={e => setAnnTitle(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>التصنيف</label>
                  <select
                    value={annCategory}
                    onChange={e => setAnnCategory(e.target.value as any)}
                    className="form-select"
                  >
                    <option value="admin">📄 تعميم إداري</option>
                    <option value="tech">⚙️ تحديث برمجي</option>
                    <option value="urgent">⚠️ تنبيه عاجل</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>رابط مرفق (اختياري)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    value={annAttachmentUrl}
                    onChange={e => setAnnAttachmentUrl(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>محتوى التعميم</label>
                <textarea
                  required
                  rows={6}
                  placeholder="اكتب تفاصيل التعميم أو التحديث هنا بالتفصيل..."
                  value={annContent}
                  onChange={e => setAnnContent(e.target.value)}
                  className="form-textarea"
                />
              </div>

              <div className="ann-form-actions">
                <button
                  type="submit"
                  disabled={publishingAnn}
                  className="publish-submit-btn"
                >
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
                  <button
                    type="button"
                    onClick={resetAnnForm}
                    disabled={publishingAnn}
                    className="ann-cancel-btn"
                  >
                    <i className="ti ti-x" />
                    <span>إلغاء التعديل</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List of existing announcements */}
          <div className="announcements-manage-section" style={{ marginTop: '32px' }}>
            <div className="form-header" style={{ marginBottom: '16px' }}>
              <i className="ti ti-list" />
              <span>التعاميم المنشورة حالياً ({manageableAnnouncements.length})</span>
            </div>

            {manageableAnnouncements.length > 0 ? (
              <div className="ann-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {manageableAnnouncements.map((ann) => {
                  let catLabel = 'تحديث';
                  let catClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  if (ann.category === 'admin') {
                    catLabel = 'تعميم إداري';
                    catClass = 'bg-[var(--gold)]/10 text-[var(--gold)] border-[var(--gold)]/20';
                  } else if (ann.category === 'urgent') {
                    catLabel = 'تنبيه عاجل';
                    catClass = 'bg-red-500/10 text-red-400 border-red-500/20';
                  }

                  return (
                    <div
                      key={ann.id}
                      className="ann-manage-item"
                      style={{
                        background: editingAnnId === ann.id ? 'rgba(82,196,120,.08)' : 'rgba(255, 255, 255, 0.03)',
                        border: editingAnnId === ann.id ? '1px solid rgba(82,196,120,.4)' : '1px solid var(--line2)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[10px] font-bold border ${catClass}`}>
                            {catLabel}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text4)' }}>
                            {formatDate(ann.created_at, 'long')}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ann.title}</h4>
                        <p style={{ fontSize: '12px', color: 'var(--text3)', margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ann.content}</p>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            border: '1px solid rgba(82,196,120,.25)',
                            color: 'var(--em8)',
                            background: 'rgba(82,196,120,.06)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          title="تعديل التعميم"
                          onClick={() => startEditAnnouncement(ann)}
                        >
                          <i className="ti ti-edit" style={{ fontSize: '16px' }}></i>
                        </button>
                        <button
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            border: '1px solid rgba(248,113,113,.2)',
                            color: '#f87171',
                            background: 'rgba(248,113,113,.05)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          title="حذف التعميم"
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                        >
                          <i className="ti ti-trash" style={{ fontSize: '16px' }}></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed var(--line2)', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', color: 'var(--text4)' }}>
                <i className="ti ti-speakerphone" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.4 }}></i>
                <span>لا توجد تعاميم منشورة حالياً</span>
                {hasMockOnly && (
                  <p style={{ fontSize: '12px', color: 'var(--text4)', margin: '10px 0 0', lineHeight: 1.6, maxWidth: '420px' }}>
                    التعاميم الظاهرة للمستخدمين الآن هي <b>نماذج ترحيبية تجريبية</b> (غير قابلة للتعديل أو الحذف).
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
        <div className="admin-announcements-tab" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
          <div className="announcement-form-card">
            <div className="form-header">
              <i className={`ti ${editingAdId ? 'ti-edit' : 'ti-calendar-event'}`} />
              <span>{editingAdId ? 'تعديل موعد دراسي' : 'إضافة موعد دراسي جديد'}</span>
            </div>

            <form onSubmit={handlePublishAcademicDate} className="ann-form">
              <div className="form-group">
                <label>عنوان الموعد</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: عودة المعلمين والمعلمات الممارسين للتدريس"
                  value={adTitle}
                  onChange={e => setAdTitle(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>التاريخ الميلادي</label>
                  <input
                    type="date"
                    required
                    value={adDate}
                    onChange={e => setAdDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group flex-1">
                  <label>التاريخ الهجري (للعرض فقط، اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: ١٠ صفر ١٤٤٨ هـ"
                    value={adHijriLabel}
                    onChange={e => setAdHijriLabel(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>طرف الفصل الدراسي (اختياري)</label>
                  <SelectDropdown
                    options={SEMESTER_BOUNDARY_OPTIONS}
                    value={adSemesterBoundary}
                    onChange={setAdSemesterBoundary}
                    placeholder="بلا"
                    allowClear
                    triggerClassName="form-input"
                  />
                </div>
                <div className="form-group flex-1">
                  <label>رقم الفصل الدراسي (اختياري)</label>
                  <SelectDropdown
                    options={SEMESTER_NUMBER_OPTIONS}
                    value={adSemesterNumber}
                    onChange={setAdSemesterNumber}
                    placeholder="بلا"
                    allowClear
                    triggerClassName="form-input"
                  />
                </div>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text4)', margin: '-8px 0 4px' }}>
                يُستخدم هذان الحقلان فقط لبناء قائمة "الفصول المتاحة" في تقرير الحصاد الفصلي — أضِف موعدي بداية ونهاية بنفس رقم الفصل ليظهر كخيار جاهز للمعلمين.
              </p>

              <div className="ann-form-actions">
                <button
                  type="submit"
                  disabled={publishingAd}
                  className="publish-submit-btn"
                >
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
                  <button
                    type="button"
                    onClick={resetAdForm}
                    disabled={publishingAd}
                    className="ann-cancel-btn"
                  >
                    <i className="ti ti-x" />
                    <span>إلغاء التعديل</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List of existing academic dates */}
          <div className="announcements-manage-section" style={{ marginTop: '32px' }}>
            <div className="form-header" style={{ marginBottom: '16px' }}>
              <i className="ti ti-list" />
              <span>المواعيد الدراسية المضافة حالياً ({sortedAcademicDates.length})</span>
            </div>

            {sortedAcademicDates.length > 0 ? (
              <div className="ann-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sortedAcademicDates.map((ad) => (
                  <div
                    key={ad.id}
                    className="ann-manage-item"
                    style={{
                      background: editingAdId === ad.id ? 'rgba(82,196,120,.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: editingAdId === ad.id ? '1px solid rgba(82,196,120,.4)' : '1px solid var(--line2)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[10px] font-bold border bg-[var(--em7)]/10 text-[var(--em8)] border-[var(--em7)]/20">
                          {formatDate(ad.date, 'long')}
                        </span>
                        {ad.hijri_label && (
                          <span style={{ fontSize: '11px', color: 'var(--text4)' }}>{ad.hijri_label}</span>
                        )}
                        {ad.semester_number && (
                          <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[10px] font-bold border bg-[var(--gold)]/10 text-[var(--gold3)] border-[var(--gold)]/20">
                            الفصل {ad.semester_number}{ad.semester_boundary === 'start' ? ' — بداية' : ad.semester_boundary === 'end' ? ' — نهاية' : ''}
                          </span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.title}</h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(82,196,120,.25)',
                          color: 'var(--em8)',
                          background: 'rgba(82,196,120,.06)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        title="تعديل الموعد"
                        onClick={() => startEditAcademicDate(ad)}
                      >
                        <i className="ti ti-edit" style={{ fontSize: '16px' }}></i>
                      </button>
                      <button
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(248,113,113,.2)',
                          color: '#f87171',
                          background: 'rgba(248,113,113,.05)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        title="حذف الموعد"
                        onClick={() => handleDeleteAcademicDate(ad.id)}
                      >
                        <i className="ti ti-trash" style={{ fontSize: '16px' }}></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed var(--line2)', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', color: 'var(--text4)' }}>
                <i className="ti ti-calendar-event" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.4 }}></i>
                <span>لا توجد مواعيد دراسية مضافة حالياً</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FEATURES TAB ── */}
      {activeTab === 'features' && (
        <div className="admin-announcements-tab" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
          {/* السويتش العام */}
          <div className="announcement-form-card">
            <div className="form-header">
              <i className="ti ti-flask" />
              <span>اقتراح تلقائي من الصورة (Beta)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', padding: '4px 2px 6px' }}>
              <div style={{ maxWidth: '520px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'white' }}>تفعيل اقتراح الصورة للمنصة بالكامل</div>
                <p style={{ fontSize: '12px', color: 'var(--text4)', margin: '4px 0 0', lineHeight: 1.6 }}>
                  عند التفعيل يظهر زر "اقترح لي وصفاً" لكل المعلمين عند إضافة شاهد من نوع صورة، ما لم يوجد استثناء فردي لحساب معيّن أدناه يتجاوز هذا الإعداد.
                </p>
              </div>
              <div className="filter-btns">
                <button
                  type="button"
                  disabled={savingGlobalFlag}
                  className={`filter-btn ${featureFlags?.[IMAGE_SUGGESTION_FEATURE_KEY] ? 'active' : ''}`}
                  onClick={() => handleToggleGlobalFlag(true)}
                >
                  مفعّلة للجميع
                </button>
                <button
                  type="button"
                  disabled={savingGlobalFlag}
                  className={`filter-btn ${!featureFlags?.[IMAGE_SUGGESTION_FEATURE_KEY] ? 'active' : ''}`}
                  onClick={() => handleToggleGlobalFlag(false)}
                >
                  معطّلة للجميع
                </button>
              </div>
            </div>
          </div>

          {/* استثناء فردي */}
          <div className="announcement-form-card" style={{ marginTop: '24px' }}>
            <div className="form-header">
              <i className="ti ti-user-cog" />
              <span>استثناء فردي لمعلم محدد</span>
            </div>
            <div className="form-group">
              <label>ابحث بالاسم أو البريد الإلكتروني</label>
              <input
                type="text"
                placeholder="مثال: أحمد أو ahmed@edu.sa"
                value={featureSearch}
                onChange={e => setFeatureSearch(e.target.value)}
                className="form-input"
              />
            </div>

            {featureSearch.trim() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
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
                  <div className="empty-state" style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed var(--line2)', borderRadius: '16px', padding: '20px 16px', textAlign: 'center', color: 'var(--text4)' }}>
                    <span>لا يوجد معلم مطابق للبحث</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* قائمة الاستثناءات الحالية */}
          <div className="announcements-manage-section" style={{ marginTop: '32px' }}>
            <div className="form-header" style={{ marginBottom: '16px' }}>
              <i className="ti ti-list" />
              <span>الاستثناءات الفردية الحالية ({imageSuggestionOverrides.length})</span>
            </div>

            {imageSuggestionOverrides.length > 0 ? (
              <div className="ann-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {imageSuggestionOverrides.map(o => {
                  const u = users.find(us => us.id === o.portfolio_id);
                  return (
                    <div
                      key={o.portfolio_id}
                      className="ann-manage-item"
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--line2)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span
                            className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[10px] font-bold border ${
                              o.enabled
                                ? 'bg-[var(--em7)]/10 text-[var(--em8)] border-[var(--em7)]/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                          >
                            {o.enabled ? 'استثناء: مفعّلة' : 'استثناء: معطّلة'}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u?.name || 'مستخدم محذوف'}</h4>
                        <p style={{ fontSize: '12px', color: 'var(--text4)', margin: '4px 0 0' }}>{u?.email || o.portfolio_id}</p>
                      </div>

                      <button
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(248,113,113,.2)',
                          color: '#f87171',
                          background: 'rgba(248,113,113,.05)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          flexShrink: 0,
                        }}
                        title="إزالة الاستثناء"
                        onClick={async () => {
                          const ok = onRemovePortfolioFeatureOverride
                            ? await onRemovePortfolioFeatureOverride(o.portfolio_id, IMAGE_SUGGESTION_FEATURE_KEY)
                            : false;
                          onToast(ok ? 'تمت إزالة الاستثناء بنجاح' : 'فشلت إزالة الاستثناء', ok ? 'success' : 'error');
                        }}
                      >
                        <i className="ti ti-trash" style={{ fontSize: '16px' }}></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed var(--line2)', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', color: 'var(--text4)' }}>
                <i className="ti ti-flask" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.4 }}></i>
                <span>لا توجد استثناءات فردية حالياً</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDelete={async (id, confirmName, deleteAuth) => {
            const res = await onDeleteUser(id, confirmName, deleteAuth);
            if (res.ok) setSelectedUser(null);
            return res;
          }}
          onReset={async (id, confirmName) => {
            const res = await onResetUser(id, confirmName);
            if (res.ok) setSelectedUser(null);
            return res;
          }}
          onToast={onToast}
          shareUrl={getShareUrl(selectedUser.id)}
        />
      )}

      {/* Styles */}
      <style>{adminStyles}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CSS Styles — بقايا تبويبات التعاميم والمواعيد والميزات فقط.
   تُحذف كاملة مع وسم <style> في الخطوة 6.6ب.
───────────────────────────────────────────── */
const adminStyles = `
.filter-btns { display: flex; gap: 6px; }
.filter-btn {
  padding: 9px 16px; border-radius: 10px;
  background: rgba(255,255,255,.04); border: 1px solid var(--line2);
  color: var(--text3); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .2s; font-family: var(--font);
}
.filter-btn.active {
  background: rgba(82,196,120,.12); border-color: rgba(82,196,120,.3); color: var(--em8);
}
.filter-btn:not(.active):hover { background: rgba(255,255,255,.07); color: var(--text1); }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; padding: 48px; color: var(--text4); font-size: 15px;
}
.empty-state i { font-size: 36px; opacity: .5; }

@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes scaleIn { from { opacity:0; transform:scale(.95) } to { opacity:1; transform:scale(1) } }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
@keyframes spin { to { transform: rotate(360deg) } }
.animate-spin { animation: spin 1s linear infinite; }

/* ── Announcements Form Tab ── */
.admin-announcements-tab {
  animation: scaleIn .35s var(--sp) both;
  max-width: 720px;
  margin: 0 auto;
}
.announcement-form-card {
  background: rgba(255,255,255,.04);
  border: 1px solid var(--line2);
  border-radius: 20px;
  padding: 24px;
}
.form-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 800;
  color: white;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--line2);
  padding-bottom: 16px;
}
.form-header i {
  color: var(--em8);
  font-size: 20px;
}
.ann-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-group label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text2);
}
.form-row {
  display: flex;
  gap: 16px;
}
@media (max-width: 600px) {
  .form-row {
    flex-direction: column;
  }
}
.form-input, .form-select, .form-textarea {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--line2);
  border-radius: 12px;
  color: white;
  font-size: 14px;
  font-family: var(--font);
  outline: none;
  transition: all .2s;
  box-sizing: border-box;
}
.form-select option {
  background: #0d1f14;
  color: white;
}
.form-input:focus, .form-select:focus, .form-textarea:focus {
  border-color: rgba(82,196,120,.4);
  background: rgba(82,196,120,.04);
  box-shadow: 0 0 0 3px rgba(82,196,120,.1);
}
.ann-form-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.publish-submit-btn {
  flex: 1;
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--em4), var(--em7));
  color: white;
  font-size: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity .2s, transform .2s;
  font-family: var(--font);
}
.ann-cancel-btn {
  padding: 14px 20px;
  border-radius: 12px;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--line2);
  color: var(--text3);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all .2s;
  font-family: var(--font);
  white-space: nowrap;
}
.ann-cancel-btn:hover { background: rgba(255,255,255,.1); color: white; }
.ann-cancel-btn:disabled { opacity: .5; cursor: not-allowed; }
.publish-submit-btn:hover {
  opacity: .9;
  transform: translateY(-1px);
}
.publish-submit-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}

`;

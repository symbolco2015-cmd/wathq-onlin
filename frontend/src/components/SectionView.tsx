import { useEffect, useState } from 'react';
import type { SectionData, SectionIndicator } from '../types';
import type { SupabaseEvidence, EvidenceType } from '../hooks/useSupabaseEvidence';
import { formatDate } from '../utils';
import {
  CUSTOM_INDICATOR_LIMIT, CUSTOM_LIMIT_MSG, CUSTOM_NAME_MAX, validateIndicatorName,
  type IndicatorResult,
} from '../hooks/useCustomIndicators';

// شاشة قسم عادي واحد — مطابقة لـ secView()/indCard()/evRow() في
// docs/design/wathq-prototype.html. المصدر الوحيد للشواهد جدول evidence
// مجمّعة حسب indicator_id، والمؤشرات من section_indicators (sec.indicators).

export type Level = 'n' | 'p' | 'g' | 'x';

export const LEVEL_LABEL: Record<Level, string> = { n: 'لم يبدأ', p: 'جارٍ', g: 'أساسي', x: 'متجاوز' };
export const LEVEL_COLOR: Record<Level, string> = { n: 'var(--t3)', p: 'var(--prog)', g: 'var(--accent)', x: 'var(--st-gold)' };
// نقطة الحالة — .navs .dt في النموذج: «لم يبدأ» بـ --idle، لا بلون نص الشارة --t3
export const DOT_COLOR: Record<Level, string> = { ...LEVEL_COLOR, n: 'var(--idle)' };

/** شارة المستوى — رأس شاشة القسم وصف القسم في الرئيسية */
export function LevelBadge({ level }: { level: Level }) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold whitespace-nowrap"
      style={{ color: LEVEL_COLOR[level] }}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

/** مستوى القسم — lvl() في النموذج، بـ total من بيانات القسم لا رقم ثابت.
 *  total > 0 شرط لـ«أساسي»/«متجاوز» كي لا يُعدّ قسم بلا مؤشرات مكتملاً. */
export function sectionLevel(covered: number, total: number, n: number): Level {
  if (total > 0 && covered === total && n >= 6) return 'x';
  if (total > 0 && covered === total) return 'g';
  return n > 0 ? 'p' : 'n';
}

/** صيغة العدد العربية — nEv() في النموذج */
export function nEv(n: number): string {
  if (n === 0) return 'لا شواهد بعد';
  if (n === 1) return 'شاهد واحد';
  if (n === 2) return 'شاهدان';
  if (n <= 10) return `${n} شواهد`;
  return `${n} شاهداً`;
}

export const TYPE_ICON: Record<EvidenceType, string> = {
  image: 'ti-photo', file: 'ti-file-text', link: 'ti-link',
  note: 'ti-notes', audio: 'ti-microphone', video: 'ti-player-play',
};
export const TYPE_LABEL: Record<EvidenceType, string> = {
  image: 'صورة', file: 'ملف', link: 'رابط',
  note: 'ملاحظة', audio: 'تسجيل صوتي', video: 'فيديو',
};

/** ملخص القسم — يولّده المسار الأسبوعي، والمعلم يخفيه أو يظهره فقط. */
export interface SectionSummary {
  ai_sentence: string;
  generated_at: string;
  hidden: boolean;
}

interface SectionViewProps {
  section: SectionData;
  evidence: SupabaseEvidence[];
  onBack: () => void;
  onAddEvClick: (sid: number, sub: string, strategyId?: string, indicatorId?: string) => void;
  onDeleteEv: (evidenceId: string) => void;
  /** يفتح نموذج الشاهد في وضع التعديل على هذا الشاهد */
  onEditEv: (sectionId: number, ev: SupabaseEvidence) => void;
  sectionSummary?: SectionSummary | null;
  onToggleSummaryHidden?: (sectionId: number) => void;
  /** إدارة المؤشرات المخصصة — للأقسام العادية فقط */
  indicatorHandlers?: IndicatorHandlers;
  /** «أبرز إنجاز» و«اللمحات» في قائمة ⋯ للشاهد */
  highlight?: EvHighlightActions;
}

/** إضافة مؤشر مخصص وإعادة تسميته وحذفه — المنفّذ في App.tsx */
export interface IndicatorHandlers {
  onAddIndicator: (sectionId: number, name: string) => Promise<IndicatorResult>;
  onRenameIndicator: (indicatorId: string, name: string) => Promise<IndicatorResult>;
  /** يبدأ الحذف المؤجّل (مع «تراجع»): نقل الشواهد إلى toId أو حذفها معه */
  onDeleteIndicator: (indicatorId: string, mode: 'move' | 'delete', toId?: string, evidenceCount?: number) => void;
}

// .btn.sm في docs/design/wathq-prototype.html
export const BTN_SM = 'self-start h-9 px-3 inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[length:var(--fs-sm)] font-bold text-[var(--t1)] whitespace-nowrap cursor-pointer';
// .btn.gh.sm و.btn.pri.sm
export const BTN_GH_SM = 'h-9 px-3 inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] border border-transparent text-[length:var(--fs-sm)] font-bold text-[var(--t2)] whitespace-nowrap cursor-pointer disabled:opacity-40';
export const BTN_PRI_SM = 'h-9 px-3 inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--accent)] text-[length:var(--fs-sm)] font-bold text-[var(--bg)] whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
// أزرار نافذة الحذف: .btn و.btn.pri و.btn.dng و.btn.dngf
const BTN_BASE = 'h-11 flex-1 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] border text-[length:var(--fs-sm)] font-bold whitespace-nowrap cursor-pointer';
export const BTN_GH = `${BTN_BASE} border-transparent text-[var(--t2)]`;
export const BTN_PRI = `${BTN_BASE} border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]`;
export const BTN_DNG = `${BTN_BASE} border-[var(--danger)]/35 text-[var(--danger)]`;
export const BTN_DNGF = `${BTN_BASE} border-[var(--danger)] bg-[var(--danger)] text-[var(--bg)]`;

/** نموذج اسم المؤشر المخصص داخل الصفحة — cForm() في النموذج الأولي */
function IndicatorNameForm({ title, submitLabel, initialName = '', officialNames, customNames, onCancel, onSubmit }: {
  title: string;
  submitLabel: string;
  initialName?: string;
  officialNames: string[];
  /** أسماء المخصص الأخرى في القسم (بلا اسم المؤشر الذي يُعدَّل) */
  customNames: string[];
  onCancel: () => void;
  onSubmit: (name: string) => Promise<IndicatorResult>;
}) {
  const [name, setName] = useState(initialName);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    // الاسم نفسه بلا تغيير — لا طلب
    if (initialName && name.trim() === initialName.trim()) { onCancel(); return; }
    const local = validateIndicatorName(name, officialNames, customNames);
    if (local) { setErr(local); return; }
    setBusy(true);
    const r = await onSubmit(name);
    setBusy(false);
    if (r.ok) return; // الأب يغلق النموذج
    if (r.field) setErr(r.field);
  };

  return (
    <div className="p-4 rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--accent)]/35">
      <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)] mb-2">{title}</div>
      <input
        autoFocus
        dir="auto"
        value={name}
        maxLength={CUSTOM_NAME_MAX}
        placeholder="مثال: المشاركة في الإذاعة المدرسية"
        aria-invalid={!!err}
        onChange={e => { setName(e.target.value); if (err) setErr(''); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); void submit(); }
          if (e.key === 'Escape') onCancel();
        }}
        className={`w-full h-11 px-3 rounded-[var(--r-sm)] border bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none ${err ? 'border-[var(--danger)]' : 'border-[var(--bd2)] focus:border-[var(--accent)]'}`}
      />
      {err && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--danger)]">
          <i className="ti ti-alert-circle text-[16px]" /> {err}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onCancel} disabled={busy} className={BTN_GH_SM}>إلغاء</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className={`${BTN_PRI_SM} mr-auto`}>
          {busy && <i className="ti ti-loader animate-spin text-[16px]" />}{submitLabel}
        </button>
      </div>
    </div>
  );
}

/** نافذة حذف المؤشر المخصص — delInd() في النموذج الأولي */
function DeleteIndicatorDialog({ indicator, evidenceCount, targets, onCancel, onConfirm }: {
  indicator: SectionIndicator;
  evidenceCount: number;
  /** مؤشرات القسم الأخرى التي تُنقل إليها الشواهد */
  targets: SectionIndicator[];
  onCancel: () => void;
  onConfirm: (mode: 'move' | 'delete', toId?: string) => void;
}) {
  const [toId, setToId] = useState(targets[0]?.id ?? '');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="del-ind-title" className="relative w-full max-w-[420px] bg-[var(--s1)] border border-[var(--bd2)] rounded-[var(--r-md)] p-4">
        <h3 id="del-ind-title" className="flex items-center gap-2 text-[length:var(--fs-md)] font-bold text-[var(--t1)] leading-normal">
          <i className="ti ti-trash text-[20px] text-[var(--danger)] shrink-0" />حذف «{indicator.name_ar}»
        </h3>
        {evidenceCount > 0 ? (
          <>
            <p className="mt-2 text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">في هذا المؤشر {nEv(evidenceCount)}. ماذا نفعل بها؟</p>
            {targets.length > 0 && (
              <div className="mt-3">
                <label htmlFor="del-ind-to" className="block mb-1.5 text-[length:var(--fs-xs)] text-[var(--t3)]">نقلها إلى</label>
                <select
                  id="del-ind-to"
                  value={toId}
                  onChange={e => setToId(e.target.value)}
                  className="w-full h-11 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  {targets.map(t => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => onConfirm('delete')} className={BTN_DNG}>حذفها معه</button>
              {targets.length > 0 && (
                <button type="button" onClick={() => onConfirm('move', toId)} className={BTN_PRI}>نقل وحذف المؤشر</button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">المؤشر فارغ، ولن يُحذف أي شاهد.</p>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={onCancel} className={BTN_GH}>إلغاء</button>
              <button type="button" onClick={() => onConfirm('delete')} className={BTN_DNGF}>حذف</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** شاهد بلا وصف — الوصف مصدر ملخص القسم */
const noDesc = (ev: SupabaseEvidence) => !(ev.description ?? '').trim();

/** «أبرز إنجاز» و«اللمحات» على صف الشاهد — المنفّذ في App.tsx */
export interface EvHighlightActions {
  /** الشاهد المثبّت حالياً (موجود في الشواهد المحمّلة)، أو null */
  pinnedId: string | null;
  onTogglePin: (ev: SupabaseEvidence) => void;
  onToggleGallery: (ev: SupabaseEvidence) => void;
}

// زر في قائمة ⋯ للشاهد
const MENU_ITEM = 'w-full h-9 px-3 flex items-center gap-2 text-right text-[length:var(--fs-sm)] font-bold whitespace-nowrap cursor-pointer';

export function EvRow({ ev, menuOpen, onToggleMenu, onCloseMenu, onEdit, onDelete, canEdit = true, highlight }: {
  ev: SupabaseEvidence; menuOpen: boolean; onToggleMenu: () => void; onCloseMenu: () => void; onEdit?: () => void; onDelete: () => void;
  /** false يخفي «تعديل» من القائمة (شواهد الأقسام الخاصة) */
  canEdit?: boolean;
  highlight?: EvHighlightActions;
}) {
  const url = ev.file_url ?? ev.link_url ?? undefined;
  const pinned = !!highlight && highlight.pinnedId === ev.id;
  // الشاهد غير المصنّف لا يظهر في الصفحة العامة، فلا يُثبَّت
  const canPin = !!highlight && ev.section_id !== null;
  // المعرض للصور والفيديو فقط
  const canGallery = !!highlight && (ev.evidence_type === 'image' || ev.evidence_type === 'video');
  const content = (
    <>
      <span className="w-8 h-8 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0">
        <i className={`ti ${TYPE_ICON[ev.evidence_type] ?? 'ti-file-text'}`} />
      </span>
      <span className="min-w-0 flex-1 text-right">
        <span className="flex items-center gap-1.5 min-w-0">
          <b dir="auto" className="block min-w-0 font-normal text-[length:var(--fs-sm)] text-[var(--t1)] whitespace-nowrap overflow-hidden text-ellipsis">{ev.title}</b>
          {pinned && (
            <span className="inline-flex items-center gap-1 shrink-0 rounded-[var(--r-full)] bg-[var(--s2)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold whitespace-nowrap text-[var(--st-gold)]">
              <i className="ti ti-pin" />أبرز إنجاز
            </span>
          )}
        </span>
        <small className="block text-[length:var(--fs-xs)] text-[var(--t3)]">
          {TYPE_LABEL[ev.evidence_type] ?? 'ملف'} · {formatDate(ev.created_at)}{noDesc(ev) && ' · بلا وصف'}
          {ev.hidden_from_gallery && (
            <> · <i className="ti ti-eye-off text-[var(--t3)]" title="مخفي من اللمحات" aria-label="مخفي من اللمحات" /></>
          )}
        </small>
      </span>
    </>
  );

  return (
    <div className="relative flex items-center gap-2 py-2.5 px-3.5">
      {url ? (
        <button type="button" onClick={() => window.open(url, '_blank')} className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" title="اضغط لعرض الملف">
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 min-w-0 flex-1">{content}</div>
      )}
      <button
        type="button"
        aria-label="خيارات الشاهد"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
        className="w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0 cursor-pointer"
      >
        <i className="ti ti-dots" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={onCloseMenu} />
          <div role="menu" className="absolute left-3.5 top-full mt-1 z-30 min-w-[140px] py-1 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)]">
            {highlight && canPin && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { onCloseMenu(); highlight.onTogglePin(ev); }}
                className={`${MENU_ITEM} text-[var(--t1)]`}
              >
                <i className="ti ti-pin text-[16px]" /> {pinned ? 'إلغاء التثبيت' : 'تثبيت كأبرز إنجاز'}
              </button>
            )}
            {highlight && canGallery && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { onCloseMenu(); highlight.onToggleGallery(ev); }}
                className={`${MENU_ITEM} text-[var(--t1)]`}
              >
                {ev.hidden_from_gallery
                  ? <><i className="ti ti-eye text-[16px]" /> إظهار في اللمحات</>
                  : <><i className="ti ti-eye-off text-[16px]" /> إخفاء من اللمحات</>}
              </button>
            )}
            {canEdit && onEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { onCloseMenu(); onEdit(); }}
                className="w-full h-9 px-3 flex items-center gap-2 text-right text-[length:var(--fs-sm)] font-bold text-[var(--t1)] cursor-pointer"
              >
                <i className="ti ti-pencil text-[16px]" /> تعديل
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => { onCloseMenu(); onDelete(); }}
              className="w-full h-9 px-3 flex items-center gap-2 text-right text-[length:var(--fs-sm)] font-bold text-[var(--danger)] cursor-pointer"
            >
              <i className="ti ti-trash text-[16px]" /> حذف
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** زر الرجوع «البنود» وبطاقة الرأس — مشترك بين شاشة القسم العادي والشاشات
 *  الخاصة. Fragment حتى تبقى المسافة (gap) من حاوية الشاشة. */
export function SectionHeader({ onBack, icon, title, level, evCount, progress }: {
  onBack: () => void;
  icon: string;
  title: string;
  /** شارة المستوى — اختيارية */
  level?: Level;
  /** شارة عدد الشواهد — اختيارية */
  evCount?: number;
  /** شريط «c من N مؤشرات رسمية» — اختياري */
  progress?: { covered: number; total: number };
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="self-start h-9 px-1 inline-flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--t2)] cursor-pointer"
      >
        <i className="ti ti-arrow-right text-[16px]" />البنود
      </button>

      {/* بطاقة الرأس */}
      <div className="bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
        <div className="flex items-center gap-3">
          <span className="w-[46px] h-[46px] rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[24px] text-[var(--t2)] shrink-0">
            <i className={`ti ${icon}`} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] leading-[1.4]">{title}</h1>
            <div className="flex gap-1.5 mt-1">
              {level && <LevelBadge level={level} />}
              {evCount !== undefined && (
                <span className="inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold whitespace-nowrap text-[var(--t3)]">
                  {nEv(evCount)}
                </span>
              )}
            </div>
          </div>
        </div>
        {progress && (
          <div className="flex items-center gap-2.5 mt-3 text-[length:var(--fs-xs)] text-[var(--t3)]">
            <span className="shrink-0">{progress.covered} من {progress.total} مؤشرات رسمية</span>
            <div className="flex-1 h-1.5 rounded-[var(--r-full)] bg-[var(--s3)] overflow-hidden">
              <div
                className="h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-350"
                style={{ width: `${progress.total > 0 ? (progress.covered / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function SectionView({ section, evidence, onBack, onAddEvClick, onDeleteEv, onEditEv, sectionSummary, onToggleSummaryHidden, indicatorHandlers, highlight }: SectionViewProps) {
  const [menuEvId, setMenuEvId] = useState<string | null>(null);
  // المؤشرات المخصصة: قائمة ⋯ المفتوحة، والنموذج المفتوح (إضافة أو تعديل)، ونافذة الحذف
  const [menuIndId, setMenuIndId] = useState<string | null>(null);
  const [addingIndicator, setAddingIndicator] = useState(false);
  const [editIndId, setEditIndId] = useState<string | null>(null);
  const [deleteIndId, setDeleteIndId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuEvId && !menuIndId) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuEvId(null); setMenuIndId(null); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuEvId, menuIndId]);

  // كل شواهد القسم (section_id)، ثم شواهد كل مؤشر من الأحدث إلى الأقدم
  const sectionEvidence = evidence.filter(e => e.section_id === section.id);
  const byIndicator = (indicatorId: string) =>
    evidence
      .filter(e => e.indicator_id === indicatorId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  // الجاهزية ومستوى القسم من المؤشرات الرسمية فقط — المخصص لا يدخل فيهما
  const official = section.indicators.filter(ind => !ind.isCustom);
  const total = official.length;
  const covered = official.filter(ind => evidence.some(e => e.indicator_id === ind.id)).length;
  const n = sectionEvidence.length;
  const level = sectionLevel(covered, total, n);

  // التحفيز على الوصف — يُحسب من الشواهد الظاهرة في بطاقات المؤشرات، حتى يكون
  // الشاهد الذي يفتحه «أضف وصفاً» ظاهراً في الشاشة دائماً
  const visibleEvidence = section.indicators.flatMap(ind => byIndicator(ind.id));
  const undescribed = visibleEvidence.filter(noDesc);
  const describedCount = visibleEvidence.length - undescribed.length;
  const newestUndescribed = undescribed.reduce<SupabaseEvidence | null>(
    (best, e) => (!best || e.created_at > best.created_at ? e : best), null);

  const customs = section.indicators.filter(ind => ind.isCustom);
  const officialNames = official.map(ind => ind.name_ar);
  const customNamesExcept = (id?: string) => customs.filter(ind => ind.id !== id).map(ind => ind.name_ar);
  const deleteInd = deleteIndId ? customs.find(ind => ind.id === deleteIndId) ?? null : null;

  return (
    <div className="flex flex-col gap-3 pb-24 lg:pb-0">
      <SectionHeader
        onBack={onBack}
        icon={section.icon}
        title={section.ttl}
        level={level}
        evCount={n}
        progress={{ covered, total }}
      />

      {/* ملخص القسم — يظهر فقط إن وُجد ملخص */}
      {sectionSummary && (
        <div className={`bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4 flex flex-col gap-2 ${sectionSummary.hidden ? 'opacity-60' : ''}`}>
          <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">ملخص القسم في صفحتك العامة</span>
          <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">{sectionSummary.ai_sentence}</p>
          <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">
            يُحدَّث أسبوعياً من أوصاف شواهدك · آخر تحديث {formatDate(sectionSummary.generated_at)}
          </span>
          {sectionSummary.hidden && (
            <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">مخفي من صفحتك العامة</span>
          )}
          {onToggleSummaryHidden && (
            <button type="button" onClick={() => onToggleSummaryHidden(section.id)} className={BTN_SM}>
              {sectionSummary.hidden ? (
                <><i className="ti ti-eye text-[16px]" /> إظهار في صفحتي</>
              ) : (
                <><i className="ti ti-eye-off text-[16px]" /> إخفاء من صفحتي</>
              )}
            </button>
          )}
        </div>
      )}

      {/* سطر التحفيز — يظهر فقط إن كان في القسم شاهد بلا وصف */}
      {newestUndescribed && (
        <div className="bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4 flex gap-3">
          <i className="ti ti-pencil-plus text-[20px] text-[var(--info)] shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed">
              {nEv(undescribed.length)} بلا وصف.{' '}
              {describedCount < 2
                ? 'أضف وصفاً لشاهدين على الأقل ليُكتب ملخص هذا القسم في صفحتك العامة.'
                : 'الوصف يُظهر عملك بوضوح في صفحتك العامة.'}
            </p>
            <button type="button" onClick={() => onEditEv(section.id, newestUndescribed)} className={BTN_SM}>
              أضف وصفاً
            </button>
          </div>
        </div>
      )}

      {/* بطاقة لكل مؤشر */}
      {section.indicators.map(indicator => {
        const evs = byIndicator(indicator.id);
        const count = evs.length;
        // المخصص لا يبلغ «متجاوز» — indCard() في النموذج
        const st = indicator.isCustom
          ? (count > 0 ? 'g' : '')
          : (count >= 2 ? 'x' : count === 1 ? 'g' : '');

        // تعديل الاسم يحل محل البطاقة — indCard() في النموذج
        if (indicatorHandlers && indicator.isCustom && editIndId === indicator.id) {
          return (
            <IndicatorNameForm
              key={indicator.id}
              title="تعديل المؤشر"
              submitLabel="حفظ"
              initialName={indicator.name_ar}
              officialNames={officialNames}
              customNames={customNamesExcept(indicator.id)}
              onCancel={() => setEditIndId(null)}
              onSubmit={async name => {
                const r = await indicatorHandlers.onRenameIndicator(indicator.id, name);
                if (r.ok) setEditIndId(null);
                return r;
              }}
            />
          );
        }

        return (
          <div
            key={indicator.id}
            className={`rounded-[var(--r-md)] bg-[var(--s1)] border ${indicator.isCustom ? 'border-dashed border-[var(--bd2)]' : 'border-[var(--bd)]'}`}
          >
            <div className="relative flex items-center gap-2.5 py-3 px-3.5">
              <span
                className={`w-[26px] h-[26px] rounded-[var(--r-full)] shrink-0 flex items-center justify-center text-[14px] border-[1.5px] ${
                  st === 'x' ? 'border-[var(--st-gold)] bg-[var(--st-gold)] text-[var(--bg)]'
                  : st === 'g' ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]'
                  : 'border-[var(--idle)] text-[var(--t3)]'
                }`}
              >
                {count > 0 && <i className="ti ti-check" />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] leading-normal">{indicator.name_ar}</b>
                <small className="text-[length:var(--fs-xs)] text-[var(--t3)]">{indicator.isCustom && 'مؤشر مخصص · '}{nEv(count)}</small>
              </span>
              {indicatorHandlers && indicator.isCustom && (
                <button
                  type="button"
                  aria-label="خيارات المؤشر"
                  aria-expanded={menuIndId === indicator.id}
                  onClick={() => setMenuIndId(prev => (prev === indicator.id ? null : indicator.id))}
                  className="w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0 cursor-pointer"
                >
                  <i className="ti ti-dots" />
                </button>
              )}
              {menuIndId === indicator.id && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuIndId(null)} />
                  <div role="menu" className="absolute left-3.5 top-full mt-1 z-30 min-w-[140px] py-1 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--s2)]">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuIndId(null); setAddingIndicator(false); setEditIndId(indicator.id); }}
                      className="w-full h-9 px-3 flex items-center gap-2 text-right text-[length:var(--fs-sm)] font-bold text-[var(--t1)] cursor-pointer"
                    >
                      <i className="ti ti-pencil text-[16px]" /> تعديل الاسم
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuIndId(null); setDeleteIndId(indicator.id); }}
                      className="w-full h-9 px-3 flex items-center gap-2 text-right text-[length:var(--fs-sm)] font-bold text-[var(--danger)] cursor-pointer"
                    >
                      <i className="ti ti-trash text-[16px]" /> حذف المؤشر
                    </button>
                  </div>
                </>
              )}
              <button
                type="button"
                aria-label="إضافة شاهد لهذا المؤشر"
                onClick={() => onAddEvClick(section.id, indicator.name_ar, undefined, indicator.id)}
                className="w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[20px] text-[var(--accent)] shrink-0 cursor-pointer"
              >
                <i className="ti ti-plus" />
              </button>
            </div>

            {count > 0 && (
              <div className="border-t border-[var(--bd)] divide-y divide-[var(--bd)]">
                {evs.map(ev => (
                  <EvRow
                    key={ev.id}
                    ev={ev}
                    menuOpen={menuEvId === ev.id}
                    onToggleMenu={() => setMenuEvId(prev => (prev === ev.id ? null : ev.id))}
                    onCloseMenu={() => setMenuEvId(null)}
                    onEdit={() => onEditEv(section.id, ev)}
                    onDelete={() => onDeleteEv(ev.id)}
                    highlight={highlight}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* المؤشرات المخصصة — secView() في النموذج */}
      {indicatorHandlers && (
        <>
          {customs.length > 0 && (
            <p className="px-1 text-[length:var(--fs-xs)] text-[var(--t3)]">
              مؤشرات مخصصة: {customs.length} من {CUSTOM_INDICATOR_LIMIT}
            </p>
          )}
          {customs.length >= CUSTOM_INDICATOR_LIMIT ? (
            <p className="px-1 text-[length:var(--fs-sm)] text-[var(--t3)]">{CUSTOM_LIMIT_MSG}</p>
          ) : addingIndicator ? (
            <IndicatorNameForm
              title="مؤشر مخصص جديد"
              submitLabel="إضافة المؤشر"
              officialNames={officialNames}
              customNames={customNamesExcept()}
              onCancel={() => setAddingIndicator(false)}
              onSubmit={async name => {
                const r = await indicatorHandlers.onAddIndicator(section.id, name);
                if (r.ok) setAddingIndicator(false);
                return r;
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setEditIndId(null); setAddingIndicator(true); }}
              className="w-full h-11 rounded-[var(--r-md)] border-[1.5px] border-dashed border-[var(--bd2)] text-[length:var(--fs-sm)] font-bold text-[var(--t2)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <i className="ti ti-plus text-[16px]" />إضافة مؤشر مخصص
            </button>
          )}
          <p className="px-1 text-[length:var(--fs-xs)] text-[var(--t3)] leading-relaxed">
            المؤشر المخصص لا يدخل في نسبة الجاهزية، وشواهده تُحسب في عداد الشهر وتظهر في صفحتك العامة.
          </p>
        </>
      )}

      {indicatorHandlers && deleteInd && (
        <DeleteIndicatorDialog
          indicator={deleteInd}
          evidenceCount={byIndicator(deleteInd.id).length}
          targets={section.indicators.filter(ind => ind.id !== deleteInd.id)}
          onCancel={() => setDeleteIndId(null)}
          onConfirm={(mode, toId) => {
            const n = byIndicator(deleteInd.id).length;
            setDeleteIndId(null);
            indicatorHandlers.onDeleteIndicator(deleteInd.id, mode, toId, n);
          }}
        />
      )}
    </div>
  );
}

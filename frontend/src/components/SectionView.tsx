import { useEffect, useState } from 'react';
import type { SectionData } from '../types';
import type { SupabaseEvidence, EvidenceType } from '../hooks/useSupabaseEvidence';
import { formatDate } from '../utils';

// شاشة قسم عادي واحد — مطابقة لـ secView()/indCard()/evRow() في
// docs/design/wathq-prototype.html. المصدر الوحيد للشواهد جدول evidence
// مجمّعة حسب indicator_id، والمؤشرات من section_indicators (sec.indicators).

type Level = 'n' | 'p' | 'g' | 'x';

const LEVEL_LABEL: Record<Level, string> = { n: 'لم يبدأ', p: 'جارٍ', g: 'أساسي', x: 'متجاوز' };
const LEVEL_COLOR: Record<Level, string> = { n: 'var(--t3)', p: 'var(--prog)', g: 'var(--accent)', x: 'var(--st-gold)' };

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

const TYPE_ICON: Record<EvidenceType, string> = {
  image: 'ti-photo', file: 'ti-file-text', link: 'ti-link',
  note: 'ti-notes', audio: 'ti-microphone', video: 'ti-player-play',
};
const TYPE_LABEL: Record<EvidenceType, string> = {
  image: 'صورة', file: 'ملف', link: 'رابط',
  note: 'ملاحظة', audio: 'تسجيل صوتي', video: 'فيديو',
};

type AiSummary = { ai_sentence: string; generated_at: string };

/** كتلتا الذكاء الاصطناعي لبند 6 (إعداد خطة التعلم) — منطقهما وحالاتهما في
 *  Dashboard.tsx كما كانا، وهنا العرض فقط. */
export interface LessonPlanAiProps {
  sectionSummary: AiSummary | null;
  sectionSummaryBusy: boolean;
  lessonPlanHasEvidence: boolean;
  sectionSummaryUpdateAvailable: boolean;
  onGenerateSectionSummary: () => void;
  lessonPlanIndicatorIds: string[];
  indicatorSummaries: Record<string, AiSummary>;
  indicatorSummaryCooldown: Record<string, boolean>;
  onGenerateIndicatorSummary: (indicatorId: string) => void;
}

interface SectionViewProps {
  section: SectionData;
  evidence: SupabaseEvidence[];
  onBack: () => void;
  onAddEvClick: (sid: number, sub: string, strategyId?: string, indicatorId?: string) => void;
  onDeleteEv: (evidenceId: string) => void;
  lessonPlanAi?: LessonPlanAiProps;
}

const AI_BTN = 'h-9 px-3 inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[length:var(--fs-sm)] font-bold text-[var(--t1)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

function AiControls({ busy, hasEvidence, updateAvailable, onGenerate, sentence }: {
  busy: boolean; hasEvidence: boolean; updateAvailable: boolean; onGenerate: () => void; sentence?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={onGenerate} disabled={busy || !hasEvidence} className={AI_BTN}>
          {busy ? (
            <><i className="ti ti-loader motion-safe:animate-spin text-[16px]" /> جارٍ التوليد...</>
          ) : (
            <><i className="ti ti-sparkles text-[16px]" /> ولّد الملخص</>
          )}
        </button>
        {updateAvailable && !busy && (
          <span className="inline-flex items-center gap-1 text-[length:var(--fs-xs)] font-bold text-[var(--info)]">
            <span className="w-1.5 h-1.5 rounded-[var(--r-full)] bg-[var(--info)]" /> تحديث متاح
          </span>
        )}
        {!hasEvidence && !busy && (
          <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">أضف دليلاً أولاً لتوليد الملخص</span>
        )}
      </div>
      {sentence && (
        <div className="text-[length:var(--fs-sm)] text-[var(--t2)] bg-[var(--s2)] rounded-[var(--r-sm)] py-2 px-3 leading-relaxed">
          <i className="ti ti-sparkles text-[var(--t3)] ml-1.5" />{sentence}
        </div>
      )}
    </div>
  );
}

function EvRow({ ev, menuOpen, onToggleMenu, onCloseMenu, onDelete }: {
  ev: SupabaseEvidence; menuOpen: boolean; onToggleMenu: () => void; onCloseMenu: () => void; onDelete: () => void;
}) {
  const url = ev.file_url ?? ev.link_url ?? undefined;
  const content = (
    <>
      <span className="w-8 h-8 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[16px] text-[var(--t2)] shrink-0">
        <i className={`ti ${TYPE_ICON[ev.evidence_type] ?? 'ti-file-text'}`} />
      </span>
      <span className="min-w-0 flex-1 text-right">
        <b dir="auto" className="block font-normal text-[length:var(--fs-sm)] text-[var(--t1)] whitespace-nowrap overflow-hidden text-ellipsis">{ev.title}</b>
        <small className="block text-[length:var(--fs-xs)] text-[var(--t3)]">
          {TYPE_LABEL[ev.evidence_type] ?? 'ملف'} · {formatDate(ev.created_at)}
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

export default function SectionView({ section, evidence, onBack, onAddEvClick, onDeleteEv, lessonPlanAi }: SectionViewProps) {
  const [menuEvId, setMenuEvId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuEvId) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuEvId(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuEvId]);

  // كل شواهد القسم (section_id)، ثم شواهد كل مؤشر من الأحدث إلى الأقدم
  const sectionEvidence = evidence.filter(e => e.section_id === section.id);
  const byIndicator = (indicatorId: string) =>
    evidence
      .filter(e => e.indicator_id === indicatorId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  const total = section.indicators.length;
  const covered = section.indicators.filter(ind => evidence.some(e => e.indicator_id === ind.id)).length;
  const n = sectionEvidence.length;
  const level = sectionLevel(covered, total, n);

  return (
    <div className="flex flex-col gap-3 max-w-3xl pb-24 md:pb-0">
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
            <i className={`ti ${section.icon}`} />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] leading-[1.4]">{section.ttl}</h1>
            <div className="flex gap-1.5 mt-1">
              <span
                className="inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold whitespace-nowrap"
                style={{ color: LEVEL_COLOR[level] }}
              >
                {LEVEL_LABEL[level]}
              </span>
              <span className="inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold whitespace-nowrap text-[var(--t3)]">
                {nEv(n)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 mt-3 text-[length:var(--fs-xs)] text-[var(--t3)]">
          <span className="shrink-0">{covered} من {total} مؤشرات رسمية</span>
          <div className="flex-1 h-1.5 rounded-[var(--r-full)] bg-[var(--s3)] overflow-hidden">
            <div
              className="h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-350"
              style={{ width: `${total > 0 ? (covered / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* ملخص ذكاء اصطناعي لبند 6 كاملاً — لا يظهر قبل أول شاهد في القسم */}
      {lessonPlanAi && lessonPlanAi.lessonPlanHasEvidence && (
        <div className="bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] p-4">
          <AiControls
            busy={lessonPlanAi.sectionSummaryBusy}
            hasEvidence={lessonPlanAi.lessonPlanHasEvidence}
            updateAvailable={lessonPlanAi.sectionSummaryUpdateAvailable}
            onGenerate={lessonPlanAi.onGenerateSectionSummary}
            sentence={lessonPlanAi.sectionSummary?.ai_sentence}
          />
        </div>
      )}

      {/* بطاقة لكل مؤشر */}
      {section.indicators.map(indicator => {
        const evs = byIndicator(indicator.id);
        const count = evs.length;
        const st = count >= 2 ? 'x' : count === 1 ? 'g' : '';

        // حسابات زر «ولّد الملخص» لكل مؤشر — منقولة كما هي من Dashboard.tsx
        const lessonPlanIndicatorId = lessonPlanAi
          ? lessonPlanAi.lessonPlanIndicatorIds.find(id => id === indicator.id)
          : undefined;
        const indicatorEvidence = lessonPlanIndicatorId
          ? evidence.filter(e => e.indicator_id === lessonPlanIndicatorId)
          : [];
        const indicatorHasEvidence = indicatorEvidence.length > 0;
        const indicatorSummaryRow = lessonPlanIndicatorId ? lessonPlanAi?.indicatorSummaries[lessonPlanIndicatorId] : undefined;
        const indicatorLatestEvidenceAt = indicatorHasEvidence
          ? indicatorEvidence.reduce((max, e) => (e.created_at > max ? e.created_at : max), indicatorEvidence[0].created_at)
          : null;
        const indicatorUpdateAvailable =
          !!indicatorSummaryRow && !!indicatorLatestEvidenceAt && indicatorLatestEvidenceAt > indicatorSummaryRow.generated_at;
        const indicatorSummaryBusy = !!(lessonPlanIndicatorId && lessonPlanAi?.indicatorSummaryCooldown[lessonPlanIndicatorId]);

        return (
          <div key={indicator.id} className="rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)]">
            <div className="flex items-center gap-2.5 py-3 px-3.5">
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
                <small className="text-[length:var(--fs-xs)] text-[var(--t3)]">{nEv(count)}</small>
              </span>
              <button
                type="button"
                aria-label="إضافة شاهد لهذا المؤشر"
                onClick={() => onAddEvClick(section.id, indicator.name_ar, undefined, indicator.id)}
                className="w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[20px] text-[var(--accent)] shrink-0 cursor-pointer"
              >
                <i className="ti ti-plus" />
              </button>
            </div>

            {/* لا يظهر زر المؤشر قبل أول شاهد له */}
            {lessonPlanIndicatorId && lessonPlanAi && indicatorHasEvidence && (
              <div className="px-3.5 pb-3">
                <AiControls
                  busy={indicatorSummaryBusy}
                  hasEvidence={indicatorHasEvidence}
                  updateAvailable={indicatorUpdateAvailable}
                  onGenerate={() => lessonPlanAi.onGenerateIndicatorSummary(lessonPlanIndicatorId)}
                  sentence={indicatorSummaryRow?.ai_sentence}
                />
              </div>
            )}

            {count > 0 && (
              <div className="border-t border-[var(--bd)] divide-y divide-[var(--bd)]">
                {evs.map(ev => (
                  <EvRow
                    key={ev.id}
                    ev={ev}
                    menuOpen={menuEvId === ev.id}
                    onToggleMenu={() => setMenuEvId(prev => (prev === ev.id ? null : ev.id))}
                    onCloseMenu={() => setMenuEvId(null)}
                    onDelete={() => onDeleteEv(ev.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

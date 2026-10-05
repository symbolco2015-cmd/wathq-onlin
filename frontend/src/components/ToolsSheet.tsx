import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { BTN_SM, BTN_GH_SM } from './SectionView';

/** شهر سابق في الأرشيف — label اسم الشهر بالعربية */
export type ArchiveMonth = { year: number; month: number; label: string };

type ToolsSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  /** حالة ملخص الملف العام كما يحسبها Dashboard (summaryHelperText وsummaryButtonDisabled) */
  summaryHelperText: string | null;
  summaryButtonDisabled: boolean;
  summaryRefreshBusy: boolean;
  onRefreshSummary: () => void;
  onOpenHarvest: () => void;
  /** غير معرّف = لا قسم تحليل نتائج، فيُخفى العنصر */
  onOpenAnalysis?: () => void;
  /** غير معرّف = علم bulk_import غير مفعّل، فيُخفى العنصر */
  onOpenBulkImport?: () => void;
  archiveMonths: ArchiveMonth[];
  onPickArchiveMonth: (m: ArchiveMonth) => void;
};

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

const ROW = 'w-full min-h-11 flex items-center gap-3 p-2 rounded-[var(--r-sm)] text-right';
const ROW_BTN = `${ROW} cursor-pointer hover:bg-[var(--s2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`;

function RowContent({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <>
      <span className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[20px] text-[var(--t2)]">
        <i className={`ti ${icon}`} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{title}</span>
        <span className="block text-[length:var(--fs-xs)] text-[var(--t3)]">{sub}</span>
      </span>
    </>
  );
}

/** قائمة «أدوات»: ورقة سفلية في الجوال، ولوحة منسدلة تحت الشريط العلوي فيما عداه */
export default function ToolsSheet({
  isOpen, onClose,
  summaryHelperText, summaryButtonDisabled, summaryRefreshBusy, onRefreshSummary,
  onOpenHarvest, onOpenAnalysis, onOpenBulkImport,
  archiveMonths, onPickArchiveMonth,
}: ToolsSheetProps) {
  const isMobile = useIsMobile();
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen) { setArchiveExpanded(false); return; }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const hasArchive = archiveMonths.length > 0;

  const list = (
    <div className="flex flex-col gap-1">
      {/* ملخص الملف العام — الزر لا يغلق القائمة */}
      <div className={`${ROW} items-start`}>
        <span className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[20px] text-[var(--t2)]">
          <i className="ti ti-sparkles" />
        </span>
        <div className="flex-1 min-w-0 flex flex-col items-start gap-2">
          <div>
            <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">ملخص الملف العام</div>
            <div className="text-[length:var(--fs-xs)] text-[var(--t3)]">
              {summaryHelperText ?? 'ملخص وأبرز إنجاز بالذكاء الاصطناعي لصفحة المشاركة'}
            </div>
          </div>
          <button
            type="button"
            onClick={onRefreshSummary}
            disabled={summaryButtonDisabled}
            className={`${BTN_SM} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {summaryRefreshBusy ? (
              <><i className="ti ti-loader animate-spin text-[16px]" /> جارٍ التحديث...</>
            ) : (
              <><i className="ti ti-refresh text-[16px]" /> تحديث الملخص الآن</>
            )}
          </button>
        </div>
      </div>

      <button type="button" className={ROW_BTN} onClick={onOpenHarvest}>
        <RowContent icon="ti-file-report" title="تقرير حصاد فصلي" sub="تقرير قابل للطباعة لفترة تختارها" />
      </button>

      {onOpenAnalysis && (
        <button type="button" className={ROW_BTN} onClick={onOpenAnalysis}>
          <RowContent icon="ti-chart-bar" title="تحليل النتائج" sub="رفع كشوف الدرجات ومقارنتها" />
        </button>
      )}

      {onOpenBulkImport && (
        <button type="button" className={ROW_BTN} onClick={onOpenBulkImport}>
          <RowContent icon="ti-photo-up" title="استيراد جماعي" sub="رفع عدة ملفات وتصنيفها تلقائياً" />
        </button>
      )}

      <button
        type="button"
        className={ROW_BTN}
        disabled={!hasArchive}
        aria-expanded={archiveExpanded}
        onClick={() => setArchiveExpanded(v => !v)}
      >
        <RowContent
          icon="ti-archive"
          title="أرشيف الأشهر السابقة"
          sub={hasArchive ? `${archiveMonths.length} شهر سابق` : 'لا أشهر سابقة بعد'}
        />
        {hasArchive && (
          <i className={`ti ti-chevron-down text-[16px] text-[var(--t3)] transition-transform duration-250 ${archiveExpanded ? 'rotate-180' : ''}`} />
        )}
      </button>
      {archiveExpanded && hasArchive && (
        <div className="ps-8 flex flex-col gap-1 max-h-56 overflow-y-auto">
          {archiveMonths.map(m => (
            <button
              key={`${m.year}-${m.month}`}
              type="button"
              onClick={() => onPickArchiveMonth(m)}
              className="h-9 px-3 text-right rounded-[var(--r-sm)] text-[length:var(--fs-sm)] text-[var(--t2)] hover:bg-[var(--s2)] hover:text-[var(--t1)] cursor-pointer"
            >
              {m.label} {m.year}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--bd)] shrink-0">
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">أدوات</div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className={`${BTN_GH_SM} w-11 h-11 px-0`}>
            <i className="ti ti-x text-[20px]" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 pb-6">{list}</div>
      </BottomSheet>
    );
  }

  if (!isOpen) return null;
  return (
    <>
      {/* فوق الشريط العلوي (z-[300]) حتى يغلق الضغطُ على أي مكان القائمةَ، بما فيه زر «أدوات» */}
      <div className="fixed inset-0 z-[310]" onClick={onClose} />
      <div
        role="dialog"
        aria-label="أدوات"
        className="fixed z-[320] top-[80px] left-4 sm:left-9 w-[320px] max-h-[calc(100vh-96px)] overflow-y-auto p-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s1)]"
        style={{ animation: 'scaleIn .25s var(--sp) both', transformOrigin: 'top left' }}
      >
        {list}
      </div>
    </>
  );
}

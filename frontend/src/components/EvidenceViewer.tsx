// نافذة العرض الموحّدة — .lb في pub() بـ docs/design/wathq-prototype.html.
// تستعملها الصفحة العامة (نافذة البند، والبطاقات الخاصة، و«أبرز إنجاز»، ومعرض «لمحات»)،
// وصفوف الشواهد في لوحة المعلم (EvRow).
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { AR_FILE, extensionFromUrl, plusCountWord } from '../utils';
import PdfPreview, { PdfPreviewFallback } from './PdfPreview';
import { BTN_PRI, BTN_SM } from './SectionView';

/** نوع العرض في الصفحة العامة، من evidence_type الأصلي وحقلي الملف والرابط —
 *  أدق من Evidence['type'] (supabaseEvidenceTypeToLocal) الذي يجعل الرابط
 *  والصوت والملاحظة كلها 'doc'. */
export type PublicKind = 'pdf' | 'img' | 'vid' | 'audio' | 'link' | 'note';

export function publicKind(e: SupabaseEvidence): PublicKind {
  if (!e.file_url) return e.link_url ? 'link' : 'note';
  if (e.evidence_type === 'image') return 'img';
  if (e.evidence_type === 'video') return 'vid';
  if (e.evidence_type === 'audio') return 'audio';
  return 'pdf';
}

/** يستخرج معرّف فيديو يوتيوب من أي صيغة رابط شائعة (watch؟v=, youtu.be/, embed/, shorts/)،
 * أو null إن لم يكن رابط يوتيوب صالحاً — يُستخدم لبناء مصغّرة img.youtube.com. */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(embed|shorts)\/([^/?]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

/** امتدادات مستندات Office — تميّزها عن PDF ضمن شواهد النوع 'file' (كلاهما
 * kind 'pdf')، فالتمييز الفعلي بالامتداد الحقيقي في الرابط عبر extensionFromUrl. */
const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

/** ملف واحد من ملفات الشاهد في نافذة العرض (يبنيه toEvRow في indicators.ts) */
export type ViewerFile = { kind: 'img' | 'pdf'; url: string; name?: string };

/** عنصر عرض واحد. url غائب للملاحظة فقط. meta: سطر «البند · التاريخ» تحت المحتوى.
 *  files: كل ملفات الشاهد (الغلاف أولاً) — أكثر من ملف ⇐ تنقل بينها. */
export type ViewerItem = { kind: PublicKind; name: string; url?: string; description?: string | null; meta?: string; files?: ViewerFile[] };

/** شارة «+N» لعدد الملفات بعد الغلاف. overlay: فوق صورة (خلفية داكنة شفافة) */
export function ExtraFilesBadge({ n, overlay = false }: { n: number; overlay?: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={`+${n} ${plusCountWord(n, AR_FILE)}`}
      className={overlay
        ? 'absolute top-2 left-2 rounded-[var(--r-full)] bg-black/45 px-2 py-0.5 text-[length:var(--fs-xs)] font-bold text-[var(--t1)] print:hidden'
        : 'inline-flex shrink-0 items-center rounded-[var(--r-full)] bg-[var(--s2)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold whitespace-nowrap text-[var(--t2)] print:hidden'}
    >
      <bdi dir="ltr">+{n}</bdi>
    </span>
  );
}

/** سطر الطباعة فقط: «+4 ملفات» — الطباعة تعرض الغلاف وحده */
export function ExtraFilesPrintLine({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="hidden print:block mt-1 text-[length:var(--fs-xs)] text-[var(--t2)]">
      <bdi dir="ltr">+{n}</bdi> {plusCountWord(n, AR_FILE)}
    </span>
  );
}

function YouTubeEmbed({ ytId, title }: { ytId: string; title: string }) {
  return (
    <div className="w-full aspect-video rounded-[var(--r-md)] overflow-hidden">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${ytId}`}
        className="w-full h-full border-none"
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

/** صورة أو فيديو تعذّر تحميله — رسالة هادئة بلا أحمر، فليس خطأ من المعلم */
function MediaFailed({ url }: { url: string }) {
  return (
    <div className="w-full max-w-md text-center p-6 rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)]">
      <div className="w-12 h-12 rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center mx-auto mb-4">
        <i className="ti ti-photo-off text-[24px]"></i>
      </div>
      <p className="text-[length:var(--fs-sm)] text-[var(--t2)]">تعذّر عرض الملف.</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className={`${BTN_SM} mt-4 no-underline`}>
          <i className="ti ti-external-link text-[16px]"></i>
          فتح الملف
        </a>
      )}
    </div>
  );
}

const ICON_BTN = 'w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t1)] cursor-pointer';

/** علامة مدخل النافذة في history.state — رمز فريد لكل فتح، لا true: مدخل قديم
 *  بقي بعد تحديث الصفحة (F5) لا يُخلط بالنافذة المفتوحة الآن */
const VIEWER_STATE_KEY = 'wathqViewer';
const viewerToken = () => (window.history.state as Record<string, unknown> | null)?.[VIEWER_STATE_KEY];
/** نسخة من المدخل الحالي (بكل علاماته: الشاشة، والتحليل المفتوح…) مع علامة
 *  النافذة. wathqDepth (شاشات Dashboard) يزيد واحداً إن وُجد، فيبقى
 *  «البنود» (go(-depth)) صحيحاً. في الصفحة العامة لا wathqDepth، والرابط
 *  (?share=) لا يتغير لأن pushState بلا رابط. */
function pushViewerEntry(token: string) {
  const st = (window.history.state ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...st, [VIEWER_STATE_KEY]: token };
  if (typeof st.wathqDepth === 'number') next.wathqDepth = st.wathqDepth + 1;
  window.history.pushState(next, '');
}

export default function EvidenceViewer({ item, onClose }: { item: ViewerItem | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const open = item !== null;
  // رابط الوسيط الذي تعذّر تحميله — يسقط تلقائياً إن تغيّر العنصر
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // رمز مدخل السجل لهذا الفتح؛ null = لا مدخل (مغلقة، أو أُزيل المدخل)
  const tokenRef = useRef<string | null>(null);
  // الملف المعروض من ملفات الشاهد — يعود إلى الأول مع كل عنصر جديد
  const [fileIdx, setFileIdx] = useState(0);
  // المفتاح نصي لا الكائن نفسه: بعض المستدعين يبنون item جديداً مع كل رسم
  const itemKey = item ? `${item.name}|${item.url ?? ''}|${item.meta ?? ''}` : '';
  const [idxKey, setIdxKey] = useState(itemKey);
  if (idxKey !== itemKey) { setIdxKey(itemKey); setFileIdx(0); }
  const files = item?.files && item.files.length > 1 ? item.files : null;
  const fileCount = files?.length ?? 0;
  /** dir: +1 التالي، -1 السابق — بلا التفاف */
  const stepRef = useRef((_dir: number) => {});
  stepRef.current = (dir: number) => {
    if (fileCount < 2) return;
    setFileIdx(i => Math.min(fileCount - 1, Math.max(0, i + dir)));
  };
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  // مدخل في السجل للنافذة: زر الرجوع (أندرويد أو المتصفح) يغلقها وحدها.
  // مرة واحدة لكل فتح — StrictMode يكرر الأثر، فالحارس tokenRef
  useEffect(() => {
    if (!open) { tokenRef.current = null; return; }
    if (!tokenRef.current) {
      tokenRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pushViewerEntry(tokenRef.current);
    }
    const onPopState = () => {
      if (tokenRef.current && viewerToken() !== tokenRef.current) {
        tokenRef.current = null;
        onCloseRef.current();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [open]);

  /** ✕ والضغط خارج المحتوى وEsc: عبر السجل إن كان مدخل النافذة في أعلاه، فلا
   *  يبقى مدخل يتيم — والإغلاق الفعلي في popstate أعلاه */
  const requestCloseRef = useRef(() => {});
  requestCloseRef.current = () => {
    if (tokenRef.current && viewerToken() === tokenRef.current) window.history.back();
    else { tokenRef.current = null; onCloseRef.current(); }
  };
  const requestClose = () => requestCloseRef.current();

  // Esc يغلق، والتركيز يعود للعنصر الذي فتح النافذة
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    // الأسهم بحسب RTL: ← التالي، → السابق
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestCloseRef.current();
      else if (e.key === 'ArrowLeft') stepRef.current(1);
      else if (e.key === 'ArrowRight') stepRef.current(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, [open]);

  if (!item) return null;

  // شاهد بعدة ملفات: الملف الحالي يحدد النوع والرابط، والعنوان والوصف للشاهد كله
  const cur = files ? files[Math.min(fileIdx, fileCount - 1)] : null;
  const kind: PublicKind = cur ? cur.kind : item.kind;
  const url = cur ? cur.url : item.url ?? '';
  const fileName = cur?.name || item.name;
  // رابط يوتيوب يُضمَّن، وأي رابط آخر بطاقة فيها «فتح الرابط» (تبويب جديد)
  const ytId = kind !== 'img' && url ? extractYouTubeId(url) : null;
  const isPlainLink = kind === 'link' && !!url && !ytId;
  // kind 'pdf' يشمل PDF وOffice معاً، فيُختار فرعه من الامتداد الحقيقي
  const ext = kind === 'pdf' ? extensionFromUrl(url) : '';
  const isPdf = !ytId && ext === 'pdf';
  const isOfficeDoc = !ytId && OFFICE_EXTENSIONS.includes(ext);
  // حارس أخير: ملف بامتداد غير pdf وغير Office ⇐ بطاقة فشل عامة بدل نافذة فارغة
  const isUnknownFile = !ytId && kind === 'pdf' && !isPdf && !isOfficeDoc;
  const wide = isPdf || !!ytId;
  const canDownload = !!url && kind !== 'link' && kind !== 'note';
  const pos = files ? Math.min(fileIdx, fileCount - 1) : 0;
  const counter = files ? `${pos + 1} من ${fileCount}` : '';
  // السحب أفقياً (RTL): يميناً ⇐ التالي، يساراً ⇐ السابق
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    if (!files || !start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) stepRef.current(dx > 0 ? 1 : -1);
  };
  const prevBtn = files && (
    <button type="button" className={`${ICON_BTN} disabled:opacity-40 disabled:cursor-not-allowed`} onClick={() => stepRef.current(-1)} disabled={pos === 0} aria-label="الملف السابق">
      <i className="ti ti-chevron-right text-[20px]"></i>
    </button>
  );
  const nextBtn = files && (
    <button type="button" className={`${ICON_BTN} disabled:opacity-40 disabled:cursor-not-allowed`} onClick={() => stepRef.current(1)} disabled={pos === fileCount - 1} aria-label="الملف التالي">
      <i className="ti ti-chevron-left text-[20px]"></i>
    </button>
  );
  const mediaFailed = !!url && failedUrl === url;
  const onMediaError = () => setFailedUrl(url);
  const showDescription = item.kind !== 'note' && !!item.description?.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-viewer-title"
      className="fixed inset-0 z-[450] bg-black/90 flex flex-col overflow-y-auto"
      onClick={requestClose}
    >
      <div className="flex items-center gap-3 px-4 py-3" onClick={e => e.stopPropagation()}>
        <div className="flex-1 min-w-0">
          <h3 id="evidence-viewer-title" className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] truncate">{item.name}</h3>
          <p className="text-[length:var(--fs-xs)] text-[var(--t3)]">معاينة الشاهد{counter && ` · ${counter}`}</p>
        </div>
        {canDownload && (
          <a href={url} download={fileName} target="_blank" rel="noopener noreferrer" className={ICON_BTN} aria-label="تحميل" title="تحميل">
            <i className="ti ti-download text-[20px]"></i>
          </a>
        )}
        <button ref={closeRef} type="button" className={ICON_BTN} onClick={requestClose} aria-label="إغلاق">
          <i className="ti ti-x text-[20px]"></i>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6">
        <div className={`w-full ${wide ? 'max-w-[768px]' : 'max-w-[640px]'}`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {files && <span className="hidden lg:block shrink-0">{prevBtn}</span>}
            <div key={url} className="min-w-0 flex-1 flex items-center justify-center">
            {mediaFailed && <MediaFailed url={url} />}

            {kind === 'img' && !mediaFailed && (
              <img src={url} alt={item.name} onError={onMediaError} className="max-w-full max-h-[65vh] object-contain rounded-[var(--r-md)]" />
            )}

            {ytId && <YouTubeEmbed ytId={ytId} title={item.name} />}

            {isPlainLink && (
              <div className="w-full max-w-md text-center p-6 rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)]">
                <div className="w-12 h-12 rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center mx-auto mb-4">
                  <i className="ti ti-link text-[24px]"></i>
                </div>
                <p dir="ltr" className="text-[length:var(--fs-sm)] text-[var(--t2)] break-all">{url}</p>
                <a href={url} target="_blank" rel="noopener noreferrer" className={`${BTN_SM} mt-4 no-underline`}>
                  <i className="ti ti-external-link text-[16px]"></i>
                  فتح الرابط
                </a>
              </div>
            )}

            {isPdf && <PdfPreview url={url} name={fileName} className="w-full h-[65vh]" />}

            {isOfficeDoc && (
              <div className="w-full text-center p-6 bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)]">
                <div className="w-12 h-12 rounded-[var(--r-sm)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center mx-auto mb-4">
                  <i className="ti ti-file-text text-[24px]"></i>
                </div>
                <h4 className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] mb-2">معاينة هذا المستند غير متوفرة مباشرة</h4>
                <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed mb-4">
                  هذا مستند Word أو Excel أو PowerPoint. حمّله لتستعرض محتواه كاملاً على جهازك.
                </p>
                <div className="flex justify-center">
                  <a href={url} download={fileName} target="_blank" rel="noopener noreferrer" className={`${BTN_PRI} flex-none no-underline`}>
                    <i className="ti ti-download text-[20px]"></i>
                    تحميل مستند الشاهد
                  </a>
                </div>
              </div>
            )}

            {isUnknownFile && <PdfPreviewFallback url={url} name={fileName} />}

            {kind === 'vid' && !ytId && !mediaFailed && (
              <video src={url} controls onError={onMediaError} className="max-w-full max-h-[65vh] rounded-[var(--r-md)] bg-black" />
            )}

            {kind === 'audio' && url && <audio src={url} controls className="w-full" />}

            {item.kind === 'note' && (
              item.description?.trim()
                ? <p className="w-full text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed whitespace-pre-line">{item.description}</p>
                : <p className="w-full text-[length:var(--fs-sm)] text-[var(--t3)]">لا يوجد وصف</p>
            )}
            </div>
            {files && <span className="hidden lg:block shrink-0">{nextBtn}</span>}
          </div>

          {files && (
            <div className="lg:hidden mt-3 flex items-center justify-center gap-4">
              {prevBtn}
              <span className="text-[length:var(--fs-xs)] text-[var(--t2)]">{counter}</span>
              {nextBtn}
            </div>
          )}

          {(showDescription || item.meta) && (
            <div className="mt-3">
              {showDescription && (
                <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed whitespace-pre-line">{item.description}</p>
              )}
              {item.meta && <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--t3)]">{item.meta}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// نافذة العرض الموحّدة للصفحة العامة — .lb في pub() بـ docs/design/wathq-prototype.html.
// تستعملها نافذة البند، والبطاقات الخاصة، و«أبرز إنجاز»، ومعرض «لمحات».
import { useEffect, useRef } from 'react';
import type { SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { extensionFromUrl } from '../utils';
import PdfPreview, { PdfPreviewFallback } from './PdfPreview';
import { BTN_PRI } from './SectionView';

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
export const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

/** عنصر عرض واحد. url غائب للملاحظة فقط. meta: سطر «البند · التاريخ» تحت المحتوى. */
export type ViewerItem = { kind: PublicKind; name: string; url?: string; description?: string | null; meta?: string };

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

const ICON_BTN = 'w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t1)] cursor-pointer';

export default function EvidenceViewer({ item, onClose }: { item: ViewerItem | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const open = item !== null;

  // Esc يغلق، والتركيز يعود للعنصر الذي فتح النافذة
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, [open]);

  if (!item) return null;

  const url = item.url ?? '';
  // الرابط الوحيد الذي يصل هنا يوتيوب (غيره يُفتح في تبويب جديد)
  const ytId = item.kind !== 'img' && url ? extractYouTubeId(url) : null;
  // kind 'pdf' يشمل PDF وOffice معاً، فيُختار فرعه من الامتداد الحقيقي
  const ext = item.kind === 'pdf' ? extensionFromUrl(url) : '';
  const isPdf = !ytId && ext === 'pdf';
  const isOfficeDoc = !ytId && OFFICE_EXTENSIONS.includes(ext);
  // حارس أخير: ملف بامتداد غير pdf وغير Office ⇐ بطاقة فشل عامة بدل نافذة فارغة
  const isUnknownFile = !ytId && item.kind === 'pdf' && !isPdf && !isOfficeDoc;
  const wide = isPdf || !!ytId;
  const canDownload = !!item.url && item.kind !== 'link' && item.kind !== 'note';
  const showDescription = item.kind !== 'note' && !!item.description?.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-viewer-title"
      className="fixed inset-0 z-[450] bg-black/90 flex flex-col overflow-y-auto"
      onClick={onClose}
    >
      <div className="flex items-center gap-3 px-4 py-3" onClick={e => e.stopPropagation()}>
        <div className="flex-1 min-w-0">
          <h3 id="evidence-viewer-title" className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] truncate">{item.name}</h3>
          <p className="text-[length:var(--fs-xs)] text-[var(--t3)]">معاينة الشاهد</p>
        </div>
        {canDownload && (
          <a href={item.url} download={item.name} target="_blank" rel="noreferrer" className={ICON_BTN} aria-label="تحميل" title="تحميل">
            <i className="ti ti-download text-[20px]"></i>
          </a>
        )}
        <button ref={closeRef} type="button" className={ICON_BTN} onClick={onClose} aria-label="إغلاق">
          <i className="ti ti-x text-[20px]"></i>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6">
        <div className={`w-full ${wide ? 'max-w-[768px]' : 'max-w-[640px]'}`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center">
            {item.kind === 'img' && (
              <img src={url} alt={item.name} className="max-w-full max-h-[65vh] object-contain rounded-[var(--r-md)]" />
            )}

            {ytId && <YouTubeEmbed ytId={ytId} title={item.name} />}

            {isPdf && <PdfPreview url={url} name={item.name} className="w-full h-[65vh]" />}

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
                  <a href={url} download={item.name} target="_blank" rel="noreferrer" className={`${BTN_PRI} flex-none no-underline`}>
                    <i className="ti ti-download text-[20px]"></i>
                    تحميل مستند الشاهد
                  </a>
                </div>
              </div>
            )}

            {isUnknownFile && <PdfPreviewFallback url={url} name={item.name} />}

            {item.kind === 'vid' && !ytId && (
              <video src={url} controls className="max-w-full max-h-[65vh] rounded-[var(--r-md)] bg-black" />
            )}

            {item.kind === 'audio' && url && <audio src={url} controls className="w-full" />}

            {item.kind === 'note' && (
              item.description?.trim()
                ? <p className="w-full text-[length:var(--fs-sm)] text-[var(--t2)] leading-relaxed whitespace-pre-line">{item.description}</p>
                : <p className="w-full text-[length:var(--fs-sm)] text-[var(--t3)]">لا يوجد وصف</p>
            )}
          </div>

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

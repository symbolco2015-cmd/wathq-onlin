import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

// يُضبط مرة واحدة فقط عبر كامل عمر التطبيق — استدعاء المكوّن أكثر من مرة
// (مثلاً previewFile وStrategyLightbox معاً) لا يعيد ضبط workerSrc عبثاً.
let workerConfigured = false;

function configureWorker(pdfjsLib: typeof import('pdfjs-dist')): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  workerConfigured = true;
}

type Status = 'loading' | 'ready' | 'error';

interface PdfPreviewProps {
  url: string;
  name: string;
  className?: string;
}

/** بطاقة فشل المعاينة — نفس تصميم previewFile.type === 'doc' في Public.tsx حرفياً،
 * بنص مختلف فقط (فشل عام بدل "مستند ميكروسوفت" تحديداً). مُصدَّرة لإعادة
 * استخدامها في Public.tsx كرجعة عامة (شاهد نوعه 'file' بامتداد غير معروف). */
export function PdfPreviewFallback({ url, name }: { url: string; name: string }) {
  return (
    <div className="text-center p-8 max-w-md bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md shadow-2xl">
      <div className="w-16 h-16 rounded-2xl bg-[#c4b5fd]/15 text-[#c4b5fd] flex items-center justify-center text-[34px] mx-auto mb-5 border border-[#c4b5fd]/20 animate-pulse">
        <i className="ti ti-file-text"></i>
      </div>
      <h4 className="text-[17px] font-black text-white mb-2.5">تعذّرت معاينة هذا الملف</h4>
      <p className="text-[13px] text-[var(--text4)] leading-relaxed mb-6">
        يمكنك تحميل الملف مباشرة لاستعراض محتواه على جهازك.
      </p>
      <a
        href={url}
        download={name}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 py-3.5 px-7 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[14px] font-black transition-all duration-300 hover:-translate-y-[3px] hover:shadow-[0_6px_20px_rgba(42,122,68,.5)] no-underline cursor-pointer border-none"
      >
        <i className="ti ti-download text-[18px]"></i>
        تحميل مستند الشاهد
      </a>
    </div>
  );
}

/** معاينة PDF مرسومة على canvas عبر pdfjs-dist — بديل عن iframe الذي تحجبه
 * سياسة Storage/CSP لبعض الملفات. يحمّل المكتبة ديناميكياً عند التركيب فقط
 * (لا تُضاف لحزمة التحميل الأولي)، ويرسم صفحة واحدة في كل مرة. */
export default function PdfPreview({ url, name, className }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  // destroy() هو ملك PDFDocumentLoadingTask (كائن getDocument نفسه)، وليس
  // PDFDocumentProxy المُرجَع من .promise — يُحتفَظ بمرجع مستقل له للتنظيف.
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);

  // تحميل المستند عند تركيب المكوّن أو تغيّر url
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setPageNum(1);
    setNumPages(1);
    docRef.current = null;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        configureWorker(pdfjsLib);
        const loadingTask = pdfjsLib.getDocument({ url });
        taskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus('ready');
      } catch (err) {
        console.warn('[PdfPreview] تعذّر تحميل ملف PDF:', err);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      taskRef.current?.destroy();
      taskRef.current = null;
      docRef.current = null;
    };
  }, [url]);

  // رسم الصفحة الحالية فقط، بدقة تراعي devicePixelRatio
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;

        const containerWidth = canvas.parentElement?.clientWidth || page.getViewport({ scale: 1 }).width;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = containerWidth / baseViewport.width;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: cssScale * dpr });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;

        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
      } catch (err) {
        if (!cancelled) {
          console.warn('[PdfPreview] تعذّر رسم صفحة PDF:', err);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [status, pageNum]);

  if (status === 'error') {
    return (
      <div className={`${className ?? ''} flex items-center justify-center`}>
        <PdfPreviewFallback url={url} name={name} />
      </div>
    );
  }

  return (
    <div className={`${className ?? ''} flex flex-col items-center gap-3 overflow-hidden`}>
      {status === 'loading' && (
        <div className="flex-1 flex items-center justify-center">
          <i className="ti ti-loader animate-spin text-[32px] text-[var(--em8)]" />
        </div>
      )}

      <div className={`flex-1 min-h-0 w-full overflow-auto flex items-start justify-center ${status === 'loading' ? 'hidden' : ''}`}>
        <canvas ref={canvasRef} className="max-w-full rounded-2xl shadow-2xl" />
      </div>

      {status === 'ready' && numPages > 1 && (
        <div className="shrink-0 flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl py-1.5 px-3">
          <button
            type="button"
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text3)] hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <i className="ti ti-chevron-right"></i>
          </button>
          <span className="text-[12px] font-bold text-[var(--text3)]">صفحة {pageNum} من {numPages}</span>
          <button
            type="button"
            onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text3)] hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <i className="ti ti-chevron-left"></i>
          </button>
        </div>
      )}
    </div>
  );
}

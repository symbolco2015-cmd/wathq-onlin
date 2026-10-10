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

/** بطاقة فشل المعاينة — مُصدَّرة لإعادة استخدامها في EvidenceViewer كرجعة عامة
 * (شاهد نوعه 'file' بامتداد غير معروف). */
export function PdfPreviewFallback({ url, name }: { url: string; name: string }) {
  return (
    <div className="text-center p-6 max-w-md rounded-[var(--r-md)] bg-[var(--s1)] border border-[var(--bd)]">
      <div className="w-16 h-16 rounded-[var(--r-md)] bg-[var(--s2)] text-[var(--t2)] flex items-center justify-center text-[32px] mx-auto mb-4">
        <i className="ti ti-file-text"></i>
      </div>
      <h4 className="text-[length:var(--fs-md)] font-bold text-[var(--t1)] mb-2">تعذّرت معاينة هذا الملف</h4>
      <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-[1.8] mb-6">
        يمكنك تحميل الملف مباشرة لاستعراض محتواه على جهازك.
      </p>
      <a
        href={url}
        download={name}
        target="_blank"
        rel="noreferrer"
        className="h-11 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--accent)] text-[length:var(--fs-sm)] font-bold text-[var(--bg)] no-underline cursor-pointer"
      >
        <i className="ti ti-download text-[20px]"></i>
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
          <i className="ti ti-loader animate-spin motion-reduce:animate-none text-[32px] text-[var(--t2)]" />
        </div>
      )}

      <div className={`flex-1 min-h-0 w-full overflow-auto flex items-start justify-center ${status === 'loading' ? 'hidden' : ''}`}>
        <canvas ref={canvasRef} className="max-w-full rounded-[var(--r-md)]" />
      </div>

      {status === 'ready' && numPages > 1 && (
        <div className="shrink-0 flex items-center gap-3 bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-sm)] p-1">
          <button
            type="button"
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            aria-label="الصفحة السابقة"
            className="w-11 h-11 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[var(--t1)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <i className="ti ti-chevron-right text-[20px]"></i>
          </button>
          <span className="text-[length:var(--fs-xs)] font-bold text-[var(--t2)]">صفحة {pageNum} من {numPages}</span>
          <button
            type="button"
            onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            aria-label="الصفحة التالية"
            className="w-11 h-11 rounded-[var(--r-sm)] border border-[var(--bd2)] flex items-center justify-center text-[var(--t1)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <i className="ti ti-chevron-left text-[20px]"></i>
          </button>
        </div>
      )}
    </div>
  );
}

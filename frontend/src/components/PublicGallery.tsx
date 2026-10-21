// «لمحات من الممارسة الصفية»: شريط صور ينساب ببطء (CSS فقط، انظر .gal-* في index.css).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GalleryImage } from './galleryImages';

const CARD = 'relative shrink-0 w-[213px] h-[160px] lg:w-[293px] lg:h-[220px] overflow-hidden rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s2)] text-right cursor-pointer';

function Card({ img, sec, failed, onFail, onOpen, copy }: {
  img: GalleryImage;
  sec: string | undefined;
  failed: boolean;
  onFail: () => void;
  onOpen: () => void;
  /** النسخة الثانية: للحلقة البصرية فقط، خارج التركيز وقارئ الشاشة */
  copy: boolean;
}) {
  const title = img.ev.title;
  return (
    <button type="button" onClick={onOpen} aria-label={copy ? undefined : title} tabIndex={copy ? -1 : undefined} className={CARD}>
      {failed ? (
        // بلا مرئي: مربع أيقونة مع العنوان (فرع !hasVisual في TopAchievementCard)
        <span className="absolute inset-0 flex flex-col items-start justify-end gap-2 p-3">
          <span className="w-9 h-9 rounded-[var(--r-sm)] bg-[var(--s3)] flex items-center justify-center">
            <i className="ti ti-photo text-[20px] text-[var(--t2)]"></i>
          </span>
          <span className="block w-full text-[length:var(--fs-xs)] font-bold text-[var(--t1)] truncate">{title}</span>
          {sec && <span className="block w-full text-[length:var(--fs-xs)] text-[var(--t3)] truncate">{sec}</span>}
        </span>
      ) : (
        <>
          <img src={img.url} alt={copy ? '' : title} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" onError={onFail} />
          {/* العنوان ظاهر دائماً (الجوال لا مرور فيه)، على تدرّج داكن في الأسفل */}
          <span className="absolute inset-x-0 bottom-0 px-2.5 pt-6 pb-2 bg-linear-to-t from-black/70 to-transparent">
            <span className="block text-[length:var(--fs-xs)] font-bold text-[var(--t1)] truncate">{title}</span>
            {sec && <span className="block text-[length:var(--fs-xs)] text-[var(--t2)] truncate">{sec}</span>}
          </span>
        </>
      )}
    </button>
  );
}

export default function PublicGallery({ images, sectionName, onOpen }: {
  images: GalleryImage[];
  sectionName: (sectionId: number | null) => string | undefined;
  onOpen: (img: GalleryImage) => void;
}) {
  // مفاتيح الصور التي تعذّر تحميلها
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const viewportRef = useRef<HTMLDivElement>(null);
  const firstCopyRef = useRef<HTMLDivElement>(null);
  // تتحرك فقط إن كانت النسخة الأولى أعرض من الشاشة. عرض البطاقة ثابت، فلا
  // يتغير بتحميل الصور، والمراقب لا يعمل إلا عند تغيّر المقاس
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const vp = viewportRef.current;
    const first = firstCopyRef.current;
    if (!vp || !first) return;
    const check = () => setMoving(first.scrollWidth > vp.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(vp);
    ro.observe(first);
    return () => ro.disconnect();
  }, [images.length]);

  if (images.length === 0) return null;
  const markFailed = (key: string) => setFailedKeys(prev => new Set(prev).add(key));
  const renderCopy = (copy: boolean) => images.map(img => (
    <Card
      key={img.key}
      img={img}
      sec={sectionName(img.ev.section_id)}
      failed={failedKeys.has(img.key)}
      onFail={() => markFailed(img.key)}
      onOpen={() => onOpen(img)}
      copy={copy}
    />
  ));

  return (
    <section className="print:hidden" aria-labelledby="gallery-title">
      <div className="flex items-center gap-1.5 text-[length:var(--fs-xs)] font-bold text-[var(--brand-gold)]">
        <i className="ti ti-photo text-[16px]"></i>
        من الشواهد
      </div>
      <h2 id="gallery-title" className="mt-1 text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">لمحات من الممارسة الصفية</h2>
      <div ref={viewportRef} className={`gal-viewport mt-3 ${moving ? '' : 'gal-viewport--static'}`}>
        <div className="gal-track" style={{ '--n': images.length } as CSSProperties}>
          <div ref={firstCopyRef} className="gal-copy">{renderCopy(false)}</div>
          {moving && <div className="gal-copy" aria-hidden="true" inert>{renderCopy(true)}</div>}
        </div>
      </div>
    </section>
  );
}

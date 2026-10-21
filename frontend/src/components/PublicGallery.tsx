// «لمحات من الممارسة الصفية»: فسيفساء صورة كبيرة وصغيرة حولها، تتبدل صورها
// بمؤقت واحد (منطق الاختيار في galleryImages.ts، والتلاشي في .gal-* في index.css).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type AnimationEvent, type FocusEvent, type PointerEvent } from 'react';
import { gallerySlotCount, pickNextMove, type GalleryImage, type GalleryLayout, type GalleryMove } from './galleryImages';

/** الفاصل بين تبديلين */
const CYCLE_MS = 3500;

/** طبقة صورة في خانة. الخانة طبقة واحدة، أو اثنتان أثناء التلاشي (الجديدة آخراً) */
type Layer = { img: GalleryImage; id: number; fading: boolean };

const top = (slot: Layer[]) => slot[slot.length - 1];

function useMedia(query: string): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** تحميل الصورة وفكّها قبل عرضها، فلا تظهر خانة نصف محمّلة */
async function decodeImage(url: string): Promise<boolean> {
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    return true;
  } catch {
    return false;
  }
}

const TILE = 'group relative overflow-hidden rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s2)] text-right cursor-pointer';

function Mosaic({ images, count, layout, reduced, sectionName, onOpen }: {
  images: GalleryImage[];
  count: number;
  layout: GalleryLayout;
  reduced: boolean;
  sectionName: (sectionId: number | null) => string | undefined;
  onOpen: (img: GalleryImage) => void;
}) {
  // أول عرض: أول صور المجمّع بترتيب pickGalleryImages (الأحدث)
  const [slots, setSlots] = useState<Layer[][]>(() => images.slice(0, count).map((img, i) => [{ img, id: i, fading: false }]));
  const nextId = useRef(count);
  // مفاتيح الصور التي تعذّر تحميلها — تخرج من المجمّع
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const markFailed = useCallback((key: string) => setFailed(prev => (prev.has(key) ? prev : new Set(prev).add(key))), []);

  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const running = !hover && !focused && !touching && inView && pageVisible && !reduced;

  // المؤقت يقرأ آخر حالة دون أن يُعاد ضبطه مع كل تغيير فيها
  const slotsRef = useRef(slots);
  const failedRef = useRef(failed);
  useEffect(() => {
    slotsRef.current = slots;
    failedRef.current = failed;
  });
  const lastSlot = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /** تطبيق التبديل: الصورة الجديدة طبقة فوق القديمة تظهر بتلاشٍ، وبلا تلاشٍ مع
   *  reduced-motion (لا يقع إلا عند استبدال صورة تعذّر تحميلها) */
  const apply = useCallback((move: GalleryMove) => {
    setSlots(prev => {
      const shown = prev.map(s => top(s).img);
      if (move.kind === 'replace' && shown.some(img => img.key === move.image.key)) return prev;
      const put = (slot: Layer[], img: GalleryImage): Layer[] => {
        const layer = { img, id: nextId.current++, fading: !reduced };
        // الصورة التي تعذّر تحميلها لا تبقى تحت الجديدة
        const keepOld = !reduced && !failedRef.current.has(top(slot).img.key);
        return keepOld ? [{ ...top(slot), fading: false }, layer] : [layer];
      };
      return prev.map((s, i) => {
        if (move.kind === 'replace') return i === move.slot ? put(s, move.image) : s;
        if (i === move.a) return put(s, shown[move.b]);
        if (i === move.b) return put(s, shown[move.a]);
        return s;
      });
    });
  }, [reduced]);

  // المؤقت الوحيد: كل CYCLE_MS يختار خانة وصورة، ويحمّل تلك الصورة وحدها قبل عرضها
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const shown = slotsRef.current.map(s => top(s).img);
      const pool = images.filter(img => !failedRef.current.has(img.key));
      const move = pickNextMove(shown, pool, lastSlot.current, Math.random);
      if (move?.kind === 'replace' && !(await decodeImage(move.image.url))) {
        markFailed(move.image.key);
      } else if (move && !cancelled) {
        lastSlot.current = move.kind === 'replace' ? move.slot : move.a;
        apply(move);
      }
      if (!cancelled) setTick(t => t + 1);
    }, CYCLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [running, tick, images, apply, markFailed]);

  // صورة معروضة تعذّر تحميلها: تُستبدل فوراً بصورة من المجمّع إن وُجدت، وإلا
  // تبقى بطاقة الأيقونة
  useEffect(() => {
    const shown = slots.map(s => top(s).img);
    const slot = shown.findIndex(img => failed.has(img.key));
    if (slot < 0) return;
    const keys = new Set(shown.map(img => img.key));
    const candidate = images.find(img => !failed.has(img.key) && !keys.has(img.key));
    if (!candidate) return;
    let cancelled = false;
    decodeImage(candidate.url).then(ok => {
      if (cancelled) return;
      if (ok) apply({ kind: 'replace', slot, image: candidate });
      else markFailed(candidate.key);
    });
    return () => { cancelled = true; };
  }, [slots, failed, images, apply, markFailed]);

  /** انتهى التلاشي: تُحذف الطبقة القديمة ومعها will-change */
  const onFadeEnd = (slotIdx: number, layerId: number) => (e: AnimationEvent) => {
    if (e.target !== e.currentTarget || e.animationName !== 'wathq-gal-fade') return;
    setSlots(prev => prev.map((s, i) => (i === slotIdx && top(s).id === layerId ? [{ ...top(s), fading: false }] : s)));
  };

  const onPointerEnter = (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(true); };
  const onPointerLeave = (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(false); };
  // التركيز بلوحة المفاتيح فقط: ضغط الفأرة على خانة لا يوقف التبديل بعد إغلاق النافذة
  const onFocus = (e: FocusEvent) => { if (e.target instanceof Element && e.target.matches(':focus-visible')) setFocused(true); };
  const onBlur = (e: FocusEvent) => {
    if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setFocused(false);
  };

  const desktop = layout === 'desktop';
  const gridClass = desktop
    ? `gap-3 grid-rows-2 h-[300px] lg:h-[360px] ${count === 5 ? 'grid-cols-4' : 'grid-cols-3'}`
    : `gap-2 ${count === 4 ? 'grid-cols-3' : 'grid-cols-2'}`;

  return (
    <div
      ref={gridRef}
      className={`mt-3 grid ${gridClass} ${running ? '' : 'gal--paused'}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onTouchStart={() => setTouching(true)}
      onTouchEnd={() => setTouching(false)}
      onTouchCancel={() => setTouching(false)}
    >
      {slots.map((layers, slotIdx) => {
        const big = slotIdx === 0;
        const cur = top(layers).img;
        const title = cur.ev.title;
        const sec = sectionName(cur.ev.section_id);
        const size = big ? (desktop ? 'col-span-2 row-span-2' : 'col-span-full aspect-[4/3]') : (desktop ? '' : 'aspect-square');
        return (
          // الضغط يأخذ الصورة العليا دائماً، فالضغط أثناء التلاشي يفتح الجديدة
          <button key={slotIdx} type="button" onClick={() => onOpen(cur)} aria-label={title} className={`${TILE} ${size}`}>
            {failed.has(cur.key) ? (
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
                {layers.map((layer, li) => {
                  const isTop = li === layers.length - 1;
                  return (
                    <span
                      key={layer.id}
                      aria-hidden={isTop ? undefined : true}
                      className={`absolute inset-0 ${layer.fading ? 'gal-fade' : ''}`}
                      onAnimationEnd={layer.fading ? onFadeEnd(slotIdx, layer.id) : undefined}
                    >
                      <img
                        src={layer.img.url}
                        alt={isTop ? layer.img.ev.title : ''}
                        loading={big ? 'eager' : 'lazy'}
                        decoding="async"
                        className={`absolute inset-0 w-full h-full object-cover ${big ? 'gal-kb' : ''}`}
                        onError={() => markFailed(layer.img.key)}
                      />
                    </span>
                  );
                })}
                {big ? (
                  <span className="absolute inset-x-0 bottom-0 px-3 pt-8 pb-3 bg-linear-to-t from-black/70 to-transparent">
                    <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] truncate">{title}</span>
                    {sec && <span className="block text-[length:var(--fs-xs)] text-[var(--t2)] truncate">{sec}</span>}
                  </span>
                ) : desktop && (
                  // الصغيرة: العنوان عند المرور أو التركيز فقط (الجوال بلا مرور، فلا نص)
                  <span className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 bg-linear-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-[250ms] group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="block text-[length:var(--fs-xs)] font-bold text-[var(--t1)] truncate">{title}</span>
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function PublicGallery({ images, sectionName, onOpen }: {
  images: GalleryImage[];
  sectionName: (sectionId: number | null) => string | undefined;
  onOpen: (img: GalleryImage) => void;
}) {
  const layout: GalleryLayout = useMedia('(min-width: 768px)') ? 'desktop' : 'mobile';
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const count = gallerySlotCount(images.length, layout);
  if (count === 0) return null;
  // تغيّر التخطيط أو المجمّع يعيد الفسيفساء إلى أول عرض، فلا تتكرر صورة كانت
  // في خانة مخفية
  const mosaicKey = `${layout}:${images.map(img => img.key).join(',')}`;

  return (
    <section className="print:hidden" aria-labelledby="gallery-title">
      <div className="flex items-center gap-1.5 text-[length:var(--fs-xs)] font-bold text-[var(--brand-gold)]">
        <i className="ti ti-photo text-[16px]"></i>
        من الشواهد
      </div>
      <h2 id="gallery-title" className="mt-1 text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">لمحات من الممارسة الصفية</h2>
      <Mosaic key={mosaicKey} images={images} count={count} layout={layout} reduced={reduced} sectionName={sectionName} onOpen={onOpen} />
    </section>
  );
}

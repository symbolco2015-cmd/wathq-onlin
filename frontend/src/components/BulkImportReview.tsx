import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { SectionReclassifyDropdown } from './Dashboard';
import { SelectDropdown } from './UI';
import type { ToastKind } from './UI';
import { BTN_PRI, BTN_SM, BTN_GH_SM } from './SectionView';
import { FIELD, LABEL } from './formStyles';
import { supabase } from '../supabaseClient';
import { useSaveEvidence } from '../hooks/useSaveEvidence';
import type { OnEvidenceSavedFn } from '../hooks/useSaveEvidence';
import type { SectionData } from '../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface Indicator {
  id: string;
  name_ar: string;
}

interface ClassifiedRow {
  id: string;
  file_path: string;
  suggested_section_id: number | null;
  suggested_title: string | null;
  created_at: string;
}

interface RowEdit {
  sectionId: number | null;
  title: string;
  /** يُصفَّر عند كل تغيير للقسم — يجب اختياره من جديد لمؤشرات القسم الجديد */
  indicatorId: string | null;
}

interface BulkImportReviewProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  /** أقسام قابلة للاختيار يدوياً هنا فقط — لا تشمل قسم 4 (isStrat)، مُمرَّرة
   *  من Dashboard.tsx مسبقاً الفلترة (nonStratSections). */
  sections: SectionData[];
  /** معرّف قسم الاستراتيجيات (isStrat)، غير مُفلتر — يُستخدم فقط لمقارنة
   *  suggested_section_id القادم من تصنيف الذكاء الاصطناعي (انظر getEdit
   *  أدناه)، منفصل تماماً عن sections الظاهرة بالمنتقي حتى لا يعتمد التحقق
   *  على قائمة مُفلترة أصلاً لا تحوي القيمة المطلوب مطابقتها. */
  stratSectionId?: number;
  supabaseEv?: SupabaseEvidenceHook;
  onEvidenceSaved?: OnEvidenceSavedFn;
  onToast?: (msg: string, kind: ToastKind) => void;
}

const publicUrlFor = (filePath: string): string =>
  supabase!.storage.from('evidence').getPublicUrl(filePath).data.publicUrl;

/**
 * BottomSheet "مراجعة الاستيراد الجماعي": صفوف bulk_import_queue بحالتَي
 * 'classified' و'failed' معاً — كل صف قابل للتعديل (القسم عبر
 * SectionReclassifyDropdown الموجود مسبقاً، والمؤشر، والعنوان بحقل نص) قبل
 * اعتماده فردياً أو دفعة واحدة عبر "قبول الكل". الصف الفاشل (فشل تصنيفه
 * بالذكاء الاصطناعي) يُعرض بلا قسم مقترح وبعنوان فارغ، ويختار المعلم قسمه
 * ومؤشره يدوياً. كل الصفوف تُحفظ عبر saveEvidence بمؤشر إلزامي، ولا يُحذف صف
 * من الطابور إلا بعد نجاح إدخاله. صف تعذّر تحميل صورته لا يمكن اعتماده، حتى
 * لا يُحفظ شاهد برابط معطوب.
 */
export default function BulkImportReview({ isOpen, onClose, userId, sections, stratSectionId, supabaseEv, onEvidenceSaved, onToast }: BulkImportReviewProps) {
  // مسار الكتابة الموحّد — INSERT في evidence، وعند نجاحه فقط تسجيل الشاهد في
  // monthly_progress عبر onEvidenceSaved (انظر useSaveEvidence.ts).
  const { saveEvidence } = useSaveEvidence(supabaseEv?.addEvidence, onEvidenceSaved);

  const [rows, setRows] = useState<ClassifiedRow[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [loading, setLoading] = useState(false);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null); // 'all' أو id الصف الجاري اعتماده
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  // مؤشرات section_indicators مجلوبة لكل قسم ظهر بين الصفوف — مفتاحها section_id،
  // تُملأ عند أول ظهور لكل قسم (اقتراح مبدئي أو اختيار يدوي) لتفادي تكرار الجلب
  const [indicatorsBySection, setIndicatorsBySection] = useState<Record<number, Indicator[]>>({});
  // صفوف فشل تحميل مصغّرتها في المتصفح (onError) — الصورة غالباً غير موجودة في
  // التخزين (مثل صف فشل بـ download_failed)، فلا يُسمح باعتمادها
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, true>>({});

  // قسم 4 (isStrat) يستلزم strategy_id إجبارياً عبر تدفّق "استراتيجيات
  // التدريس" المخصّص — لا يمكن قبوله كاقتراح تصنيف تلقائي صامت هنا (لا يوجد
  // منتقي استراتيجية بهذا التدفّق أصلاً)، فيُصفَّر لـnull (غير مصنَّف) بدل
  // تمريره كافتراضي، حتى لو رجع من الذكاء الاصطناعي (process-bulk-queue يقرأ
  // جدول sections بلا استثناء لهذا القسم حالياً).
  const safeSuggestedSectionId = (row: ClassifiedRow): number | null =>
    row.suggested_section_id != null && row.suggested_section_id === stratSectionId
      ? null
      : row.suggested_section_id;

  const getEdit = (row: ClassifiedRow): RowEdit =>
    edits[row.id] ?? { sectionId: safeSuggestedSectionId(row), title: row.suggested_title ?? '', indicatorId: null };

  const ensureIndicatorsLoaded = async (sectionId: number) => {
    if (indicatorsBySection[sectionId] || !supabase) return;
    const { data, error } = await supabase
      .from('section_indicators')
      .select('id, name_ar')
      .eq('section_id', sectionId)
      .order('weight', { ascending: true })
      .order('name_ar', { ascending: true });
    if (error) {
      console.warn('[BulkImportReview] تعذّر تحميل مؤشرات القسم:', error.message);
      return;
    }
    setIndicatorsBySection(prev => ({ ...prev, [sectionId]: data ?? [] }));
  };

  useEffect(() => {
    if (!isOpen || !userId || !supabase) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // الصفوف المصنّفة والفاشلة معاً — الفاشل يصل بلا suggested_section_id ولا
      // suggested_title (process-bulk-queue لا يكتبهما عند الفشل)، فيُعرض كصف
      // بلا قسم مقترح ويُصنَّف يدوياً مثل أي صف آخر
      const { data, error } = await supabase
        .from('bulk_import_queue')
        .select('id, file_path, suggested_section_id, suggested_title, created_at')
        .eq('portfolio_id', userId)
        .in('status', ['classified', 'failed'])
        .order('created_at', { ascending: true });
      if (cancelled) return;

      if (error) {
        console.error('[BulkImportReview] تعذّر جلب صفوف المراجعة:', error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as ClassifiedRow[];
      setRows(list);
      setEdits(prev => {
        const next = { ...prev };
        for (const row of list) {
          if (!next[row.id]) next[row.id] = { sectionId: safeSuggestedSectionId(row), title: row.suggested_title ?? '', indicatorId: null };
        }
        return next;
      });
      // جلب مؤشرات كل قسم مقترح دفعة واحدة (بلا تكرار لنفس القسم) — حتى يظهر
      // منتقي المؤشر جاهزاً فور فتح الصف، دون انتظار تفاعل المستخدم مع منتقي القسم.
      // نقرأ من نفس المصدر المصفَّى (safeSuggestedSectionId) حتى لا نجلب مؤشرات
      // قسم 4 بلا داعٍ لصف سيُعرَض أصلاً كـ"غير مصنَّف".
      const uniqueSectionIds = Array.from(new Set(
        list.map(r => safeSuggestedSectionId(r)).filter((id): id is number => id != null)
      ));
      uniqueSectionIds.forEach(id => ensureIndicatorsLoaded(id));
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const confirmRows = async (targetRows: ClassifiedRow[], busyKey: string) => {
    if (!supabase || !userId || !supabaseEv || targetRows.length === 0) return;
    setConfirmingKey(busyKey);
    try {
      // مرّت saveEvidence على كل صف على حدة (وليس INSERT دفعي واحد كما سابقاً)،
      // بالتتابع (await داخل الحلقة) لا بالتوازي — recordEvidence في monthly_progress
      // يقرأ العدّاد الحالي ثم يكتب قيمة جديدة (upsert)، فتنفيذ عدة صفوف لنفس
      // القسم بالتوازي قد يتسابق على نفس الصف فيضيع بعض العدّ.
      const succeededIds: string[] = [];
      for (const row of targetRows) {
        const edit = getEdit(row);
        // احتياط إضافي — الأزرار مُعطَّلة أصلاً لهذه الحالات
        if (edit.sectionId == null || !edit.indicatorId || brokenImageIds[row.id]) continue;

        const result = await saveEvidence({
          section_id: edit.sectionId,
          indicator_id: edit.indicatorId,
          title: edit.title.trim() || 'شاهد من الاستيراد الجماعي',
          evidence_type: 'image',
          file_url: publicUrlFor(row.file_path),
        });
        if (result) {
          succeededIds.push(row.id);
        }
      }

      // الحذف من الطابور فقط للصفوف التي نجح إدخالها فعلياً في evidence
      if (succeededIds.length > 0) {
        const { error: delErr } = await supabase.from('bulk_import_queue').delete().in('id', succeededIds);
        if (delErr) {
          console.error('[BulkImportReview] تعذّر حذف صفوف الطابور بعد الإدخال الناجح:', delErr.message);
        }
        setRows(prev => prev.filter(r => !succeededIds.includes(r.id)));
      }

      if (succeededIds.length === targetRows.length) {
        onToast?.(`تم اعتماد ${succeededIds.length} ${succeededIds.length === 1 ? 'شاهد' : 'شواهد'} بنجاح`, 'success');
      } else if (succeededIds.length > 0) {
        onToast?.(`تم اعتماد ${succeededIds.length} من ${targetRows.length}، تعذّر حفظ الباقي`, 'error');
      } else {
        onToast?.('تعذّر حفظ الشواهد، حاول مرة أخرى', 'error');
      }
    } catch (err) {
      console.error('[BulkImportReview] فشل اعتماد الشواهد:', err);
      onToast?.('تعذّر حفظ الشواهد، حاول مرة أخرى', 'error');
    } finally {
      setConfirmingKey(null);
    }
  };

  // صفوف الصورة المعطوبة مستبعدة من "قبول الكل" كلياً — لا تمنع اعتماد الباقي
  const acceptableRows = rows.filter(r => !brokenImageIds[r.id]);
  const acceptAll = () => confirmRows(acceptableRows, 'all');
  const acceptOne = (row: ClassifiedRow) => confirmRows([row], row.id);

  const isBusy = confirmingKey !== null;
  const isRowReady = (row: ClassifiedRow): boolean => {
    if (brokenImageIds[row.id]) return false;
    const edit = getEdit(row);
    return edit.sectionId != null && !!edit.indicatorId;
  };
  const allRowsReady = acceptableRows.length > 0 && acceptableRows.every(isRowReady);

  // أيقونة حالة الصف مشتقة من الحالة الموجودة فقط: صورة معطوبة، أو جاهز، أو ينقصه قسم/مؤشر
  const rowStatus = (row: ClassifiedRow): { icon: string; color: string; label: string } =>
    brokenImageIds[row.id]
      ? { icon: 'ti-photo-off', color: 'text-[var(--danger)]', label: 'تعذّر تحميل الصورة' }
      : isRowReady(row)
        ? { icon: 'ti-circle-check', color: 'text-[var(--accent)]', label: 'جاهز' }
        : { icon: 'ti-alert-circle', color: 'text-[var(--warn)]', label: 'يحتاج مراجعة' };

  return (
    <BottomSheet isOpen={isOpen} onClose={isBusy ? () => {} : onClose}>
      <div className="flex items-center justify-between gap-2 px-4 pb-3 border-b border-[var(--bd)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-[var(--r-sm)] shrink-0 flex items-center justify-center bg-[var(--s2)] border border-[var(--bd)] text-[var(--t2)] text-[length:var(--fs-lg)]">
            <i className="ti ti-photo-check" />
          </div>
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">مراجعة الاستيراد الجماعي</div>
        </div>
        <button
          type="button"
          onClick={isBusy ? undefined : onClose}
          disabled={isBusy}
          aria-label="إغلاق"
          className={`${BTN_GH_SM} w-11 h-11 px-0 disabled:cursor-wait`}
        >
          <i className="ti ti-x text-[length:var(--fs-lg)]" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <i className="ti ti-loader animate-spin text-[length:var(--fs-xl)] text-[var(--t2)]" />
            <p className="text-[length:var(--fs-sm)] text-[var(--t2)]">جارٍ التحميل...</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[length:var(--fs-sm)] text-[var(--t2)] text-center py-6">لا توجد شواهد جاهزة للمراجعة حالياً</p>
        ) : (
          <div className="space-y-3">
            {rows.map(row => {
              const edit = getEdit(row);
              const sectionLabel = edit.sectionId != null ? sections.find(s => s.id === edit.sectionId)?.ttl : null;
              const rowBusy = isBusy; // isBusy = confirmingKey !== null — يعطّل كل الأزرار أثناء أي اعتماد جارٍ، لا الصف المحدد فقط
              const status = rowStatus(row);
              return (
                <div key={row.id} className="flex flex-col gap-3 p-3 bg-[var(--s2)] rounded-[var(--r-md)] border border-[var(--bd)]">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-[var(--r-sm)] shrink-0 overflow-hidden border border-[var(--bd)] bg-[var(--s3)] flex items-center justify-center">
                      {brokenImageIds[row.id] ? (
                        <span className="text-[length:var(--fs-xs)] text-[var(--t3)] text-center leading-tight px-1">تعذّر تحميل الصورة</span>
                      ) : (
                        <img
                          src={publicUrlFor(row.file_path)}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={() => setBrokenImageIds(prev => ({ ...prev, [row.id]: true }))}
                        />
                      )}
                    </div>
                    <input
                      type="text"
                      value={edit.title}
                      disabled={rowBusy}
                      onChange={e => setEdits(prev => ({ ...prev, [row.id]: { ...edit, title: e.target.value } }))}
                      placeholder="عنوان الشاهد"
                      className={`${FIELD} flex-1 min-w-0 disabled:opacity-50`}
                    />
                    <i
                      role="img"
                      aria-label={status.label}
                      title={status.label}
                      className={`ti ${status.icon} ${status.color} text-[length:var(--fs-lg)] shrink-0`}
                    />
                  </div>

                  <div>
                    <div className={LABEL}>
                      القسم:
                      <span className="min-w-0 font-normal text-[length:var(--fs-sm)] text-[var(--t2)] truncate">{sectionLabel ?? 'بلا قسم — اختر قسماً'}</span>
                    </div>
                    <SectionReclassifyDropdown
                      sections={sections}
                      isOpen={openDropdownId === row.id}
                      isBusy={rowBusy}
                      onOpen={() => setOpenDropdownId(row.id)}
                      onClose={() => setOpenDropdownId(null)}
                      selectedLabel={sectionLabel ?? undefined}
                      onSelect={(sectionId) => {
                        setOpenDropdownId(null);
                        const numericId = Number(sectionId);
                        // تصفير المؤشر عند تغيير القسم — مؤشرات القسم الجديد مختلفة تماماً
                        setEdits(prev => ({ ...prev, [row.id]: { ...edit, sectionId: numericId, indicatorId: null } }));
                        ensureIndicatorsLoaded(numericId);
                      }}
                    />
                  </div>

                  <div>
                    <div className={LABEL}>المؤشر الفرعي:</div>
                    {edit.sectionId == null ? (
                      <span className="text-[length:var(--fs-xs)] text-[var(--t3)]">اختر قسماً أولاً</span>
                    ) : (
                      <SelectDropdown
                        options={(indicatorsBySection[edit.sectionId] ?? []).map(i => ({ value: i.id, label: i.name_ar }))}
                        value={edit.indicatorId ?? ''}
                        onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...edit, indicatorId: v || null } }))}
                        placeholder="— اختر المؤشر —"
                        triggerClassName={`${FIELD} cursor-pointer`}
                        allowClear
                      />
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={rowBusy || !isRowReady(row)}
                      onClick={() => acceptOne(row)}
                      title={brokenImageIds[row.id] ? 'تعذّر تحميل الصورة' : !isRowReady(row) ? 'اختر القسم والمؤشر الفرعي أولاً' : undefined}
                      className={`${BTN_SM} self-auto hover:bg-[var(--s3)] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {rowBusy ? <i className="ti ti-loader animate-spin text-[length:var(--fs-md)]" /> : <><i className="ti ti-check text-[length:var(--fs-md)]" /> قبول</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div className="p-4 border-t border-[var(--bd)] bg-[var(--s1)] shrink-0">
          <button
            type="button"
            disabled={isBusy || !allRowsReady}
            onClick={acceptAll}
            title={!allRowsReady ? 'أكمل اختيار القسم والمؤشر لكل الصفوف أولاً' : undefined}
            className={`${BTN_PRI} w-full disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {confirmingKey === 'all' ? (
              <><i className="ti ti-loader animate-spin text-[length:var(--fs-md)]" /> جارٍ الاعتماد...</>
            ) : (
              <><i className="ti ti-checks text-[length:var(--fs-md)]" /> قبول الكل ({acceptableRows.length})</>
            )}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

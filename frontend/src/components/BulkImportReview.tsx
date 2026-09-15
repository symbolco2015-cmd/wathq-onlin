import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { SectionReclassifyDropdown } from './Dashboard';
import { SelectDropdown } from './UI';
import { supabase } from '../supabaseClient';
import { useSaveEvidence } from '../hooks/useSaveEvidence';
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

interface FailedRow {
  id: string;
  file_path: string;
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
  onAddEv?: (
    sid: number,
    sub: string,
    type: 'pdf' | 'img' | 'doc' | 'vid',
    name: string,
    url?: string,
    createdAt?: string
  ) => void;
  onToast?: (msg: string, icon?: string) => void;
}

const publicUrlFor = (filePath: string): string =>
  supabase!.storage.from('evidence').getPublicUrl(filePath).data.publicUrl;

/**
 * BottomSheet "مراجعة الاستيراد الجماعي": صفوف bulk_import_queue بحالة
 * 'classified' فقط — كل صف قابل للتعديل (القسم عبر SectionReclassifyDropdown
 * الموجود مسبقاً، والعنوان بحقل نص) قبل اعتماده فردياً أو دفعة واحدة عبر
 * "قبول الكل". صفوف 'failed' تُعالَج تلقائياً عند الفتح بلا أي تفاعل من
 * المستخدم (تُحفظ بلا قسم في evidence، نفس منطق فشل التصنيف الصوتي) ولا تُعرض هنا.
 */
export default function BulkImportReview({ isOpen, onClose, userId, sections, stratSectionId, supabaseEv, onAddEv, onToast }: BulkImportReviewProps) {
  // مسار الكتابة الموحّد — INSERT في evidence، وعند نجاحه فقط تحديث state.ev
  // + monthly_progress عبر onAddEv (انظر useSaveEvidence.ts). لا يُستخدم في
  // resolveFailedRows أدناه (استثناء مقصود، انظر تعليقها).
  const { saveEvidence } = useSaveEvidence(supabaseEv?.addEvidence, onAddEv);

  const [rows, setRows] = useState<ClassifiedRow[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [loading, setLoading] = useState(false);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null); // 'all' أو id الصف الجاري اعتماده
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  // مؤشرات section_indicators مجلوبة لكل قسم ظهر بين الصفوف — مفتاحها section_id،
  // تُملأ عند أول ظهور لكل قسم (اقتراح مبدئي أو اختيار يدوي) لتفادي تكرار الجلب
  const [indicatorsBySection, setIndicatorsBySection] = useState<Record<number, Indicator[]>>({});

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

  const resolveFailedRows = async (failedRows: FailedRow[]) => {
    if (!supabase || !userId || failedRows.length === 0) return;
    // استثناء مقصود من مسار saveEvidence الموحّد: هذه الصفوف تُحفظ بلا قسم
    // (section_id null) للتصنيف اليدوي لاحقاً من قائمة "غير مصنّف" — بلا قسم
    // لا يوجد مؤشر ممكن أصلاً (indicator_id يتبع section_id)، فلا يمكن إلزامها
    // بمؤشر. تبقى INSERT مباشرة كما كانت تماماً، ولا تُحدَّث state.ev/monthly_progress
    // هنا (نفس السلوك السابق) لأنها غير مصنَّفة بقسم بعد.
    const dateLabel = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
    const payload = failedRows.map(r => ({
      portfolio_id: userId,
      section_id: null,
      title: `شاهد من الاستيراد الجماعي - ${dateLabel}`,
      evidence_type: 'image' as const,
      file_url: publicUrlFor(r.file_path),
    }));

    const { error: insertErr } = await supabase.from('evidence').insert(payload);
    if (insertErr) {
      console.error('[BulkImportReview] تعذّر حفظ الشواهد الفاشلة بلا قسم:', insertErr.message);
      return; // اترك صفوف الطابور كما هي لمحاولة لاحقة — لا تحذف قبل نجاح الإدخال
    }

    const { error: delErr } = await supabase.from('bulk_import_queue').delete().in('id', failedRows.map(r => r.id));
    if (delErr) {
      console.error('[BulkImportReview] تعذّر حذف صفوف الطابور الفاشلة بعد حفظها:', delErr.message);
    }
    await supabaseEv?.refetch();
  };

  useEffect(() => {
    if (!isOpen || !userId || !supabase) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1) صفوف "failed" تُعالَج فوراً وتلقائياً — بلا عرض وبلا حاجة لتفاعل المستخدم
      const { data: failedRows } = await supabase
        .from('bulk_import_queue')
        .select('id, file_path')
        .eq('portfolio_id', userId)
        .eq('status', 'failed');
      if (cancelled) return;
      if (failedRows && failedRows.length > 0) {
        await resolveFailedRows(failedRows as FailedRow[]);
      }
      if (cancelled) return;

      // 2) الصفوف الجاهزة فعلياً للمراجعة اليدوية
      const { data, error } = await supabase
        .from('bulk_import_queue')
        .select('id, file_path, suggested_section_id, suggested_title, created_at')
        .eq('portfolio_id', userId)
        .eq('status', 'classified')
        .order('created_at', { ascending: true });
      if (cancelled) return;

      if (error) {
        console.error('[BulkImportReview] تعذّر جلب الشواهد المصنّفة:', error.message);
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
      let localSyncFailed = false;
      const succeededIds: string[] = [];
      for (const row of targetRows) {
        const edit = getEdit(row);
        if (edit.sectionId == null || !edit.indicatorId) continue; // احتياط إضافي — الأزرار مُعطَّلة أصلاً لهذه الحالة

        // sub = اسم المؤشر المختار فعلياً لهذا الصف (لا subs[0] الثابت) — حتى
        // يُصنَّف الشاهد محلياً (state.ev) تحت نفس المؤشر المسجَّل في evidence
        // عبر indicator_id، بدل الانحياز دائماً لأول مؤشر بالقسم
        const indicatorName = indicatorsBySection[edit.sectionId]?.find(i => i.id === edit.indicatorId)?.name_ar ?? 'عام';
        const result = await saveEvidence({
          section_id: edit.sectionId,
          indicator_id: edit.indicatorId,
          sub: indicatorName,
          title: edit.title.trim() || 'شاهد من الاستيراد الجماعي',
          evidence_type: 'image',
          file_url: publicUrlFor(row.file_path),
        });
        if (result) {
          succeededIds.push(row.id);
          if (!result.localSyncOk) localSyncFailed = true;
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
        if (localSyncFailed) {
          onToast?.('تم حفظ الشواهد، لكن تعذّر تحديث العرض المحلي لبعضها — يرجى تحديث الصفحة', '⚠️');
        } else {
          onToast?.(`تم اعتماد ${succeededIds.length} ${succeededIds.length === 1 ? 'شاهد' : 'شواهد'} بنجاح ✅`, '✅');
        }
      } else if (succeededIds.length > 0) {
        onToast?.(`تم اعتماد ${succeededIds.length} من ${targetRows.length}، تعذّر حفظ الباقي ❌`, '⚠️');
      } else {
        onToast?.('تعذّر حفظ الشواهد، حاول مرة أخرى ❌', '❌');
      }
    } catch (err) {
      console.error('[BulkImportReview] فشل اعتماد الشواهد:', err);
      onToast?.('تعذّر حفظ الشواهد، حاول مرة أخرى ❌', '❌');
    } finally {
      setConfirmingKey(null);
    }
  };

  const acceptAll = () => confirmRows(rows, 'all');
  const acceptOne = (row: ClassifiedRow) => confirmRows([row], row.id);

  const isBusy = confirmingKey !== null;
  const isRowReady = (row: ClassifiedRow): boolean => {
    const edit = getEdit(row);
    return edit.sectionId != null && !!edit.indicatorId;
  };
  const allRowsReady = rows.length > 0 && rows.every(isRowReady);

  return (
    <BottomSheet isOpen={isOpen} onClose={isBusy ? () => {} : onClose}>
      <div className="flex items-center justify-between px-6 pt-1 pb-4 border-b border-[var(--line)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--gold)]/10 border border-[var(--gold)]/20 flex items-center justify-center text-[18px] text-[var(--gold3)]">
            <i className="ti ti-photo-check" />
          </div>
          <div className="text-[16px] font-black text-white">مراجعة الاستيراد الجماعي</div>
        </div>
        <button
          onClick={isBusy ? undefined : onClose}
          disabled={isBusy}
          className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px] disabled:opacity-40 disabled:cursor-wait"
        >
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-5 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <i className="ti ti-loader animate-spin text-[28px] text-[var(--em8)]" />
            <p className="text-[13px] text-[var(--text4)] font-semibold">جارٍ التحميل...</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-[var(--text4)] text-center py-6">لا توجد شواهد جاهزة للمراجعة حالياً</p>
        ) : (
          <>
            <button
              type="button"
              disabled={isBusy || !allRowsReady}
              onClick={acceptAll}
              title={!allRowsReady ? 'أكمل اختيار القسم والمؤشر لكل الصفوف أولاً' : undefined}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13.5px] font-bold bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {confirmingKey === 'all' ? (
                <><i className="ti ti-loader animate-spin" /> جارٍ الاعتماد...</>
              ) : (
                <><i className="ti ti-checks" /> قبول الكل ({rows.length})</>
              )}
            </button>

            <div className="space-y-2.5">
              {rows.map(row => {
                const edit = getEdit(row);
                const sectionLabel = edit.sectionId != null ? sections.find(s => s.id === edit.sectionId)?.ttl : null;
                const rowBusy = isBusy; // isBusy = confirmingKey !== null — يعطّل كل الأزرار أثناء أي اعتماد جارٍ، لا الصف المحدد فقط
                return (
                  <div key={row.id} className="flex flex-col gap-2.5 p-3.5 bg-white/[0.03] rounded-xl border border-[var(--line)]">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-lg shrink-0 overflow-hidden border border-[var(--gold)]/20 bg-[var(--gold)]/10">
                        <img src={publicUrlFor(row.file_path)} alt="" className="w-full h-full object-cover" />
                      </div>
                      <input
                        type="text"
                        value={edit.title}
                        disabled={rowBusy}
                        onChange={e => setEdits(prev => ({ ...prev, [row.id]: { ...edit, title: e.target.value } }))}
                        placeholder="عنوان الشاهد"
                        className="flex-1 min-w-0 py-2 px-3 text-[12.5px] font-bold text-white bg-white/5 border border-[var(--line2)] rounded-lg outline-none focus:border-[var(--em7)]/40 disabled:opacity-50"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11.5px] text-[var(--text4)] font-bold shrink-0">القسم:</span>
                        <span className="text-[12px] font-bold text-[var(--text2)] truncate">{sectionLabel ?? 'بلا قسم — اختر قسماً'}</span>
                      </div>
                      <SectionReclassifyDropdown
                        sections={sections}
                        isOpen={openDropdownId === row.id}
                        isBusy={rowBusy}
                        onOpen={() => setOpenDropdownId(row.id)}
                        onClose={() => setOpenDropdownId(null)}
                        onSelect={(sectionId) => {
                          setOpenDropdownId(null);
                          const numericId = Number(sectionId);
                          // تصفير المؤشر عند تغيير القسم — مؤشرات القسم الجديد مختلفة تماماً
                          setEdits(prev => ({ ...prev, [row.id]: { ...edit, sectionId: numericId, indicatorId: null } }));
                          ensureIndicatorsLoaded(numericId);
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] text-[var(--text4)] font-bold shrink-0">المؤشر الفرعي:</span>
                      {edit.sectionId == null ? (
                        <span className="text-[11.5px] text-[var(--text4)] italic">اختر قسماً أولاً</span>
                      ) : (
                        <SelectDropdown
                          options={(indicatorsBySection[edit.sectionId] ?? []).map(i => ({ value: i.id, label: i.name_ar }))}
                          value={edit.indicatorId ?? ''}
                          onChange={v => setEdits(prev => ({ ...prev, [row.id]: { ...edit, indicatorId: v || null } }))}
                          placeholder="— اختر المؤشر —"
                          triggerClassName="py-2 px-3 text-[12px] font-bold bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40 cursor-pointer min-w-[160px]"
                          allowClear
                        />
                      )}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={rowBusy || !isRowReady(row)}
                        onClick={() => acceptOne(row)}
                        title={!isRowReady(row) ? 'اختر القسم والمؤشر الفرعي أولاً' : undefined}
                        className="py-2 px-3.5 text-[12px] font-bold rounded-lg bg-[var(--em7)]/15 text-[var(--em8)] border border-[var(--em7)]/25 hover:bg-[var(--em7)]/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                      >
                        {rowBusy ? <i className="ti ti-loader animate-spin text-[13px]" /> : <><i className="ti ti-check text-[13px]" /> قبول</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { SectionReclassifyDropdown } from './Dashboard';
import { supabase } from '../supabaseClient';
import type { SectionData, Evidence } from '../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../hooks/useSupabaseEvidence').useSupabaseEvidence>;

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
}

interface BulkImportReviewProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  sections: SectionData[];
  supabaseEv?: SupabaseEvidenceHook;
  onAddEv?: (
    sid: number,
    sub: string,
    type: 'pdf' | 'img' | 'doc' | 'vid',
    name: string,
    url?: string,
    stratFields?: Pick<Evidence, 'stratDate' | 'stratStage' | 'stratGrade' | 'stratPeriod' | 'stratSubject'>,
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
export default function BulkImportReview({ isOpen, onClose, userId, sections, supabaseEv, onAddEv, onToast }: BulkImportReviewProps) {
  const [rows, setRows] = useState<ClassifiedRow[]>([]);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [loading, setLoading] = useState(false);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null); // 'all' أو id الصف الجاري اعتماده
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const getEdit = (row: ClassifiedRow): RowEdit =>
    edits[row.id] ?? { sectionId: row.suggested_section_id, title: row.suggested_title ?? '' };

  const resolveFailedRows = async (failedRows: FailedRow[]) => {
    if (!supabase || !userId || failedRows.length === 0) return;
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
          if (!next[row.id]) next[row.id] = { sectionId: row.suggested_section_id, title: row.suggested_title ?? '' };
        }
        return next;
      });
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const confirmRows = async (targetRows: ClassifiedRow[], busyKey: string) => {
    if (!supabase || !userId || targetRows.length === 0) return;
    setConfirmingKey(busyKey);
    try {
      const payload = targetRows.map(row => {
        const edit = getEdit(row);
        return {
          portfolio_id: userId,
          section_id: edit.sectionId,
          title: edit.title.trim() || 'شاهد من الاستيراد الجماعي',
          evidence_type: 'image' as const,
          file_url: publicUrlFor(row.file_path),
        };
      });

      // INSERT دفعي واحد لكل الصفوف المعتمدة، وليس حلقة نداءات منفصلة
      const { data: inserted, error } = await supabase.from('evidence').insert(payload).select();
      if (error || !inserted) throw error ?? new Error('insert_failed');

      // تحديث العداد الشهري + الحالة المحلية لكل قسم متأثر — نفس onAddEv
      // المستخدم بعد كل إدخال شاهد بالمشروع (التقاط سريع/تسجيل صوتي)، ويُتخطّى
      // للشواهد التي بقيت بلا قسم (section_id null لم تُحتسب بـ monthly_progress أصلاً)
      inserted.forEach((ev: any) => {
        if (ev.section_id != null) {
          const sec = sections.find(s => s.id === ev.section_id);
          onAddEv?.(ev.section_id, sec?.subs[0] ?? 'عام', 'img', ev.title, ev.file_url ?? undefined, undefined, ev.created_at);
        }
      });

      // الحذف من الطابور فقط بعد نجاح الإدخال في evidence — لو فشل الإدخال لن نصل هنا إطلاقاً
      const ids = targetRows.map(r => r.id);
      const { error: delErr } = await supabase.from('bulk_import_queue').delete().in('id', ids);
      if (delErr) {
        console.error('[BulkImportReview] تعذّر حذف صفوف الطابور بعد الإدخال الناجح:', delErr.message);
      }

      await supabaseEv?.refetch();
      setRows(prev => prev.filter(r => !ids.includes(r.id)));
      onToast?.(`تم اعتماد ${inserted.length} ${inserted.length === 1 ? 'شاهد' : 'شواهد'} بنجاح ✅`, '✅');
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
              disabled={isBusy}
              onClick={acceptAll}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13.5px] font-bold bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white disabled:opacity-40 disabled:cursor-wait cursor-pointer"
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
                      <div className="flex items-center gap-2 shrink-0">
                        <SectionReclassifyDropdown
                          sections={sections}
                          isOpen={openDropdownId === row.id}
                          isBusy={rowBusy}
                          onOpen={() => setOpenDropdownId(row.id)}
                          onClose={() => setOpenDropdownId(null)}
                          onSelect={(sectionId) => {
                            setOpenDropdownId(null);
                            setEdits(prev => ({ ...prev, [row.id]: { ...edit, sectionId: Number(sectionId) } }));
                          }}
                        />
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => acceptOne(row)}
                          className="py-2 px-3.5 text-[12px] font-bold rounded-lg bg-[var(--em7)]/15 text-[var(--em8)] border border-[var(--em7)]/25 hover:bg-[var(--em7)]/25 transition-colors disabled:opacity-50 disabled:cursor-wait cursor-pointer flex items-center gap-1.5"
                        >
                          {rowBusy ? <i className="ti ti-loader animate-spin text-[13px]" /> : <><i className="ti ti-check text-[13px]" /> قبول</>}
                        </button>
                      </div>
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

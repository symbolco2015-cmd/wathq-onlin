import type { EvidenceType, SupabaseEvidence } from './useSupabaseEvidence';

type SupabaseEvidenceHook = ReturnType<typeof import('./useSupabaseEvidence').useSupabaseEvidence>;
type AddEvidenceFn = SupabaseEvidenceHook['addEvidence'];

/** يُستدعى بعد نجاح إدراج الشاهد في evidence فقط — وظيفته الوحيدة تسجيل
 * الشاهد في عدّاد الشهر (monthly_progress) عبر recordEvidence في App.tsx. */
export type OnEvidenceSavedFn = (sectionId: number, createdAt?: string) => Promise<void> | void;

/** حمولة saveEvidence — indicator_id إلزامي هنا على مستوى TypeScript (خلافاً
 * لـaddEvidence الأصلي في useSupabaseEvidence، حيث يبقى اختيارياً عمداً —
 * تدفّق التسجيل الصوتي المعطَّل في useQuickCapture.ts ما زال خارج هذا التوحيد
 * ويستدعي addEvidence مباشرة بلا مؤشر). */
export interface SaveEvidencePayload {
  section_id: number;
  indicator_id: string;
  title: string;
  description?: string;
  impact?: string;
  context_grade?: string;
  context_subject?: string;
  academic_term?: string;
  evidence_type: EvidenceType;
  file_url?: string;
  link_url?: string;
  self_reflection?: string;
  frequency?: 'weekly' | 'semester';
  /** معرّف استراتيجية التدريس (بند 4 فقط) — يمر مباشرة إلى addEvidence. */
  strategy_id?: string;
}

export interface SaveEvidenceResult {
  evidence: SupabaseEvidence;
}

/**
 * يوحّد مسار كتابة شاهد جديد: (أ) INSERT في جدول evidence عبر addEvidence، ثم
 * (ب) عند نجاحه فقط — تسجيل الشاهد في عدّاد الشهر عبر onEvidenceSaved. إن
 * فشلت (أ) لا تُنفَّذ (ب) إطلاقاً، وتُرجع الدالة null بوضوح للمستدعي.
 *
 * يستقبل addEvidence/onEvidenceSaved كوسيطين بدل قراءتهما من hook مُنشأ
 * داخلياً، حتى يستدعيها كل مستهلك (EvidenceForm.tsx، useQuickCapture.ts،
 * BulkImportReview.tsx) بنفس props التي يتلقّاها أصلاً.
 */
export function useSaveEvidence(
  addEvidence: AddEvidenceFn | undefined,
  onEvidenceSaved: OnEvidenceSavedFn | undefined
) {
  const saveEvidence = async (
    payload: SaveEvidencePayload,
    createdAt?: string
  ): Promise<SaveEvidenceResult | null> => {
    if (!addEvidence) return null;

    const result = await addEvidence(payload, createdAt);
    if (!result) return null;

    if (payload.section_id != null) {
      await onEvidenceSaved?.(payload.section_id, createdAt);
    }

    return { evidence: result };
  };

  return { saveEvidence };
}

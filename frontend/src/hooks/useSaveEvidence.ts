import type { Evidence } from '../types';
import type { EvidenceType, SupabaseEvidence } from './useSupabaseEvidence';
import { supabaseEvidenceTypeToLocal } from '../utils';

type SupabaseEvidenceHook = ReturnType<typeof import('./useSupabaseEvidence').useSupabaseEvidence>;
type AddEvidenceFn = SupabaseEvidenceHook['addEvidence'];

type OnAddEvFn = (
  sid: number,
  sub: string,
  type: 'pdf' | 'img' | 'doc' | 'vid',
  name: string,
  url?: string,
  stratFields?: Pick<Evidence, 'stratDate' | 'stratStage' | 'stratGrade' | 'stratPeriod' | 'stratSubject'>,
  createdAt?: string
) => Promise<boolean> | void;

/** حمولة saveEvidence — المرحلة 1 من توحيد مسار الكتابة: indicator_id إلزامي
 * هنا على مستوى TypeScript (خلافاً لـaddEvidence الأصلي في useSupabaseEvidence،
 * حيث يبقى اختيارياً عمداً — مساران خارج هذا التوحيد، resolveFailedRows في
 * BulkImportReview.tsx وتدفّق التسجيل الصوتي المعطَّل في useQuickCapture.ts،
 * ما زالا يحفظان شواهد بلا مؤشر عبر addEvidence مباشرة). sub لا يزال مطلوباً
 * لأن saveEvidence يحدّث state.ev القديم أيضاً (عبر onAddEv) بنفس مفتاح
 * "${section_id}|${sub}" المعتاد — لا تغيير على قيمة sub نفسها هنا. */
export interface SaveEvidencePayload {
  section_id: number;
  indicator_id: string;
  sub: string;
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
  stratFields?: Pick<Evidence, 'stratDate' | 'stratStage' | 'stratGrade' | 'stratPeriod' | 'stratSubject'>;
}

export interface SaveEvidenceResult {
  evidence: SupabaseEvidence;
  /** false إن نجح إدراج evidence لكن فشل تحديث state.ev/monthly_progress
   *  المحلي (onAddEv → addEv → saveState رجعت false، مثلاً بسبب انقطاع اتصال
   *  لحظي بـSupabase). الشاهد موجود فعلاً في قاعدة البيانات (مصدر الحقيقة)،
   *  لكن مرآته المحلية القديمة (state.ev) والعدّاد الشهري لم يتحدّثا فوراً —
   *  المستدعي يقرر كيف يُبلغ المستخدم (toast تحذيري بدل "تم الحفظ" الصريح)
   *  بدل تجاهل هذا الفرق بصمت (انظر ملاحظة saveState/Promise<boolean> في
   *  useAppStore.ts وhandleAddEv في App.tsx). */
  localSyncOk: boolean;
}

/**
 * يوحّد مسار كتابة شاهد جديد، الذي كان يُنفَّذ يدوياً بخطوتين منفصلتين بكل
 * مستدعٍ على حدة: (أ) INSERT في جدول evidence عبر addEvidence، ثم (ب) عند
 * نجاحه فقط — تحديث state.ev + monthly_progress عبر onAddEv. إن فشلت (أ) لا
 * تُنفَّذ (ب) إطلاقاً، وتُرجع الدالة null بوضوح للمستدعي. إن نجحت (أ) لكن
 * فشلت (ب) — الشاهد موجود فعلياً، فلا تُرجع null (لا تدّعي فشلاً كاملاً)،
 * لكن localSyncOk=false تنقل الفرق للمستدعي بدل ابتلاعه.
 *
 * يستقبل addEvidence/onAddEv كوسيطين بدل قراءتهما من hook مُنشأ داخلياً، حتى
 * يستدعيها كل مستهلك (EvidenceForm.tsx، useQuickCapture.ts، BulkImportReview.tsx)
 * بنفس props التي يتلقّاها أصلاً (supabaseEv.addEvidence، onAddEv) دون أي
 * تعديل على تمرير هذه الـprops عبر App.tsx/Dashboard.tsx/EvidenceModal.tsx.
 */
export function useSaveEvidence(
  addEvidence: AddEvidenceFn | undefined,
  onAddEv: OnAddEvFn | undefined
) {
  const saveEvidence = async (
    payload: SaveEvidencePayload,
    createdAt?: string
  ): Promise<SaveEvidenceResult | null> => {
    if (!addEvidence) return null;

    const { sub, stratFields, ...evidencePayload } = payload;
    const result = await addEvidence(evidencePayload, createdAt);
    if (!result) return null;

    const localType = supabaseEvidenceTypeToLocal(payload.evidence_type);
    const localUrl = payload.file_url || payload.link_url || undefined;
    const localSyncResult = await onAddEv?.(payload.section_id, sub, localType, payload.title, localUrl, stratFields, createdAt);

    return { evidence: result, localSyncOk: localSyncResult !== false };
  };

  return { saveEvidence };
}

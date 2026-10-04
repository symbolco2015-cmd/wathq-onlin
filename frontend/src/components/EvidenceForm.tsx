import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';
import type { EvidenceType, SupabaseEvidence } from '../hooks/useSupabaseEvidence';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useSaveEvidence } from '../hooks/useSaveEvidence';
import type { OnEvidenceSavedFn } from '../hooks/useSaveEvidence';
import { AI_CONSENT_TEXT, formatDate } from '../utils';
import { SelectDropdown } from './UI';
import { LESSON_PLAN_SECTION_ID, SECS } from '../data';

type SupabaseEvidenceHook = ReturnType<typeof import('../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface Indicator {
  id: string;
  name_ar: string;
  /** مؤشر مخصص للمعلم — RLS تُرجع الرسمية ومخصص المعلم فقط، والوزن 99 يضعه بعد الرسمية */
  portfolio_id: string | null;
}

interface LessonPlanTemplate {
  id: string;
  title: string;
  content: string;
}

// مؤشر "إعداد خطة فصلية موزعة" ضمن بند 6 (إعداد خطة التعلم) — uuid فعلي
// تحقّقنا منه مباشرة على قاعدة الإنتاج (section_indicators)، لا افتراضاً.
// حقلا التكرار وزر "اكتب خطة من الصفر" مقصوران على هذا المؤشر تحديداً،
// بينما حقل "المادة" يظهر لكل مؤشرات هذا البند (LESSON_PLAN_SECTION_ID،
// مستورَد من data.ts). صار قابلاً للاشتقاق ديناميكياً الآن عبر useSections
// (sections.find(s => s.id === LESSON_PLAN_SECTION_ID)?.indicators.find(...))
// بدل هذا الحرفي — يبقى كما هو عمداً هنا: EvidenceForm لا يستقبل sections
// كـprop أصلاً (يجلب indicators الخاصة بقسمه مباشرة من section_indicators
// أدناه)، فربطه بـuseSections يستلزم تمرير prop إضافي بلا أي فائدة عملية
// لمكوّن واحد فقط. موثَّق بمصدره (قاعدة الإنتاج) لا مشتقّ.
const LESSON_PLAN_DISTRIBUTION_INDICATOR_ID = 'be68ebb3-8742-4619-bbf5-b3d79141e147';

export interface EvidenceFormProps {
  isOpen: boolean;
  /** إغلاق فعلي بلا أي تأكيد — النموذج يستدعيه بعد التأكيد أو حين لا يوجد
   *  ما يُفقد. الحاوية تستدعي requestClose() عبر الـ ref بدلاً منه. */
  onClose: () => void;
  sectionId: number;
  sub: string;
  userId: string | undefined;
  supabaseEv: SupabaseEvidenceHook;
  /** يسجّل الشاهد في عدّاد الشهر (monthly_progress) بعد نجاح إدراجه */
  onEvidenceSaved: OnEvidenceSavedFn;
  onToast: (msg: string, icon?: string) => void;
  /** يُمرَّر فقط عند الإضافة لبند 4 (استراتيجيات التدريس) — معرّف الاستراتيجية
   *  المختارة/المُنشأة حديثاً (teaching_strategies.id)، و`sub` حينها اسمها.
   *  وجوده يُشدّد شرط تفعيل زر الحفظ (لا يُفعَّل قبل إرفاق ملف/رابط فعلي). */
  strategyId?: string;
  /** يُمرَّر فقط عند الإضافة من أرشيف شهر سابق — يربط الشاهد بذلك الشهر بدل
   *  تاريخ اليوم الفعلي، في جدول evidence وفي monthly_progress معاً */
  createdAt?: string;
  aiConsentGiven?: boolean;
  onGiveAiConsent?: () => void;
  /** يُمرَّر فقط من تدفق "تحويل لشاهد" في أداة تحليل نتائج المتعلمين — الملف
   *  مرفوع مسبقاً لـ bucket evidence، فيُفتح النموذج بنوع "صورة" وعنوان
   *  وملف جاهزَين. النموذج لا يحذف هذا الملف أبداً: من رفعه مسؤول عنه. */
  prefill?: { title: string; fileUrl: string; fileName: string };
  /** يُمرَّر من زر «+» على بطاقة مؤشر في شاشة القسم — يُضبط قيمةً ابتدائية
   *  للمؤشر بعد تحميل مؤشرات القسم إن كان ضمنها، وإلا يبقى فارغاً. */
  indicatorId?: string;
  /** 'edit' يفتح النموذج على شاهد موجود (initial): لا رفع ولا حذف لأي ملف،
   *  والنوع والمرفق للعرض فقط. الافتراضي 'add'. */
  mode?: 'add' | 'edit';
  initial?: ExistingEvidence;
}

/** الشاهد الموجود الذي يُفتح عليه وضع التعديل */
export type ExistingEvidence = Pick<SupabaseEvidence,
  'id' | 'evidence_type' | 'file_url' | 'link_url' | 'title' | 'description' | 'impact' |
  'context_grade' | 'context_subject' | 'academic_term' | 'self_reflection' | 'frequency' | 'indicator_id' | 'strategy_id'>;

/** ما تكشفه EvidenceForm لحاويتها (EvidenceModal / BottomSheet): كل طرق
 *  الإغلاق من خارج النموذج (الخلفية، السحب) تمر عبر requestClose حتى يسأل
 *  «تجاهل الشاهد؟» قبل فقدان ما كُتب. */
export interface EvidenceFormHandle {
  requestClose: () => void;
}

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ── أنماط موحّدة (متغيرات docs/design/DESIGN.md فقط) ─────────────────
const INPUT_CLS = 'w-full h-11 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] text-[var(--t1)] outline-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
const TEXTAREA_CLS = 'w-full min-h-[88px] px-3 py-2.5 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-[var(--bg)] text-[length:var(--fs-sm)] leading-[1.7] text-[var(--t1)] outline-none resize-none transition-colors duration-150 placeholder:text-[var(--t3)] focus:border-[var(--accent)]';
const BAD_CLS = ' !border-[var(--danger)]';
const BTN_CLS = 'h-11 px-4 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-transparent text-[length:var(--fs-sm)] font-bold text-[var(--t1)] inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors duration-150 hover:border-[var(--t3)] disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_SM_CLS = 'h-9 px-3 rounded-[var(--r-sm)] border border-[var(--bd2)] bg-transparent text-[length:var(--fs-sm)] font-bold text-[var(--t1)] inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors duration-150 hover:border-[var(--t3)] disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_PRI_CLS = 'h-11 px-4 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--accent)] text-[length:var(--fs-sm)] font-bold text-[var(--bg)] inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_GH_SM_CLS = 'h-9 px-3 rounded-[var(--r-sm)] border border-transparent bg-transparent text-[length:var(--fs-sm)] font-bold text-[var(--t2)] inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer hover:text-[var(--t1)] disabled:opacity-40 disabled:cursor-not-allowed';
const ICON_BTN_SM_CLS = 'w-9 h-9 rounded-[var(--r-sm)] border border-[var(--bd2)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0 cursor-pointer hover:text-[var(--t1)]';
const SPIN_CLS = 'animate-spin motion-reduce:animate-none';

// accept لنوع 'file' يضم امتدادات + MIME types صريحة معاً: بعض متصفحات أندرويد
// (خصوصاً Chrome مع واجهات OEM مخصصة) تفتح معرض الصور افتراضياً حين يكون accept
// امتدادات نصية بحتة بدون MIME، لأن نظام أندرويد لا يستطيع حل intent الفلترة
// بثقة فيسقط على المعالج الوحيد المسجل (الصور). وجود MIME صريحة يحل المشكلة.
const FILE_ACCEPT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
].join(',');

// الترتيب مطابق لـ TYPES في النموذج الأولي
const TYPE_CONFIG: {
  id: EvidenceType;
  icon: string;
  label: string;
  accept?: string;
  /** سطر الأنواع والحجم الأقصى داخل مساحة .drop */
  hint: string;
  pickLabel: string;
  hasFile: boolean;
  hasLink: boolean;
  maxSizeMB: number;
  /** bucket تخزين مستقل لكل نوع — الفيديو له bucket وحد حجم خاصين به
   *  (evidence-video، 50MB) دون التأثير على حد bucket evidence الأصلي (10MB). */
  bucket: string;
}[] = [
  { id: 'image', icon: 'ti-photo',         label: 'صورة',   accept: 'image/*',                   hint: 'JPG · PNG · WEBP · حتى 10MB',            pickLabel: 'اختر صورة',  hasFile: true,  hasLink: false, maxSizeMB: 10, bucket: 'evidence' },
  { id: 'file',  icon: 'ti-file-type-pdf', label: 'ملف',    accept: FILE_ACCEPT,                 hint: 'PDF · Word · Excel · PowerPoint · حتى 10MB', pickLabel: 'اختر ملفاً', hasFile: true,  hasLink: false, maxSizeMB: 10, bucket: 'evidence' },
  { id: 'link',  icon: 'ti-link',          label: 'رابط',   accept: undefined,                   hint: '',                                        pickLabel: '',          hasFile: false, hasLink: true,  maxSizeMB: 0,  bucket: '' },
  { id: 'video', icon: 'ti-video',         label: 'فيديو',  accept: 'video/mp4,video/quicktime', hint: 'MP4 · MOV · حتى 50MB',                   pickLabel: 'اختر فيديو', hasFile: true,  hasLink: false, maxSizeMB: 50, bucket: 'evidence-video' },
  { id: 'note',  icon: 'ti-notes',         label: 'ملاحظة', accept: undefined,                   hint: '',                                        pickLabel: '',          hasFile: false, hasLink: false, maxSizeMB: 0,  bucket: '' },
];

// bucket استيراد Drive — ثابت في import-from-link (BUCKET = 'evidence')
const LINK_IMPORT_BUCKET = 'evidence';

/** أسماء ملفات تولّدها الكاميرات والجوالات بلا معنى — لا تصلح عنواناً.
 *  الأرقام بأشكالها الثلاثة: اللاتينية (0-9) والعربية الهندية (٠-٩) والفارسية (۰-۹). */
const MEANINGLESS_FILE_NAME = /^(?:[0-9٠-٩۰-۹\s_\-.()]+|(?:img|dsc|dscn|dcim|pxl|vid|mov|photo|image|video|scan|wa)[\s_\-]*[0-9٠-٩۰-۹][0-9٠-٩۰-۹\s_\-.()]*(?:[\s_\-]*wa[0-9٠-٩۰-۹]+)?|(?:screenshot|screen shot|لقطة شاشة|لقطة الشاشة).*)$/i;

const titleFromFileName = (name: string): string => {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return MEANINGLESS_FILE_NAME.test(base) ? '' : base;
};

const formatSize = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

/** مسار الملف داخل الـ bucket من رابطه العام (لملفات استيراد Drive، التي
 *  يُرجع ردها file_url فقط) */
const storagePathFromPublicUrl = (url: string, bucket: string): string | null => {
  const marker = `/storage/v1/object/public/${bucket}/`;
  try {
    const pathname = new URL(url).pathname;
    const i = pathname.indexOf(marker);
    return i < 0 ? null : decodeURIComponent(pathname.slice(i + marker.length));
  } catch {
    return null;
  }
};

interface StoredFile { bucket: string; path: string }

/** حذف ملفات يتيمة من Storage — الفشل لا يُظهر للمستخدم، تحذير في الـ console فقط */
const removeFromStorage = (files: StoredFile[]) => {
  if (!supabase || files.length === 0) return;
  const byBucket = new Map<string, string[]>();
  for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
  for (const [bucket, paths] of byBucket) {
    supabase.storage.from(bucket).remove(paths)
      .then(({ error }) => { if (error) console.warn('[EvidenceForm] تعذّر حذف ملف يتيم من Storage:', bucket, paths, error.message); })
      .catch(err => console.warn('[EvidenceForm] تعذّر حذف ملف يتيم من Storage:', bucket, paths, err));
  }
};

type ErrKey = 'indicator' | 'file' | 'link' | 'title' | 'description';
const ERR_ORDER: ErrKey[] = ['indicator', 'file', 'link', 'title', 'description'];

/** القيم التي يُقارَن بها النموذج لمعرفة هل هو «متسخ». في وضع التعديل (3.2ب)
 *  تُبنى من الشاهد الموجود بدل القيم الفارغة، وبقية المنطق كما هو. */
interface FormValues {
  title: string;
  indicatorId: string;
  evidenceType: EvidenceType;
  description: string;
  impact: string;
  contextGrade: string;
  academicTerm: string;
  selfReflection: string;
  linkUrl: string;
  contextSubject: string;
  frequency: 'weekly' | 'semester' | '';
  writeFromScratch: boolean;
  fileUrl: string;
}

// ── عناصر عرض صغيرة ───────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--danger)]">
      <i className="ti ti-alert-circle text-[16px]" /> {msg}
    </div>
  );
}

function Label({ children, hint, htmlFor, action }: { children: React.ReactNode; hint?: string; htmlFor?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <label htmlFor={htmlFor} className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">
        {children}
        {hint && <small className="ms-1.5 text-[length:var(--fs-xs)] font-normal text-[var(--t3)]">{hint}</small>}
      </label>
      {action && <div className="ms-auto">{action}</div>}
    </div>
  );
}

/**
 * نموذج إضافة الشاهد كاملاً (الرأس + المحتوى + الذيل) بدون حاوية خاصة به —
 * تتولى الحاوية (EvidenceModal على الديسكتوب، أو BottomSheet على الجوال)
 * شكل العرض الخارجي، وتستدعي requestClose() عبر الـ ref لكل إغلاق من خارجه.
 */
const EvidenceForm = forwardRef<EvidenceFormHandle, EvidenceFormProps>(function EvidenceForm({
  isOpen, onClose, sectionId, sub, userId, supabaseEv, onEvidenceSaved, onToast, createdAt,
  aiConsentGiven, onGiveAiConsent, prefill, strategyId, indicatorId: presetIndicatorId,
  mode = 'add', initial,
}, ref) {
  const isEdit = mode === 'edit' && !!initial;
  // مسار الكتابة الموحّد — INSERT في evidence، وعند نجاحه فقط تسجيل الشاهد
  // في monthly_progress عبر onEvidenceSaved (انظر useSaveEvidence.ts)
  const { saveEvidence } = useSaveEvidence(supabaseEv.addEvidence, onEvidenceSaved);

  const section = SECS.find(s => s.id === sectionId);

  // ── Form state ──────────────────────────────────────────────
  const [title,          setTitle]          = useState('');
  const [indicatorId,    setIndicatorId]    = useState('');
  const [evidenceType,   setEvidenceType]   = useState<EvidenceType>('image');
  const [description,    setDescription]    = useState('');
  const [impact,         setImpact]         = useState('');
  const [contextGrade,   setContextGrade]   = useState('');
  const [academicTerm,   setAcademicTerm]   = useState('');
  const [selfReflection, setSelfReflection] = useState('');
  const [linkUrl,        setLinkUrl]        = useState('');

  // ── حقول خاصة ببند "إعداد خطة التعلم" (section_id === 6) ───────────────
  const [contextSubject,   setContextSubject]   = useState('');
  const [frequency,        setFrequency]        = useState<'weekly' | 'semester' | ''>('');
  const [writeFromScratch, setWriteFromScratch] = useState(false);
  const [templates,        setTemplates]        = useState<LessonPlanTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const isLessonPlanSection = sectionId === LESSON_PLAN_SECTION_ID;
  const isDistributionIndicator = isLessonPlanSection && indicatorId === LESSON_PLAN_DISTRIBUTION_INDICATOR_ID;

  // ── Upload state ─────────────────────────────────────────────
  const [fileUrl,        setFileUrl]        = useState('');
  const [fileName,       setFileName]       = useState('');
  const [fileSize,       setFileSize]       = useState(0);
  /** معاينة الصورة في صف .picked — object URL محلي أو رابط prefill */
  const [thumbUrl,       setThumbUrl]       = useState('');
  const [uploading,      setUploading]      = useState(false);
  const [uploadSuccess,  setUploadSuccess]  = useState(false);

  // ── استيراد من رابط (Beta) — بديل لاختيار ملف من الجهاز ──
  const [linkImportFeatureEnabled, setLinkImportFeatureEnabled] = useState(false);
  const [showLinkImport,           setShowLinkImport]           = useState(false);
  const [linkImportUrl,            setLinkImportUrl]            = useState('');
  const [linkImportLoading,        setLinkImportLoading]        = useState(false);

  // ── Indicators ───────────────────────────────────────────────
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  /** 'error' يغطي فشل الاستعلام والنجاح-لكن-فارغ معاً: كلاهما يجعل الحفظ
   *  مستحيلاً بما أن indicatorId إلزامي — فيظهر خطأ صريح قابل لإعادة المحاولة. */
  const [indicatorsStatus, setIndicatorsStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // ── اقتراح تلقائي من الصورة (Beta) — قرار مستقل لكل حقل ─────
  const [aiSelectedFile,          setAiSelectedFile]          = useState<File | null>(null);
  const [aiConsentPromptOpen,     setAiConsentPromptOpen]     = useState(false);
  const [aiLoading,               setAiLoading]               = useState(false);
  const [aiTitleSuggestion,       setAiTitleSuggestion]       = useState('');
  const [aiIndicatorSuggestion,   setAiIndicatorSuggestion]   = useState<Indicator | null>(null);
  const [aiDescriptionSuggestion, setAiDescriptionSuggestion] = useState('');
  /** true بعد استلام رد ناجح من الدالة، بصرف النظر عن محتواه — تحكم عرض
   *  رسالة "لم يقترح النموذج مؤشراً بثقة كافية" فقط بعد محاولة فعلية */
  const [aiSuggestionAttempted,   setAiSuggestionAttempted]   = useState(false);
  const [aiFeatureEnabled,        setAiFeatureEnabled]        = useState(false);

  // ── التوثيق الصوتي (Beta) ────────────────────────────────────
  const voiceRecording = useVoiceRecording();
  const [voiceFeatureEnabled,    setVoiceFeatureEnabled]    = useState(false);
  const [voiceConsentPromptOpen, setVoiceConsentPromptOpen] = useState(false);
  const [voiceLoading,           setVoiceLoading]           = useState(false);
  const [voiceTranscript,        setVoiceTranscript]        = useState('');
  const [voiceSuggestedDesc,     setVoiceSuggestedDesc]     = useState('');

  // ── العرض والتحقق والإغلاق ──────────────────────────────────
  const [view,        setView]        = useState<'form' | 'pickIndicator' | 'success'>('form');
  const [errors,      setErrors]      = useState<Partial<Record<ErrKey, string>>>({});
  const [moreOpen,    setMoreOpen]    = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving,      setSaving]      = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Partial<Record<ErrKey, HTMLDivElement | null>>>({});
  const initialRef = useRef<FormValues | null>(null);
  /** كل ملف رفعه النموذج في هذه الجلسة ولم يُحفظ بعد — يُحذف عند التجاهل */
  const sessionUploadsRef = useRef<StoredFile[]>([]);
  /** الملف المرفق حالياً إن كان النموذج هو من رفعه (null لملف prefill) */
  const currentUploadRef = useRef<StoredFile | null>(null);
  /** يتغير مع كل إعادة ضبط — رفعٌ يكتمل بعد تغيّره يُحذف فوراً بدل تعليقه */
  const sessionSeqRef = useRef(0);

  const clearErr = (k: ErrKey) => setErrors(prev => {
    if (!prev[k]) return prev;
    const next = { ...prev };
    delete next[k];
    return next;
  });

  const revokeThumb = (url: string) => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); };

  const resetAiSuggestion = () => {
    setAiSelectedFile(null); setAiConsentPromptOpen(false); setAiLoading(false);
    setAiTitleSuggestion(''); setAiIndicatorSuggestion(null); setAiDescriptionSuggestion(''); setAiSuggestionAttempted(false);
  };

  /** يملأ النموذج بقيمه الابتدائية. usePrefill=false لـ«شاهد آخر لنفس المؤشر»
   *  (نموذج فارغ)، وkeepIndicatorId يُبقي المؤشر نفسه. */
  const resetForm = (opts: { usePrefill: boolean; keepIndicatorId?: string }) => {
    const pf = opts.usePrefill ? prefill : undefined;
    // وضع التعديل: القيم الابتدائية من الشاهد نفسه، فلا يُعدّ النموذج «متسخاً» قبل أي تغيير
    const ex = isEdit ? initial : undefined;
    const init: FormValues = ex ? {
      title: ex.title ?? '', indicatorId: ex.indicator_id ?? '', evidenceType: ex.evidence_type,
      description: ex.description ?? '', impact: ex.impact ?? '', contextGrade: ex.context_grade ?? '',
      academicTerm: ex.academic_term ?? '', selfReflection: ex.self_reflection ?? '', linkUrl: ex.link_url ?? '',
      contextSubject: ex.context_subject ?? '', frequency: ex.frequency ?? '', writeFromScratch: false,
      fileUrl: ex.file_url ?? '',
    } : {
      title: pf?.title ?? '', indicatorId: opts.keepIndicatorId ?? '', evidenceType: 'image',
      description: '', impact: '', contextGrade: '', academicTerm: '', selfReflection: '', linkUrl: '',
      contextSubject: '', frequency: '', writeFromScratch: false, fileUrl: pf?.fileUrl ?? '',
    };
    initialRef.current = init;
    sessionSeqRef.current += 1;
    sessionUploadsRef.current = [];
    currentUploadRef.current = null;

    setTitle(init.title); setIndicatorId(init.indicatorId); setEvidenceType(init.evidenceType);
    setDescription(init.description); setImpact(init.impact); setContextGrade(init.contextGrade);
    setAcademicTerm(init.academicTerm); setSelfReflection(init.selfReflection); setLinkUrl(init.linkUrl);
    setThumbUrl(prev => { revokeThumb(prev); return pf?.fileUrl ?? ''; });
    setFileUrl(init.fileUrl); setFileName(pf?.fileName ?? ''); setFileSize(0);
    setUploadSuccess(!!pf); setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setContextSubject(init.contextSubject); setFrequency(init.frequency); setWriteFromScratch(false); setSelectedTemplateId('');
    setShowLinkImport(false); setLinkImportUrl(''); setLinkImportLoading(false);
    resetAiSuggestion();
    setVoiceConsentPromptOpen(false); setVoiceLoading(false); setVoiceTranscript(''); setVoiceSuggestedDesc('');
    setView('form'); setErrors({}); setMoreOpen(false); setDiscardOpen(false); setSaving(false);
  };

  // إعادة الضبط عند كل فتح — أو البدء من قيم prefill لو مُمرَّرة
  useEffect(() => {
    if (!isOpen) return;
    resetForm({ usePrefill: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch indicators for this section
  const loadIndicators = useCallback(() => {
    if (!sectionId || !supabase) { setIndicators([]); setIndicatorsStatus('error'); return; }
    setIndicatorsStatus('loading');
    supabase
      .from('section_indicators')
      .select('id, name_ar, portfolio_id')
      .eq('section_id', sectionId)
      .order('weight', { ascending: true })
      .order('name_ar', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.warn('[EvidenceForm] تعذّر تحميل مؤشرات القسم:', error.message);
        if (error || !data || data.length === 0) { setIndicators([]); setIndicatorsStatus('error'); return; }
        setIndicators(data);
        setIndicatorsStatus('ready');
      });
  }, [sectionId]);

  useEffect(() => {
    if (!isOpen) return;
    loadIndicators();
  }, [isOpen, loadIndicators]);

  // شاهد الاستراتيجية (إضافة بـ strategyId، أو تعديل شاهد له strategy_id):
  // مؤشره الابتدائي «توظيف استراتيجيات تدريس متنوعة»، ولا يُنقل إلى «مراعاة
  // الفروق الفردية» — ذاك مؤشر شواهد بلا استراتيجية. التحديد بالاسم لا بالمعرّف.
  const isStrategyEvidence = isEdit ? !!initial?.strategy_id : !!strategyId;
  const pickableIndicators = isStrategyEvidence
    ? indicators.filter(ind => !ind.name_ar.includes('الفروق الفردية'))
    : indicators;
  const defaultStrategyIndicatorId = isStrategyEvidence && !isEdit
    ? indicators.find(ind => ind.name_ar.includes('توظيف استراتيجيات'))?.id
    : undefined;
  const effectivePresetId = presetIndicatorId ?? defaultStrategyIndicatorId;

  // المؤشر المحدد مسبقاً — يُطبَّق فقط حين تكتمل قائمة مؤشرات القسم ويكون ضمنها،
  // ويصير هو القيمة الابتدائية (فلا يُعدّ تطبيقه تعديلاً من المعلم).
  useEffect(() => {
    if (!isOpen || !effectivePresetId || indicatorsStatus !== 'ready') return;
    if (indicators.some(ind => ind.id === effectivePresetId)) {
      setIndicatorId(effectivePresetId);
      if (initialRef.current) initialRef.current = { ...initialRef.current, indicatorId: effectivePresetId };
    }
  }, [isOpen, effectivePresetId, indicatorsStatus, indicators]);

  // بوابة صلاحية ميزة "اقتراح تلقائي من الصورة" (Beta) — يديرها الأدمن عبر
  // feature_flags/portfolio_feature_overrides في قاعدة البيانات، وليست قائمة مكتوبة بالكود.
  useEffect(() => {
    if (!isOpen || !supabase) { setAiFeatureEnabled(false); return; }
    let cancelled = false;
    supabase
      .rpc('is_feature_enabled', { p_feature: 'image_suggestion' })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[EvidenceForm] تعذّر التحقق من صلاحية الميزة:', error.message); setAiFeatureEnabled(false); return; }
        setAiFeatureEnabled(!!data);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  // قوالب خطة الدرس (عامة من الأدمن + شخصية للمعلم) — تُجلب فقط عند فتح
  // النموذج لمؤشر "إعداد خطة فصلية موزعة"، حيث يظهر زر "اكتب خطة من الصفر".
  // فشل الجلب (مثلاً الجدول لم يُنشأ بعد على بيئة ما) لا يُسقط النموذج —
  // قائمة قوالب فارغة فقط، الكتابة الحرة تبقى متاحة دوماً.
  useEffect(() => {
    if (!isOpen || isEdit || !isDistributionIndicator || !supabase) { setTemplates([]); return; }
    supabase
      .from('lesson_plan_templates')
      .select('id, title, content')
      .or(`portfolio_id.is.null${userId ? `,portfolio_id.eq.${userId}` : ''}`)
      .then(({ data, error }) => {
        if (error) { console.warn('[EvidenceForm] تعذّر تحميل قوالب خطة الدرس:', error.message); setTemplates([]); return; }
        setTemplates(data ?? []);
      });
  }, [isOpen, isEdit, isDistributionIndicator, userId]);

  // بوابة صلاحية ميزة "التوثيق الصوتي" (Beta) — نفس آلية image_suggestion بمفتاح مستقل
  useEffect(() => {
    if (!isOpen || !supabase) { setVoiceFeatureEnabled(false); return; }
    let cancelled = false;
    supabase
      .rpc('is_feature_enabled', { p_feature: 'voice_documentation' })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[EvidenceForm] تعذّر التحقق من صلاحية ميزة التوثيق الصوتي:', error.message); setVoiceFeatureEnabled(false); return; }
        setVoiceFeatureEnabled(!!data);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  // بوابة صلاحية ميزة "استيراد من رابط" (Beta) — نفس آلية image_suggestion/voice_documentation بمفتاح مستقل
  useEffect(() => {
    if (!isOpen || !supabase) { setLinkImportFeatureEnabled(false); return; }
    let cancelled = false;
    supabase
      .rpc('is_feature_enabled', { p_feature: 'link_import' })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[EvidenceForm] تعذّر التحقق من صلاحية ميزة الاستيراد من رابط:', error.message); setLinkImportFeatureEnabled(false); return; }
        setLinkImportFeatureEnabled(!!data);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const matchedTypeConfig = TYPE_CONFIG.find(t => t.id === evidenceType);
  // 'audio' ليس ضمن أنواع الإضافة، ويصل فقط في وضع التعديل حيث لا تُستعمل
  // خصائص الرفع — الاحتياط يمنع الانكسار فقط، والعرض يأتي من typeMeta
  const currentTypeConfig = matchedTypeConfig ?? TYPE_CONFIG[0];
  const typeMeta = matchedTypeConfig
    ? { icon: matchedTypeConfig.icon, label: matchedTypeConfig.label }
    : evidenceType === 'audio'
      ? { icon: 'ti-microphone', label: 'تسجيل صوتي' }
      : { icon: 'ti-file-text', label: 'ملف' };
  const currentIndicator = indicators.find(ind => ind.id === indicatorId) ?? null;

  const isAiSuggestionEligible = aiFeatureEnabled && evidenceType === 'image';

  // ── الملفات اليتيمة ──────────────────────────────────────────
  /** يحذف الملف المرفق حالياً من Storage إن رفعه النموذج في هذه الجلسة.
   *  ملف prefill لا يُسجَّل في currentUploadRef أصلاً، فلا يُمس. */
  const discardCurrentUpload = () => {
    const cur = currentUploadRef.current;
    if (!cur) return;
    currentUploadRef.current = null;
    sessionUploadsRef.current = sessionUploadsRef.current.filter(f => !(f.bucket === cur.bucket && f.path === cur.path));
    removeFromStorage([cur]);
  };

  /** يفك المرفق الحالي عن النموذج (ويحذفه إن كان يتيماً) */
  const clearAttachment = () => {
    discardCurrentUpload();
    setFileUrl(''); setFileName(''); setFileSize(0); setUploadSuccess(false);
    setThumbUrl(prev => { revokeThumb(prev); return ''; });
    if (fileInputRef.current) fileInputRef.current.value = '';
    resetAiSuggestion();
  };

  const trackUpload = (file: StoredFile) => {
    sessionUploadsRef.current = [...sessionUploadsRef.current, file];
    currentUploadRef.current = file;
  };

  // ── التسخ وطلب الإغلاق ───────────────────────────────────────
  const isDirty = (): boolean => {
    const init = initialRef.current;
    if (!init) return false;
    if (uploading || linkImportLoading || sessionUploadsRef.current.length > 0) return true;
    const now: FormValues = {
      title, indicatorId, evidenceType, description, impact, contextGrade, academicTerm,
      selfReflection, linkUrl, contextSubject, frequency, writeFromScratch, fileUrl,
    };
    return (Object.keys(now) as (keyof FormValues)[]).some(k => now[k] !== init[k]);
  };

  const requestClose = () => {
    if (saving) return;
    if (view !== 'success' && isDirty()) { setDiscardOpen(true); return; }
    onClose();
  };

  useImperativeHandle(ref, () => ({ requestClose }));

  const confirmDiscard = () => {
    removeFromStorage(sessionUploadsRef.current);
    sessionUploadsRef.current = [];
    currentUploadRef.current = null;
    // أي رفع ما زال جارياً يرى الرقم الجديد فيحذف ملفه عند اكتماله
    sessionSeqRef.current += 1;
    setDiscardOpen(false);
    onClose();
  };

  // ── اقتراح تلقائي من الصورة (Beta) ───────────────────────────
  const runAiSuggestion = async () => {
    if (!aiSelectedFile || !supabase) return;
    setAiLoading(true);
    setAiTitleSuggestion('');
    setAiIndicatorSuggestion(null);
    setAiDescriptionSuggestion('');
    setAiSuggestionAttempted(false);
    try {
      const imageBase64 = await readFileAsBase64(aiSelectedFile);
      const { data, error } = await supabase.functions.invoke('suggest-from-image', {
        body: {
          imageBase64,
          mimeType: aiSelectedFile.type,
          section_id: sectionId,
        },
      });
      if (error) throw error;
      if (data?.error === 'daily_limit_reached') {
        onToast('الخدمة مشغولة حالياً، حاول لاحقاً', '');
        return;
      }
      if (data?.error) throw new Error(data.error);

      const gotTitle = typeof data?.title === 'string' && data.title.trim().length > 0;
      const gotDescription = typeof data?.description === 'string' && data.description.trim().length > 0;
      // indicator_id يرجع UUID فعلي فقط عند ثقة عالية (مُطبَّق في الدالة نفسها) —
      // نطابقه بقائمة indicators المحلية للحصول على name_ar القابل للعرض
      const matchedIndicator = typeof data?.indicator_id === 'string'
        ? indicators.find(ind => ind.id === data.indicator_id) ?? null
        : null;

      if (!gotTitle && !gotDescription && !matchedIndicator) throw new Error('empty suggestion');

      if (gotTitle) setAiTitleSuggestion((data.title as string).trim());
      if (gotDescription) setAiDescriptionSuggestion((data.description as string).trim());
      setAiIndicatorSuggestion(matchedIndicator);
      setAiSuggestionAttempted(true);
    } catch (err) {
      console.warn('[EvidenceForm] تعذّر توليد الاقتراح:', err);
      onToast('تعذّر توليد اقتراح الآن، يمكنك المتابعة بالكتابة يدوياً.', '');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiSuggestClick = () => {
    if (!aiConsentGiven) { setAiConsentPromptOpen(true); return; }
    runAiSuggestion();
  };

  const handleAiConsentAccept = () => {
    onGiveAiConsent?.();
    setAiConsentPromptOpen(false);
    runAiSuggestion();
  };

  // كل حقل له قبول/رفض مستقل — قبول حقل لا يمس حالة الحقول الأخرى المقترحة
  const acceptAiTitle = () => { setTitle(aiTitleSuggestion); clearErr('title'); setAiTitleSuggestion(''); };
  const dismissAiTitle = () => setAiTitleSuggestion('');

  const acceptAiIndicator = () => {
    if (aiIndicatorSuggestion) selectIndicator(aiIndicatorSuggestion.id);
    setAiIndicatorSuggestion(null);
  };
  const dismissAiIndicator = () => setAiIndicatorSuggestion(null);

  const acceptAiDescription = () => { setDescription(aiDescriptionSuggestion); clearErr('description'); setAiDescriptionSuggestion(''); };
  const dismissAiDescription = () => setAiDescriptionSuggestion('');

  // ── التوثيق الصوتي (Beta) ─────────────────────────────────────
  const runVoiceTranscription = async (audioBase64: string, mimeType: string) => {
    if (!supabase) return;
    setVoiceLoading(true);
    setVoiceTranscript('');
    setVoiceSuggestedDesc('');
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-voice', {
        body: {
          audioBase64,
          mimeType,
          section_id: sectionId,
          indicator_id: indicatorId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error === 'daily_limit_reached') {
        onToast('الخدمة مشغولة حالياً، حاول لاحقاً', '');
        return;
      }
      if (data?.error) throw new Error(data.error);
      setVoiceTranscript((data?.transcript as string) || '');
      setVoiceSuggestedDesc((data?.description as string) || '');
    } catch (err) {
      console.warn('[EvidenceForm] تعذّر تفريغ التسجيل الصوتي:', err);
      onToast('تعذّر تفريغ التسجيل الصوتي الآن، يمكنك المتابعة بالكتابة يدوياً.', '');
    } finally {
      setVoiceLoading(false);
    }
  };

  // بعد انتهاء التسجيل الصوتي (audioBase64 جاهز) — أرسله فوراً للتفريغ
  useEffect(() => {
    if (!voiceRecording.audioBase64) return;
    runVoiceTranscription(voiceRecording.audioBase64, voiceRecording.mimeType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRecording.audioBase64]);

  const handleVoiceButtonClick = () => {
    if (voiceRecording.isRecording) { voiceRecording.stopRecording(); return; }
    if (!aiConsentGiven) { setVoiceConsentPromptOpen(true); return; }
    voiceRecording.startRecording();
  };

  const handleVoiceConsentAccept = () => {
    onGiveAiConsent?.();
    setVoiceConsentPromptOpen(false);
    voiceRecording.startRecording();
  };

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) { setDescription(tpl.content); clearErr('description'); }
  };

  const acceptVoiceSuggestion = () => {
    setDescription(voiceSuggestedDesc);
    clearErr('description');
    setVoiceTranscript('');
    setVoiceSuggestedDesc('');
  };

  const dismissVoiceSuggestion = () => {
    setVoiceTranscript('');
    setVoiceSuggestedDesc('');
  };

  // ── المؤشر والنوع ────────────────────────────────────────────
  const selectIndicator = (id: string) => {
    setIndicatorId(id);
    clearErr('indicator');
    // «اكتب خطة من الصفر» مقصور على المؤشر الموزّع — تركه لا يُبقي الوضع معلّقاً
    if (!(isLessonPlanSection && id === LESSON_PLAN_DISTRIBUTION_INDICATOR_ID)) setWriteFromScratch(false);
  };

  const changeType = (type: EvidenceType) => {
    if (type === evidenceType) return;
    clearAttachment();
    setEvidenceType(type);
    setLinkUrl('');
    setShowLinkImport(false); setLinkImportUrl('');
    clearErr('file'); clearErr('link');
  };

  // الكتابة من الصفر تُحفظ «ملاحظة» بلا مرفق — فالدخول إليها كتغيير النوع:
  // المرفق الحالي يُحذف بدل أن يبقى يتيماً بعد الحفظ
  const toggleWriteFromScratch = () => {
    if (!writeFromScratch) {
      clearAttachment();
      setLinkUrl('');
      setShowLinkImport(false); setLinkImportUrl('');
      clearErr('file'); clearErr('link');
    } else {
      clearErr('description');
    }
    setWriteFromScratch(w => !w);
  };

  // ── File upload ───────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cfg = currentTypeConfig;
    const maxSizeMB = cfg.maxSizeMB;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setErrors(prev => ({ ...prev, file: `حجم الملف يتجاوز ${maxSizeMB}MB` }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // الاستبدال: الملف السابق يُحذف قبل رفع الجديد
    clearAttachment();
    clearErr('file');
    const seq = sessionSeqRef.current;
    setFileName(file.name);
    setFileSize(file.size);
    setUploading(true);
    try {
      let fileToUpload: File = file;

      if (file.type.startsWith('image/')) {
        try {
          const options = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: false };
          fileToUpload = await imageCompression(file, options);
        } catch (compressErr) {
          console.warn('[EvidenceForm] فشل ضغط الصورة، تم استخدام الملف الأصلي:', compressErr);
          fileToUpload = file;
        }
      }

      const ext      = file.name.split('.').pop();
      const rand     = Math.random().toString(36).substring(2, 9);
      const filePath = `${userId ?? 'guest'}/${Date.now()}_${rand}.${ext}`;

      let publicUrl: string;
      if (userId && supabase) {
        const { error } = await supabase.storage
          .from(cfg.bucket)
          .upload(filePath, fileToUpload, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        // أُغلق النموذج أو أُعيد ضبطه أثناء الرفع — الملف يتيم من لحظته
        if (seq !== sessionSeqRef.current) { removeFromStorage([{ bucket: cfg.bucket, path: filePath }]); return; }
        trackUpload({ bucket: cfg.bucket, path: filePath });
        publicUrl = supabase.storage.from(cfg.bucket).getPublicUrl(filePath).data.publicUrl;
      } else {
        await new Promise(r => setTimeout(r, 1200));
        if (seq !== sessionSeqRef.current) return;
        publicUrl = URL.createObjectURL(fileToUpload);
      }

      setFileUrl(publicUrl);
      setFileSize(fileToUpload.size);
      if (fileToUpload.type.startsWith('image/')) {
        setAiSelectedFile(fileToUpload);
        setThumbUrl(prev => { revokeThumb(prev); return URL.createObjectURL(fileToUpload); });
      }
      setUploadSuccess(true);
      // العنوان من اسم الملف فقط إن كان فارغاً وكان الاسم ذا معنى
      const suggestedTitle = titleFromFileName(file.name);
      if (suggestedTitle) {
        setTitle(prev => prev.trim() ? prev : suggestedTitle);
        clearErr('title');
      }
    } catch (err) {
      if (seq !== sessionSeqRef.current) return;
      const message = err instanceof Error ? err.message : '';
      if (/size/i.test(message)) {
        setErrors(prev => ({ ...prev, file: `حجم الملف يتجاوز ${maxSizeMB}MB` }));
      } else {
        onToast('تعذّر رفع الملف، يرجى المحاولة مجدداً.', '');
      }
      setFileName(''); setFileSize(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      if (seq === sessionSeqRef.current) setUploading(false);
    }
  };

  // ── استيراد من رابط (Beta) ────────────────────────────────────
  const handleLinkImport = async () => {
    if (!linkImportUrl.trim() || !supabase) return;
    const seq = sessionSeqRef.current;
    setLinkImportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-from-link', {
        body: { url: linkImportUrl.trim() },
      });
      if (error) throw error;
      const importedPath = typeof data?.file_url === 'string' ? storagePathFromPublicUrl(data.file_url, LINK_IMPORT_BUCKET) : null;
      if (seq !== sessionSeqRef.current) {
        if (importedPath) removeFromStorage([{ bucket: LINK_IMPORT_BUCKET, path: importedPath }]);
        return;
      }
      if (data?.error) {
        onToast(data.message, '');
        return;
      }

      // الاستيراد فوق ملف موجود: السابق يُحذف
      clearAttachment();
      clearErr('file');
      if (importedPath) trackUpload({ bucket: LINK_IMPORT_BUCKET, path: importedPath });
      setFileUrl(data.file_url);
      setFileName(data.file_name);
      setFileSize(typeof data.size === 'number' ? data.size : 0);
      setUploadSuccess(true);
      setShowLinkImport(false);
      setLinkImportUrl('');
      const suggestedTitle = typeof data.file_name === 'string' ? titleFromFileName(data.file_name) : '';
      if (suggestedTitle) {
        setTitle(prev => prev.trim() ? prev : suggestedTitle);
        clearErr('title');
      }
    } catch (err) {
      console.warn('[EvidenceForm] تعذّر الاستيراد من الرابط:', err);
      if (seq === sessionSeqRef.current) onToast('تعذّر الاستيراد، حاول مجدداً', '');
    } finally {
      if (seq === sessionSeqRef.current) setLinkImportLoading(false);
    }
  };

  // ── التحقق والحفظ ─────────────────────────────────────────────
  const validate = (): Partial<Record<ErrKey, string>> => {
    const e: Partial<Record<ErrKey, string>> = {};
    if (!indicatorId) e.indicator = 'اختر المؤشر';
    if (isEdit) {
      // الملف والرابط لا يتغيّران في وضع التعديل
    } else if (writeFromScratch) {
      if (!description.trim()) e.description = 'اكتب نص الخطة';
    } else {
      if (currentTypeConfig.hasFile && !fileUrl) e.file = 'أرفق الملف أولاً';
      if (currentTypeConfig.hasLink && !linkUrl.trim()) e.link = 'أضف الرابط';
    }
    if (!title.trim()) e.title = 'اكتب عنواناً للشاهد';
    return e;
  };

  const handleSave = async () => {
    const found = validate();
    setErrors(found);
    const first = ERR_ORDER.find(k => found[k]);
    if (first) {
      requestAnimationFrame(() => fieldRefs.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    if (isEdit && initial) {
      setSaving(true);
      try {
        const ok = await supabaseEv.updateEvidence(initial.id, {
          title:           title.trim(),
          description:     description.trim()    || null,
          impact:          impact.trim()         || null,
          context_grade:   contextGrade.trim()   || null,
          academic_term:   academicTerm          || null,
          self_reflection: selfReflection.trim() || null,
          indicator_id:    indicatorId,
          ...(isLessonPlanSection ? { context_subject: contextSubject.trim() || null } : {}),
          // نقل الشاهد بعيداً عن مؤشر الخطة الموزعة يفرّغ تكراره
          frequency:       isDistributionIndicator ? (frequency || null) : null,
        });
        if (ok) {
          onToast('حُفظت التعديلات');
          onClose();
        } else {
          onToast('تعذّر حفظ التعديلات، حاول مجدداً', '');
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    // الكتابة من الصفر تُنتج دائماً دليل "ملاحظة" بلا ملف مرفق
    const effectiveEvidenceType: EvidenceType = writeFromScratch ? 'note' : evidenceType;
    setSaving(true);
    try {
      const result = await saveEvidence({
        section_id:      sectionId,
        indicator_id:    indicatorId,
        title:           title.trim(),
        description:     description.trim()    || undefined,
        impact:          impact.trim()         || undefined,
        context_grade:   contextGrade.trim()   || undefined,
        context_subject: isLessonPlanSection ? (contextSubject.trim() || undefined) : undefined,
        academic_term:   academicTerm          || undefined,
        evidence_type:   effectiveEvidenceType,
        file_url:        writeFromScratch ? undefined : (fileUrl || undefined),
        link_url:        writeFromScratch ? undefined : (linkUrl.trim() || undefined),
        self_reflection: selfReflection.trim() || undefined,
        frequency:       isDistributionIndicator ? (frequency || undefined) : undefined,
        strategy_id:     strategyId,
      }, createdAt);

      if (result) {
        // حُفظ الملف مع الشاهد — لم يعد يتيماً
        sessionUploadsRef.current = [];
        currentUploadRef.current = null;
        setView('success');
      } else {
        onToast('تعذّر الحفظ، يرجى المحاولة مجدداً', '');
      }
    } finally {
      setSaving(false);
    }
  };

  // أدلة الاستراتيجيات (strategyId موجود) تشترط إرفاق ملف/رابط فعلي قبل تفعيل
  // زر الحفظ نفسه. نوع "ملاحظة" يبقى معطَّلاً دوماً لهذا التدفّق تحديداً.
  const hasAttachment = writeFromScratch
    ? true
    : currentTypeConfig.hasFile ? uploadSuccess
    : currentTypeConfig.hasLink ? linkUrl.trim().length > 0
    : false;
  const saveDisabled = isEdit
    ? saving
    : saving || uploading || linkImportLoading || (!!strategyId && !hasAttachment);

  const isMedia = !writeFromScratch && (evidenceType === 'image' || evidenceType === 'video');
  const sectionTitle = section?.ttl ?? '';
  const sectionIcon = section?.icon ?? 'ti-folder';

  // ── شاشة النجاح ───────────────────────────────────────────────
  if (view === 'success') {
    return (
      <>
        <div className="overflow-y-auto flex-1 px-[18px] pb-4">
          <div className="text-center pt-6 pb-2 px-2.5">
            <div className="w-16 h-16 rounded-full bg-[var(--accent)] text-[var(--bg)] flex items-center justify-center text-[32px] mx-auto">
              <i className="ti ti-check" />
            </div>
            <h3 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)] mt-3.5">حُفظ الشاهد</h3>
            <p className="text-[length:var(--fs-sm)] text-[var(--t2)] mt-1">
              {sectionTitle}{currentIndicator ? ` › ${currentIndicator.name_ar}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-[18px] pt-3 pb-[18px] border-t border-[var(--bd)] shrink-0">
          <button type="button" className={BTN_CLS + ' flex-1'} onClick={onClose}>تم</button>
          <button
            type="button"
            className={BTN_PRI_CLS + ' flex-1'}
            onClick={() => resetForm({ usePrefill: false, keepIndicatorId: indicatorId })}
          >
            <i className="ti ti-plus text-[20px]" /> شاهد آخر لنفس المؤشر
          </button>
        </div>
      </>
    );
  }

  // ── قائمة مؤشرات القسم الحالي ────────────────────────────────
  if (view === 'pickIndicator') {
    return (
      <>
        <div className="flex items-center gap-2.5 px-[18px] pt-3.5 pb-2.5 shrink-0">
          <button type="button" aria-label="رجوع" className={ICON_BTN_SM_CLS} onClick={() => setView('form')}>
            <i className="ti ti-arrow-right" />
          </button>
          <h3 className="flex-1 text-[length:var(--fs-md)] font-bold text-[var(--t1)]">اختر المؤشر</h3>
        </div>
        <div className="overflow-y-auto flex-1 px-[18px] pb-4">
          <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-2">{sectionTitle}</div>
          {indicatorsStatus === 'loading' && (
            <div className="flex items-center gap-2 text-[length:var(--fs-sm)] text-[var(--t2)] py-3">
              <i className={`ti ti-loader ${SPIN_CLS}`} /> جارٍ تحميل المؤشرات...
            </div>
          )}
          {indicatorsStatus === 'error' && (
            <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-[var(--r-sm)] border border-[var(--danger)]">
              <span className="text-[length:var(--fs-sm)] text-[var(--danger)] flex items-center gap-1.5">
                <i className="ti ti-alert-circle" /> تعذّر تحميل المؤشرات
              </span>
              <button type="button" className={BTN_SM_CLS} onClick={loadIndicators}>إعادة المحاولة</button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            {pickableIndicators.map(ind => (
              <button
                key={ind.id}
                type="button"
                onClick={() => { selectIndicator(ind.id); setView('form'); }}
                className={`w-full text-right flex items-center gap-2.5 py-2.5 px-3 rounded-[var(--r-md)] bg-[var(--s1)] border text-[length:var(--fs-sm)] text-[var(--t1)] cursor-pointer transition-colors duration-150 ${
                  ind.id === indicatorId ? 'border-[var(--accent)]' : 'border-[var(--bd)] hover:border-[var(--bd2)]'
                }`}
              >
                <span className="flex-1">
                  {ind.name_ar}
                  {ind.portfolio_id !== null && <small className="text-[length:var(--fs-xs)] text-[var(--t3)]"> · مخصص</small>}
                </span>
                {ind.id === indicatorId && <i className="ti ti-check text-[20px] text-[var(--accent)]" />}
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── النموذج ───────────────────────────────────────────────────
  return (
    <>
      {/* ── الرأس ── */}
      <div className="px-[18px] pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <h3 className="flex-1 text-[length:var(--fs-md)] font-bold text-[var(--t1)]">{isEdit ? 'تعديل الشاهد' : 'شاهد جديد'}</h3>
          <button type="button" aria-label="إغلاق" className={ICON_BTN_SM_CLS} onClick={requestClose}>
            <i className="ti ti-x" />
          </button>
        </div>
        {createdAt && (
          <div className="mt-1 flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--t3)]">
            <i className="ti ti-history text-[16px]" /> يُسجَّل ضمن أرشيف {formatDate(createdAt, 'monthYear')}
          </div>
        )}
      </div>

      {/* ── المحتوى ── */}
      <div className="overflow-y-auto flex-1 px-[18px] pt-1 pb-4">

        {/* 1. سطر السياق */}
        <div ref={el => { fieldRefs.current.indicator = el; }}>
          <div className={`flex items-center gap-2.5 py-2.5 px-3 rounded-[var(--r-sm)] bg-[var(--s2)] border ${errors.indicator ? 'border-[var(--danger)]' : 'border-[var(--bd)]'}`}>
            <span className="w-9 h-9 rounded-[var(--r-sm)] bg-[var(--s1)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0">
              <i className={`ti ${sectionIcon}`} />
            </span>
            <div className="min-w-0 flex-1">
              <small className="block text-[length:var(--fs-xs)] text-[var(--t3)] truncate">{strategyId ? sub : sectionTitle}</small>
              {currentIndicator
                ? <b className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{currentIndicator.name_ar}</b>
                : <b className="block text-[length:var(--fs-sm)] font-bold text-[var(--t3)]">اختر المؤشر</b>}
            </div>
            <button type="button" className={BTN_GH_SM_CLS} onClick={() => setView('pickIndicator')}>تغيير</button>
          </div>
          {indicatorsStatus === 'error' && (
            <div className="mt-1.5 flex items-center gap-2 text-[length:var(--fs-xs)] text-[var(--danger)]">
              <i className="ti ti-alert-circle text-[16px]" /> تعذّر تحميل المؤشرات
              <button type="button" className="underline cursor-pointer" onClick={loadIndicators}>إعادة المحاولة</button>
            </div>
          )}
          <FieldError msg={errors.indicator} />
        </div>

        {/* التكرار + الكتابة من الصفر — مقصوران على مؤشر "إعداد خطة فصلية موزعة"،
            ولا يُطويان لأنهما يغيّران شكل النموذج */}
        {isDistributionIndicator && (
          <div className="mt-3.5 p-3 rounded-[var(--r-md)] bg-[var(--s2)] border border-[var(--bd)]">
            <Label>التكرار</Label>
            <SelectDropdown
              options={[
                { value: 'weekly', label: 'أسبوعي' },
                { value: 'semester', label: 'فصلي كامل' },
              ]}
              value={frequency}
              onChange={v => setFrequency(v as 'weekly' | 'semester' | '')}
              placeholder="اختر التكرار"
              triggerClassName={INPUT_CLS + ' cursor-pointer'}
              allowClear
            />
            {!isEdit && (
              <button type="button" className={BTN_SM_CLS + ' mt-3'} onClick={toggleWriteFromScratch}>
                <i className={`ti ${writeFromScratch ? 'ti-file-upload' : 'ti-pencil'} text-[20px]`} />
                {writeFromScratch ? 'العودة لرفع ملف' : 'اكتب خطة من الصفر'}
              </button>
            )}
            {writeFromScratch && (
              <div className="mt-3">
                <Label hint="اختياري">ابدأ من قالب</Label>
                {templates.length > 0 ? (
                  <SelectDropdown
                    options={templates.map(t => ({ value: t.id, label: t.title }))}
                    value={selectedTemplateId}
                    onChange={applyTemplate}
                    placeholder="اختر قالباً"
                    triggerClassName={INPUT_CLS + ' cursor-pointer'}
                    allowClear
                  />
                ) : (
                  <p className="text-[length:var(--fs-xs)] text-[var(--t3)]">لا توجد قوالب متاحة حالياً، يمكنك الكتابة الحرة في «نص الخطة» أدناه.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* وضع التعديل: النوع والمرفق للعرض فقط — لا رفع ولا حذف لأي ملف */}
        {isEdit && initial && <>
          <div className="mt-3.5">
            <Label>النوع</Label>
            <div className="flex items-center gap-1.5 text-[length:var(--fs-sm)] font-bold text-[var(--t2)]">
              <i className={`ti ${typeMeta.icon} text-[16px]`} /> {typeMeta.label}
            </div>
          </div>

          {(initial.file_url || initial.link_url) && (
            <div className="mt-3.5">
              <Label>المرفق</Label>
              <div className="flex items-center gap-2.5 py-2.5 px-3 rounded-[var(--r-sm)] bg-[var(--s2)] border border-[var(--bd)]">
                <span className="w-11 h-11 rounded-[var(--r-sm)] bg-[var(--s3)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0 overflow-hidden">
                  {initial.evidence_type === 'image' && initial.file_url
                    ? <img src={initial.file_url} alt="" className="w-full h-full object-cover" />
                    : <i className={`ti ${typeMeta.icon}`} />}
                </span>
                <b className="min-w-0 flex-1 text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">
                  {initial.file_url ? 'الملف المرفق' : 'الرابط'}
                </b>
                <a
                  href={initial.file_url ?? initial.link_url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BTN_SM_CLS}
                >
                  <i className="ti ti-external-link text-[20px]" /> فتح
                </a>
              </div>
              <div className="mt-1.5 text-[length:var(--fs-xs)] text-[var(--t3)]">لتغيير الملف احذف الشاهد وأضفه من جديد</div>
            </div>
          )}
        </>}

        {!isEdit && !writeFromScratch && <>
          {/* 2. النوع */}
          <div className="mt-3.5">
            <Label>ماذا توثّق؟</Label>
            <div className="flex gap-1.5 flex-wrap">
              {TYPE_CONFIG.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => changeType(t.id)}
                  className={`h-9 px-3 rounded-[var(--r-full)] border text-[length:var(--fs-sm)] font-bold flex items-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                    evidenceType === t.id
                      ? 'bg-[var(--t1)] text-[var(--bg)] border-[var(--t1)]'
                      : 'border-[var(--bd2)] text-[var(--t2)] hover:text-[var(--t1)]'
                  }`}
                >
                  <i className={`ti ${t.icon} text-[16px]`} /> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. المرفق */}
          {currentTypeConfig.hasFile && (
            <div className="mt-3.5" ref={el => { fieldRefs.current.file = el; }}>
              <Label>المرفق</Label>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={currentTypeConfig.accept}
                onChange={handleFileChange}
              />
              {uploadSuccess && fileUrl ? (
                <div className="flex items-center gap-2.5 py-2.5 px-3 rounded-[var(--r-sm)] bg-[var(--s2)] border border-[var(--bd)]">
                  <span className="w-11 h-11 rounded-[var(--r-sm)] bg-[var(--s3)] text-[var(--t2)] flex items-center justify-center text-[20px] shrink-0 overflow-hidden">
                    {thumbUrl && evidenceType === 'image'
                      ? <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                      : <i className={`ti ${currentTypeConfig.icon}`} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)] break-all" dir="auto">{fileName}</b>
                    {fileSize > 0 && <small className="text-[length:var(--fs-xs)] text-[var(--t3)]" dir="ltr">{formatSize(fileSize)}</small>}
                  </div>
                  <button type="button" aria-label="إزالة الملف" className={ICON_BTN_SM_CLS} onClick={clearAttachment}>
                    <i className="ti ti-x" />
                  </button>
                </div>
              ) : (
                <div className={`border-[1.5px] border-dashed rounded-[var(--r-md)] p-[18px] text-center text-[length:var(--fs-sm)] text-[var(--t3)] ${errors.file ? 'border-[var(--danger)]' : 'border-[var(--bd2)]'}`}>
                  {uploading ? (
                    <>
                      <i className={`ti ti-loader text-[24px] text-[var(--t2)] ${SPIN_CLS}`} />
                      <div className="mt-1">جارٍ الرفع...</div>
                      <div className="text-[length:var(--fs-xs)] mt-0.5 break-all" dir="auto">{fileName}</div>
                    </>
                  ) : (
                    <>
                      <i className={`ti ${currentTypeConfig.icon} text-[24px]`} />
                      <div>{currentTypeConfig.hint}</div>
                      <button
                        type="button"
                        className={BTN_SM_CLS + ' mt-2'}
                        disabled={linkImportLoading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <i className="ti ti-upload text-[20px]" /> {currentTypeConfig.pickLabel}
                      </button>
                    </>
                  )}
                </div>
              )}
              <FieldError msg={errors.file} />

              {/* استيراد من رابط Drive (Beta) — بديل لاختيار ملف من الجهاز */}
              {linkImportFeatureEnabled && !uploading && (
                !showLinkImport ? (
                  <button
                    type="button"
                    onClick={() => setShowLinkImport(true)}
                    className={BTN_GH_SM_CLS + ' mt-1 -ms-3'}
                  >
                    <i className="ti ti-brand-google-drive text-[20px]" /> أو استيراد من Google Drive / Docs
                  </button>
                ) : (
                  <div className="mt-2.5">
                    <input
                      type="url"
                      className={INPUT_CLS}
                      placeholder="الصق رابط Google Drive أو Google Docs هنا"
                      value={linkImportUrl}
                      onChange={e => setLinkImportUrl(e.target.value)}
                      dir="ltr"
                      style={{ unicodeBidi: 'isolate' }}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={handleLinkImport}
                        disabled={!linkImportUrl.trim() || linkImportLoading}
                        className={BTN_SM_CLS}
                      >
                        {linkImportLoading
                          ? <><i className={`ti ti-loader ${SPIN_CLS}`} /> جارٍ الاستيراد...</>
                          : 'استيراد'}
                      </button>
                      <button
                        type="button"
                        disabled={linkImportLoading}
                        onClick={() => { setShowLinkImport(false); setLinkImportUrl(''); }}
                        className={BTN_GH_SM_CLS}
                      >
                        رجوع للرفع المباشر
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* تنبيه الخصوصية — للصورة والفيديو */}
              {isMedia && (
                <div className="flex gap-2.5 items-start mt-2.5 py-2.5 px-3 rounded-[var(--r-sm)] bg-[var(--warn)]/12 text-[length:var(--fs-xs)] text-[var(--t1)] leading-[1.7]">
                  <i className="ti ti-shield-check text-[20px] text-[var(--warn)] shrink-0" />
                  <div>تأكد أن الصورة لا تُظهر وجوه الطلاب أو بياناتهم دون إذن. الصور تظهر في صفحتك العامة.</div>
                </div>
              )}

              {/* اقتراح تلقائي من الصورة (Beta) — بعد نجاح رفع صورة فقط */}
              {isAiSuggestionEligible && uploadSuccess && aiSelectedFile && (
                aiConsentPromptOpen ? (
                  <div className="mt-2.5 p-3 rounded-[var(--r-md)] bg-[var(--s2)] border border-[var(--bd)]">
                    <p className="text-[length:var(--fs-xs)] text-[var(--t2)] leading-[1.7]">{AI_CONSENT_TEXT}</p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <button type="button" onClick={handleAiConsentAccept} className={BTN_SM_CLS + ' !border-[var(--accent)] !text-[var(--accent)]'}>أوافق ومتابعة</button>
                      <button type="button" onClick={() => setAiConsentPromptOpen(false)} className={BTN_GH_SM_CLS}>إلغاء</button>
                    </div>
                  </div>
                ) : (aiTitleSuggestion || aiIndicatorSuggestion || aiDescriptionSuggestion || aiSuggestionAttempted) ? (
                  <div className="mt-2.5 p-3 rounded-[var(--r-md)] bg-[var(--s2)] border border-[var(--bd)] flex flex-col gap-3.5">
                    <div className="flex items-center gap-1.5 text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">
                      <i className="ti ti-sparkles text-[16px] text-[var(--accent)]" /> اقتراح من الصورة
                    </div>

                    {/* اقتراح العنوان — قبول/رفض مستقل */}
                    {aiTitleSuggestion && (
                      <div>
                        <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-1.5">العنوان المقترح</div>
                        <input
                          type="text"
                          className={INPUT_CLS}
                          value={aiTitleSuggestion}
                          onChange={e => setAiTitleSuggestion(e.target.value)}
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button type="button" onClick={acceptAiTitle} className={BTN_SM_CLS}>استخدام هذا العنوان</button>
                          <button type="button" onClick={dismissAiTitle} className={BTN_GH_SM_CLS}>تجاهل</button>
                        </div>
                      </div>
                    )}

                    {/* اقتراح المؤشر — قبول/رفض مستقل، أو رسالة إن لم تكن الثقة كافية */}
                    {aiIndicatorSuggestion ? (
                      <div>
                        <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-1.5">المؤشر المقترح</div>
                        <div className="text-[length:var(--fs-sm)] text-[var(--t1)] py-2.5 px-3 rounded-[var(--r-sm)] bg-[var(--bg)] border border-[var(--bd2)]">{aiIndicatorSuggestion.name_ar}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <button type="button" onClick={acceptAiIndicator} className={BTN_SM_CLS}>استخدام هذا المؤشر</button>
                          <button type="button" onClick={dismissAiIndicator} className={BTN_GH_SM_CLS}>تجاهل</button>
                        </div>
                      </div>
                    ) : aiSuggestionAttempted && (
                      <div className="text-[length:var(--fs-xs)] text-[var(--t3)] flex items-center gap-1.5">
                        <i className="ti ti-info-circle text-[16px]" /> لم يقترح النموذج مؤشراً بثقة كافية، يمكنك اختياره من «تغيير» أعلاه
                      </div>
                    )}

                    {/* اقتراح الوصف — قبول/رفض مستقل */}
                    {aiDescriptionSuggestion && (
                      <div>
                        <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-1.5">الوصف المقترح</div>
                        <textarea
                          className={TEXTAREA_CLS}
                          value={aiDescriptionSuggestion}
                          onChange={e => setAiDescriptionSuggestion(e.target.value)}
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button type="button" onClick={acceptAiDescription} className={BTN_SM_CLS}>استخدام هذا الوصف</button>
                          <button type="button" onClick={dismissAiDescription} className={BTN_GH_SM_CLS}>تجاهل</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleAiSuggestClick}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-1.5 mt-2 py-1.5 px-2.5 rounded-[var(--r-full)] bg-[var(--accent)]/12 text-[length:var(--fs-xs)] font-bold text-[var(--accent)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {aiLoading
                      ? <><i className={`ti ti-loader text-[16px] ${SPIN_CLS}`} /> جارٍ التحليل...</>
                      : <><i className="ti ti-sparkles text-[16px]" /> اقترح العنوان والوصف من الصورة</>}
                  </button>
                )
              )}
            </div>
          )}

          {/* الرابط */}
          {currentTypeConfig.hasLink && (
            <div className="mt-3.5" ref={el => { fieldRefs.current.link = el; }}>
              <Label htmlFor="ev-link">الرابط</Label>
              <input
                id="ev-link"
                type="url"
                className={INPUT_CLS + (errors.link ? BAD_CLS : '')}
                placeholder="https://drive.google.com/..."
                value={linkUrl}
                onChange={e => { setLinkUrl(e.target.value); clearErr('link'); }}
                dir="ltr"
                style={{ unicodeBidi: 'isolate' }}
              />
              <FieldError msg={errors.link} />
            </div>
          )}
        </>}

        {/* 4. العنوان */}
        <div className="mt-3.5" ref={el => { fieldRefs.current.title = el; }}>
          <Label htmlFor="ev-title">العنوان</Label>
          <input
            id="ev-title"
            type="text"
            className={INPUT_CLS + (errors.title ? BAD_CLS : '')}
            placeholder="مثال: تحضير درس الأسبوع الرابع"
            value={title}
            onChange={e => { setTitle(e.target.value); clearErr('title'); }}
          />
          <FieldError msg={errors.title} />
        </div>

        {/* 5. الوصف (أو نص الخطة في وضع الكتابة من الصفر) */}
        <div className="mt-3.5" ref={el => { fieldRefs.current.description = el; }}>
          <Label
            htmlFor="ev-desc"
            hint={writeFromScratch ? undefined : 'اختياري، ويظهر في صفحتك العامة، ويُبنى منه ملخص القسم'}
            action={voiceFeatureEnabled && (
              <button
                type="button"
                onClick={handleVoiceButtonClick}
                disabled={voiceLoading}
                title={voiceRecording.isRecording ? 'إيقاف التسجيل' : 'توثيق صوتي'}
                className={BTN_GH_SM_CLS + (voiceRecording.isRecording ? ' !text-[var(--danger)]' : ' !text-[var(--accent)]')}
              >
                {voiceRecording.isRecording
                  ? <><i className="ti ti-player-stop text-[20px]" /> إيقاف · {voiceRecording.secondsElapsed}ث</>
                  : <><i className="ti ti-microphone text-[20px]" /> بالصوت</>}
              </button>
            )}
          >
            {writeFromScratch ? 'نص الخطة' : 'الوصف'}
          </Label>

          {voiceFeatureEnabled && voiceConsentPromptOpen && (
            <div className="mb-2.5 p-3 rounded-[var(--r-md)] bg-[var(--s2)] border border-[var(--bd)]">
              <p className="text-[length:var(--fs-xs)] text-[var(--t2)] leading-[1.7]">{AI_CONSENT_TEXT}</p>
              <div className="flex items-center gap-2 mt-2.5">
                <button type="button" onClick={handleVoiceConsentAccept} className={BTN_SM_CLS + ' !border-[var(--accent)] !text-[var(--accent)]'}>أوافق ومتابعة</button>
                <button type="button" onClick={() => setVoiceConsentPromptOpen(false)} className={BTN_GH_SM_CLS}>إلغاء</button>
              </div>
            </div>
          )}

          {voiceFeatureEnabled && voiceRecording.error && (
            <FieldError msg={voiceRecording.error} />
          )}

          {voiceFeatureEnabled && voiceLoading && (
            <div className="flex items-center gap-2 text-[length:var(--fs-xs)] text-[var(--t2)] mb-2.5">
              <i className={`ti ti-loader ${SPIN_CLS}`} /> جارٍ تفريغ التسجيل الصوتي...
            </div>
          )}

          {voiceFeatureEnabled && !voiceLoading && (voiceTranscript || voiceSuggestedDesc) && (
            <div className="mb-2.5 p-3 rounded-[var(--r-md)] bg-[var(--s2)] border border-[var(--bd)] flex flex-col gap-3">
              <div>
                <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-1.5">التفريغ النصي</div>
                <textarea className={TEXTAREA_CLS} value={voiceTranscript} onChange={e => setVoiceTranscript(e.target.value)} />
              </div>
              <div>
                <div className="text-[length:var(--fs-xs)] text-[var(--t3)] mb-1.5">الوصف المقترح</div>
                <textarea className={TEXTAREA_CLS} value={voiceSuggestedDesc} onChange={e => setVoiceSuggestedDesc(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={acceptVoiceSuggestion} className={BTN_SM_CLS}>استخدام هذا الوصف</button>
                <button type="button" onClick={dismissVoiceSuggestion} className={BTN_GH_SM_CLS}>تجاهل</button>
              </div>
            </div>
          )}

          <textarea
            id="ev-desc"
            className={TEXTAREA_CLS + (writeFromScratch ? ' min-h-[200px]' : '') + (errors.description ? BAD_CLS : '')}
            placeholder={writeFromScratch ? 'اكتب خطة الدرس هنا، أو ابدأ من قالب أعلاه...' : 'ماذا يُثبت هذا الشاهد؟'}
            value={description}
            onChange={e => { setDescription(e.target.value); clearErr('description'); }}
          />
          <FieldError msg={errors.description} />
        </div>

        {/* 6. تفاصيل إضافية — مطوية افتراضياً */}
        <button
          type="button"
          onClick={() => setMoreOpen(o => !o)}
          aria-expanded={moreOpen}
          className="flex items-center gap-1.5 mt-3.5 text-[length:var(--fs-sm)] font-bold text-[var(--t2)] cursor-pointer hover:text-[var(--t1)]"
        >
          <i className={`ti ${moreOpen ? 'ti-chevron-up' : 'ti-chevron-down'} text-[20px]`} /> تفاصيل إضافية
        </button>

        {moreOpen && <>
          <div className="mt-3.5">
            <Label htmlFor="ev-impact">الأثر والنتيجة</Label>
            <textarea
              id="ev-impact"
              className={TEXTAREA_CLS}
              placeholder="ما الأثر الذي أحدثه هذا العمل على الطلاب أو البيئة التعليمية؟"
              value={impact}
              onChange={e => setImpact(e.target.value)}
            />
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ev-grade">الصف الدراسي</Label>
              <input
                id="ev-grade"
                type="text"
                className={INPUT_CLS}
                placeholder="مثال: الثالث متوسط"
                value={contextGrade}
                onChange={e => setContextGrade(e.target.value)}
              />
            </div>
            <div>
              <Label>الفصل الدراسي</Label>
              <SelectDropdown
                options={[
                  { value: 'الأول', label: 'الفصل الأول' },
                  { value: 'الثاني', label: 'الفصل الثاني' },
                ]}
                value={academicTerm}
                onChange={setAcademicTerm}
                placeholder="اختر الفصل"
                triggerClassName={INPUT_CLS + ' cursor-pointer'}
                allowClear
              />
            </div>
          </div>

          {/* المادة — لكل مؤشرات بند "إعداد خطة التعلم" */}
          {isLessonPlanSection && (
            <div className="mt-3.5">
              <Label htmlFor="ev-subject">المادة</Label>
              <input
                id="ev-subject"
                type="text"
                className={INPUT_CLS}
                placeholder="مثال: الرياضيات"
                value={contextSubject}
                onChange={e => setContextSubject(e.target.value)}
              />
            </div>
          )}

          <div className="mt-3.5">
            <Label htmlFor="ev-reflection">التأمل الذاتي</Label>
            <textarea
              id="ev-reflection"
              className={TEXTAREA_CLS}
              placeholder="ما الذي تعلمته من هذه التجربة؟ وكيف ستحسّن ممارستك مستقبلاً؟"
              value={selfReflection}
              onChange={e => setSelfReflection(e.target.value)}
            />
          </div>
        </>}
      </div>

      {/* ── الذيل ── */}
      <div className="flex gap-2 px-[18px] pt-3 pb-[18px] border-t border-[var(--bd)] shrink-0">
        <button type="button" className={BTN_CLS + ' flex-1 !border-transparent !text-[var(--t2)]'} onClick={requestClose}>
          إلغاء
        </button>
        <button type="button" className={BTN_PRI_CLS + ' flex-1'} onClick={handleSave} disabled={saveDisabled}>
          {saving
            ? <><i className={`ti ti-loader ${SPIN_CLS}`} /> جارٍ الحفظ...</>
            : isEdit ? 'حفظ التعديلات' : 'حفظ الشاهد'}
        </button>
      </div>

      {/* ── تأكيد التجاهل ── */}
      {discardOpen && <>
        <div className="absolute inset-0 z-10 bg-black/55" onClick={() => setDiscardOpen(false)} />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ev-discard-title"
          className="absolute z-20 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,calc(100%-28px))] p-[18px] rounded-[var(--r-lg)] bg-[var(--s1)] border border-[var(--bd2)]"
        >
          <h3 id="ev-discard-title" className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">تجاهل الشاهد؟</h3>
          <p className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-[1.8] mt-2">لم يُحفظ ما كتبته بعد.</p>
          <div className="flex gap-2 mt-4">
            <button type="button" className={BTN_CLS + ' flex-1'} onClick={() => setDiscardOpen(false)}>متابعة التعديل</button>
            <button type="button" className={BTN_CLS + ' flex-1 !text-[var(--danger)] !border-[var(--danger)]'} onClick={confirmDiscard}>تجاهل</button>
          </div>
        </div>
      </>}
    </>
  );
});

export default EvidenceForm;

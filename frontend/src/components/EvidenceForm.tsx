import React, { useState, useEffect, useCallback, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';
import type { EvidenceType } from '../hooks/useSupabaseEvidence';
import type { Evidence } from '../types';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useSaveEvidence } from '../hooks/useSaveEvidence';
import { AI_CONSENT_TEXT } from '../utils';
import { SelectDropdown } from './UI';
import { LESSON_PLAN_SECTION_ID } from '../data';

type SupabaseEvidenceHook = ReturnType<typeof import('../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface Indicator {
  id: string;
  name_ar: string;
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
  onClose: () => void;
  sectionId: number;
  sub: string;
  userId: string | undefined;
  supabaseEv: SupabaseEvidenceHook;
  /** يحفظ في state.ev المحلي أيضاً للتوافق مع النظام القديم */
  onAddEv: (
    sid: number,
    sub: string,
    type: 'pdf' | 'img' | 'doc' | 'vid',
    name: string,
    url?: string,
    stratFields?: Pick<Evidence, 'stratDate' | 'stratStage' | 'stratGrade' | 'stratPeriod' | 'stratSubject'>,
    createdAt?: string
  ) => void;
  onToast: (msg: string, icon?: string) => void;
  /** يُمرَّر فقط عند الإضافة من أرشيف شهر سابق — يربط الشاهد بذلك الشهر بدل
   *  تاريخ اليوم الفعلي، في جدول evidence وفي monthly_progress معاً */
  createdAt?: string;
  aiConsentGiven?: boolean;
  onGiveAiConsent?: () => void;
  /** يُمرَّر فقط من تدفق "تحويل لشاهد" في أداة تحليل نتائج المتعلمين — الملف
   *  مرفوع مسبقاً لـ bucket evidence، فيُفتح النموذج بنوع "صورة" وعنوان
   *  وملف جاهزَين بدل حقول فارغة، مع بقاء كل الحقول قابلة للتعديل. */
  prefill?: { title: string; fileUrl: string; fileName: string };
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

// نمط الإدخال الموحّد لحقول النموذج
const INPUT_CLS = 'w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-xl text-[13.5px] font-[var(--font)] text-white outline-none transition-all duration-200 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_3px_rgba(42,122,68,.12)]';

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

const TYPE_CONFIG: {
  id: EvidenceType;
  icon: string;
  label: string;
  color: string;
  accept?: string;
  hint: string;
  hasFile: boolean;
  hasLink: boolean;
  maxSizeMB: number;
  /** bucket تخزين مستقل لكل نوع — الفيديو له bucket وحد حجم خاصين به
   *  (evidence-video، 50MB) دون التأثير على حد bucket evidence الأصلي (10MB). */
  bucket: string;
}[] = [
  { id: 'file',  icon: 'ti-file-type-pdf', label: 'ملف',    color: '#f87171', accept: FILE_ACCEPT,                  hint: 'PDF · DOC · XLS · PPT', hasFile: true,  hasLink: false, maxSizeMB: 10, bucket: 'evidence' },
  { id: 'image', icon: 'ti-photo',          label: 'صورة',   color: '#93c5fd', accept: 'image/*',                    hint: 'JPG · PNG · WEBP',       hasFile: true,  hasLink: false, maxSizeMB: 10, bucket: 'evidence' },
  { id: 'video', icon: 'ti-video',          label: 'فيديو',  color: '#fb923c', accept: 'video/mp4,video/quicktime',  hint: 'MP4 · MOV',              hasFile: true,  hasLink: false, maxSizeMB: 50, bucket: 'evidence-video' },
  { id: 'link',  icon: 'ti-link',           label: 'رابط',   color: '#4ade80', accept: undefined,                    hint: '',                       hasFile: false, hasLink: true  , maxSizeMB: 0,  bucket: '' },
  { id: 'note',  icon: 'ti-notes',          label: 'ملاحظة', color: '#c4b5fd', accept: undefined,                    hint: '',                       hasFile: false, hasLink: false, maxSizeMB: 0,  bucket: '' },
];

/**
 * يحتوي على نموذج إضافة الشاهد كاملاً (الترويسة + المحتوى + الفوتر) بدون أي
 * حاوية/overlay خاصة به — تتولى الحاوية المستدعية (EvidenceModal على
 * الديسكتوب، أو BottomSheet على الجوال) تحديد شكل العرض الخارجي.
 */
export default function EvidenceForm({
  isOpen, onClose, sectionId, sub, userId, supabaseEv, onAddEv, onToast, createdAt,
  aiConsentGiven, onGiveAiConsent, prefill,
}: EvidenceFormProps) {
  // مسار الكتابة الموحّد — INSERT في evidence، وعند نجاحه فقط تحديث state.ev
  // + monthly_progress عبر onAddEv (انظر useSaveEvidence.ts)
  const { saveEvidence } = useSaveEvidence(supabaseEv.addEvidence, onAddEv);

  // ── Form state ──────────────────────────────────────────────
  const [title,          setTitle]          = useState('');
  const [indicatorId,    setIndicatorId]    = useState('');
  const [evidenceType,   setEvidenceType]   = useState<EvidenceType>('file');
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

  // ── حقول سياقية خاصة بأدلة الاستراتيجيات فقط (sub يبدأ بـ "strat:") ─────
  const [stratDate,    setStratDate]    = useState('');
  const [stratStage,   setStratStage]   = useState('');
  const [stratGrade,   setStratGrade]   = useState('');
  const [stratPeriod,  setStratPeriod]  = useState('');
  const [stratSubject, setStratSubject] = useState('');
  const isStratEvidence = sub.startsWith('strat:');

  // ── Upload state ─────────────────────────────────────────────
  const [fileUrl,        setFileUrl]        = useState('');
  const [fileName,       setFileName]       = useState('');
  const [uploading,      setUploading]      = useState(false);
  const [uploadSuccess,  setUploadSuccess]  = useState(false);

  // ── Indicators ───────────────────────────────────────────────
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  /** 'error' يغطي فشل الاستعلام والنجاح-لكن-فارغ معاً: كلاهما يجعل الحفظ
   *  مستحيلاً بما أن indicatorId إلزامي الآن — فلا يجوز إخفاء الحقل بصمت في
   *  أي منهما، بل إظهار خطأ صريح قابل لإعادة المحاولة مكانه. */
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

  // ── Misc ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form whenever modal opens — أو ابدأ من قيم prefill لو مُمرَّرة
  // (تدفق "تحويل لشاهد": الملف مرفوع مسبقاً، لا حاجة لإعادة رفعه)
  useEffect(() => {
    if (!isOpen) return;
    setTitle(prefill?.title ?? ''); setIndicatorId(''); setEvidenceType(prefill ? 'image' : 'file');
    setDescription(''); setImpact(''); setContextGrade('');
    setAcademicTerm(''); setSelfReflection(''); setLinkUrl('');
    setFileUrl(prefill?.fileUrl ?? ''); setFileName(prefill?.fileName ?? ''); setUploadSuccess(!!prefill);
    setStratDate(''); setStratStage(''); setStratGrade(''); setStratPeriod(''); setStratSubject('');
    setContextSubject(''); setFrequency(''); setWriteFromScratch(false); setSelectedTemplateId('');
    setAiSelectedFile(null); setAiConsentPromptOpen(false); setAiLoading(false);
    setAiTitleSuggestion(''); setAiIndicatorSuggestion(null); setAiDescriptionSuggestion(''); setAiSuggestionAttempted(false);
    setVoiceConsentPromptOpen(false); setVoiceLoading(false); setVoiceTranscript(''); setVoiceSuggestedDesc('');
  }, [isOpen]);

  // Fetch indicators for this section
  const loadIndicators = useCallback(() => {
    if (!sectionId || !supabase) { setIndicators([]); setIndicatorsStatus('error'); return; }
    setIndicatorsStatus('loading');
    supabase
      .from('section_indicators')
      .select('id, name_ar')
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
    if (!isOpen || !isDistributionIndicator || !supabase) { setTemplates([]); return; }
    supabase
      .from('lesson_plan_templates')
      .select('id, title, content')
      .or(`portfolio_id.is.null${userId ? `,portfolio_id.eq.${userId}` : ''}`)
      .then(({ data, error }) => {
        if (error) { console.warn('[EvidenceForm] تعذّر تحميل قوالب خطة الدرس:', error.message); setTemplates([]); return; }
        setTemplates(data ?? []);
      });
  }, [isOpen, isDistributionIndicator, userId]);

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

  const currentTypeConfig = TYPE_CONFIG.find(t => t.id === evidenceType)!;

  const isAiSuggestionEligible = aiFeatureEnabled && evidenceType === 'image';

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
        onToast('الخدمة مشغولة حالياً، حاول لاحقاً', '⏳');
        return;
      }
      if (data?.error) throw new Error(data.error);

      const gotTitle = typeof data?.title === 'string' && data.title.trim().length > 0;
      const gotDescription = typeof data?.description === 'string' && data.description.trim().length > 0;
      // indicator_id يرجع UUID فعلي فقط عند ثقة عالية (مُطبَّق في الدالة نفسها) —
      // نطابقه بقائمة indicators المحلية (نفس القائمة المعروضة في select القسم)
      // للحصول على name_ar القابل للعرض، UUID وحده غير مفيد للمعلم
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
      onToast('تعذّر توليد اقتراح الآن، يمكنك المتابعة بالكتابة يدوياً.', '⚠️');
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
  const acceptAiTitle = () => { setTitle(aiTitleSuggestion); setAiTitleSuggestion(''); };
  const dismissAiTitle = () => setAiTitleSuggestion('');

  const acceptAiIndicator = () => {
    if (aiIndicatorSuggestion) setIndicatorId(aiIndicatorSuggestion.id);
    setAiIndicatorSuggestion(null);
  };
  const dismissAiIndicator = () => setAiIndicatorSuggestion(null);

  const acceptAiDescription = () => { setDescription(aiDescriptionSuggestion); setAiDescriptionSuggestion(''); };
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
        onToast('الخدمة مشغولة حالياً، حاول لاحقاً', '⏳');
        return;
      }
      if (data?.error) throw new Error(data.error);
      setVoiceTranscript((data?.transcript as string) || '');
      setVoiceSuggestedDesc((data?.description as string) || '');
    } catch (err) {
      console.warn('[EvidenceForm] تعذّر تفريغ التسجيل الصوتي:', err);
      onToast('تعذّر تفريغ التسجيل الصوتي الآن، يمكنك المتابعة بالكتابة يدوياً.', '⚠️');
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
    if (tpl) setDescription(tpl.content);
  };

  const acceptVoiceSuggestion = () => {
    setDescription(voiceSuggestedDesc);
    setVoiceTranscript('');
    setVoiceSuggestedDesc('');
  };

  const dismissVoiceSuggestion = () => {
    setVoiceTranscript('');
    setVoiceSuggestedDesc('');
  };

  // ── File upload ───────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeMB = currentTypeConfig.maxSizeMB;
    if (file.size > maxSizeMB * 1024 * 1024) {
      onToast(`حجم الملف يتجاوز الحد المسموح (${maxSizeMB} MB).`, '❌');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileName(file.name);
    setUploading(true);
    setUploadSuccess(false);
    setFileUrl('');
    setAiSelectedFile(null);
    setAiTitleSuggestion(''); setAiIndicatorSuggestion(null); setAiDescriptionSuggestion(''); setAiSuggestionAttempted(false);
    setAiConsentPromptOpen(false);
    try {
      let fileToUpload: File = file;

      if (file.type.startsWith('image/')) {
        onToast('جاري تجهيز الصورة...', '🗜️');
        try {
          const options = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: false };
          fileToUpload = await imageCompression(file, options);
        } catch (compressErr) {
          console.warn('[EvidenceForm] فشل ضغط الصورة، تم استخدام الملف الأصلي:', compressErr);
          fileToUpload = file;
        }
        setAiSelectedFile(fileToUpload);
      }

      const ext      = file.name.split('.').pop();
      const rand     = Math.random().toString(36).substring(2, 9);
      const filePath = `${userId ?? 'guest'}/${Date.now()}_${rand}.${ext}`;

      if (userId && supabase) {
        const bucket = currentTypeConfig.bucket;
        const { error } = await supabase.storage
          .from(bucket)
          .upload(filePath, fileToUpload, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        setFileUrl(urlData.publicUrl);
      } else {
        await new Promise(r => setTimeout(r, 1200));
        setFileUrl(URL.createObjectURL(fileToUpload));
      }
      setUploadSuccess(true);
      onToast('تم رفع الملف بنجاح ☁️', '🚀');
    } catch (err: any) {
      const msg = /size/i.test(err?.message ?? '')
        ? `حجم الملف يتجاوز الحد المسموح (${maxSizeMB} MB).`
        : 'تعذّر رفع الملف، يرجى المحاولة مجدداً.';
      onToast(msg, '❌');
      setFileName('');
    } finally {
      setUploading(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { onToast('يرجى إدخال عنوان الشاهد', '⚠️'); return; }
    if (!indicatorId) { onToast('يرجى اختيار المؤشر الفرعي', '⚠️'); return; }
    if (writeFromScratch) {
      if (!description.trim()) { onToast('يرجى كتابة نص الخطة', '⚠️'); return; }
    } else {
      if (currentTypeConfig.hasFile && !fileUrl) { onToast('يرجى رفع الملف أولاً', '⚠️'); return; }
      if (currentTypeConfig.hasLink && !linkUrl.trim()) { onToast('يرجى إدخال الرابط', '⚠️'); return; }
    }

    // الكتابة من الصفر تُنتج دائماً دليل "ملاحظة" بلا ملف مرفق، بصرف النظر عن
    // نوع الشاهد المختار أعلاه (مخفي أصلاً في هذا الوضع)
    const effectiveEvidenceType: EvidenceType = writeFromScratch ? 'note' : evidenceType;
    // sub يُشتَق من المؤشر المختار فعلياً (indicatorId)، لا من prop sub القادم
    // من البطاقة التي فُتح منها النموذج — قد يختلفان لأن indicatorId يبدأ
    // فارغاً دوماً (انظر useEffect أعلاه) ويُعاد اختياره يدوياً من كل مؤشرات
    // القسم، لا مقيَّداً بمؤشر البطاقة الأصلية. عدم الاشتقاق يحفظ الشاهد فعلياً
    // تحت indicator_id واحد بينما يظهر محلياً (state.ev) تحت مفتاح "sub" آخر.
    // مستثنى لأدلة الاستراتيجيات (isStratEvidence): مفتاحها "strat:اسم" اصطناعي
    // بالكامل من state.strats ولا يقابله أي صف في section_indicators إطلاقاً،
    // فلا يوجد name_ar يُشتَق منه — يبقى sub الأصلي هو المصدر الوحيد هناك.
    const effectiveSub = isStratEvidence ? sub : (indicators.find(i => i.id === indicatorId)?.name_ar ?? sub);
    const stratFields = isStratEvidence ? {
      stratDate:    stratDate || undefined,
      stratStage:   stratStage ? (stratStage as 'ابتدائي' | 'متوسط' | 'ثانوي') : undefined,
      stratGrade:   stratGrade.trim() || undefined,
      stratPeriod:  stratPeriod ? Number(stratPeriod) : undefined,
      stratSubject: stratSubject.trim() || undefined,
    } : undefined;

    setSaving(true);
    try {
      const result = await saveEvidence({
        section_id:      sectionId,
        indicator_id:    indicatorId,
        sub:             effectiveSub,
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
        stratFields,
      }, createdAt);

      if (result) {
        if (result.localSyncOk) {
          onToast('تم إضافة الشاهد بنجاح ✅', '✅');
        } else {
          onToast('تم حفظ الشاهد، لكن تعذّر تحديث العرض المحلي — يرجى تحديث الصفحة', '⚠️');
        }
        onClose();
      } else {
        onToast('تعذّر الحفظ، يرجى المحاولة مجدداً', '❌');
      }
    } finally {
      setSaving(false);
    }
  };

  const inputCls = INPUT_CLS;
  const labelCls = 'text-[11.5px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-1.5 flex items-center gap-1.5';

  return (
    <>
      {/* Top accent line */}
      <div className="absolute top-0 right-[10%] left-[10%] h-[1.5px] bg-gradient-to-r from-transparent via-[var(--em7)] to-transparent" />

      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-7 pt-7 pb-5 border-b border-[var(--line)] shrink-0">
        <div className="w-[48px] h-[48px] rounded-2xl bg-gradient-to-br from-[var(--em3)] to-[var(--em5)] text-[var(--em8)] flex items-center justify-center text-[22px] border border-[var(--em7)]/20 shadow-[0_4px_16px_rgba(42,122,68,.3)]">
          <i className="ti ti-paperclip" />
        </div>
        <div className="flex-1">
          <div className="text-[18px] font-black text-white">إضافة شاهد جديد</div>
          <div className="text-[12px] text-[var(--text4)] mt-0.5">{sub.startsWith('strat:') ? `استراتيجية: ${sub.replace('strat:', '')}` : sub}</div>
          {createdAt && (
            <div className="text-[11px] text-[var(--gold)] mt-1 flex items-center gap-1 font-bold">
              <i className="ti ti-history" /> سيُسجَّل هذا الشاهد ضمن أرشيف {new Date(createdAt).toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-white/5 border border-[var(--line)] text-[var(--text4)] hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-[18px]"
        >
          <i className="ti ti-x" />
        </button>
      </div>

      {/* ── Body (scrollable) ── */}
      <div className="overflow-y-auto flex-1 px-7 py-6 space-y-5">

        {/* العنوان */}
        <div>
          <div className={labelCls}><i className="ti ti-text-size text-[var(--em7)]" /> عنوان الشاهد <span className="text-red-400">*</span></div>
          <input
            type="text"
            className={inputCls}
            placeholder="مثال: تقرير نتائج الاختبار التكويني"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        {/* المؤشر الفرعي — إلزامي؛ فشل الجلب أو نتيجة فارغة يُعرَضان كخطأ
            صريح بدل إخفاء الحقل (كان يجعل الحفظ مستحيلاً بصمت) */}
        {indicators.length > 0 ? (
          <div>
            <div className={labelCls}><i className="ti ti-list-check text-[var(--em7)]" /> المؤشر الفرعي <span className="text-red-400">*</span></div>
            <SelectDropdown
              options={indicators.map(i => ({ value: i.id, label: i.name_ar }))}
              value={indicatorId}
              onChange={setIndicatorId}
              placeholder="— اختر المؤشر —"
              triggerClassName={inputCls + ' cursor-pointer'}
            />
          </div>
        ) : indicatorsStatus === 'error' ? (
          <div>
            <div className={labelCls}><i className="ti ti-list-check text-[var(--em7)]" /> المؤشر الفرعي <span className="text-red-400">*</span></div>
            <div className="flex items-center justify-between gap-3 py-3 px-4 bg-red-500/5 border border-red-500/20 rounded-xl">
              <span className="text-[12.5px] text-red-400 font-semibold flex items-center gap-1.5">
                <i className="ti ti-alert-triangle" /> تعذّر تحميل المؤشرات، أعد المحاولة
              </span>
              <button
                type="button"
                onClick={loadIndicators}
                className="py-1.5 px-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-[11.5px] font-bold cursor-pointer shrink-0"
              >
                إعادة المحاولة
              </button>
            </div>
          </div>
        ) : null}

        {/* المادة — تظهر لكل مؤشرات بند "إعداد خطة التعلم" */}
        {isLessonPlanSection && (
          <div>
            <div className={labelCls}><i className="ti ti-book text-[var(--em7)]" /> المادة</div>
            <input
              type="text"
              className={inputCls}
              placeholder="مثال: الرياضيات"
              value={contextSubject}
              onChange={e => setContextSubject(e.target.value)}
            />
          </div>
        )}

        {/* التكرار + الكتابة من الصفر — مقصوران على مؤشر "إعداد خطة فصلية موزعة" */}
        {isDistributionIndicator && (
          <div className="bg-[var(--em7)]/5 border border-[var(--em7)]/15 rounded-2xl p-4 space-y-3.5">
            <div>
              <div className={labelCls}><i className="ti ti-repeat text-[var(--em7)]" /> التكرار</div>
              <SelectDropdown
                options={[
                  { value: 'weekly', label: 'أسبوعي' },
                  { value: 'semester', label: 'فصلي كامل' },
                ]}
                value={frequency}
                onChange={v => setFrequency(v as 'weekly' | 'semester' | '')}
                placeholder="— اختر —"
                triggerClassName={inputCls + ' cursor-pointer'}
                allowClear
              />
            </div>
            <button
              type="button"
              onClick={() => setWriteFromScratch(w => !w)}
              className="flex items-center gap-2 py-2 px-4 rounded-lg bg-[var(--em6)]/15 border border-[var(--em6)]/30 text-[var(--em8)] text-[12px] font-bold cursor-pointer"
            >
              <i className={`ti ${writeFromScratch ? 'ti-file-upload' : 'ti-pencil'}`} />
              {writeFromScratch ? 'العودة لرفع ملف' : 'اكتب خطة من الصفر'}
            </button>
          </div>
        )}

        {/* بيانات تطبيق الاستراتيجية — تظهر فقط عند إضافة دليل لاستراتيجية */}
        {isStratEvidence && (
          <div className="bg-[var(--gold)]/5 border border-[var(--gold)]/15 rounded-2xl p-4 space-y-3.5">
            <div className="text-[11.5px] font-extrabold text-[var(--gold)] tracking-wide flex items-center gap-1.5">
              <i className="ti ti-bulb" /> بيانات تطبيق الاستراتيجية
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={labelCls}><i className="ti ti-calendar text-[var(--em7)]" /> تاريخ التطبيق</div>
                <input type="date" className={inputCls} value={stratDate} onChange={e => setStratDate(e.target.value)} />
              </div>
              <div>
                <div className={labelCls}><i className="ti ti-school text-[var(--em7)]" /> المرحلة الدراسية</div>
                <SelectDropdown
                  options={[
                    { value: 'ابتدائي', label: 'ابتدائي' },
                    { value: 'متوسط', label: 'متوسط' },
                    { value: 'ثانوي', label: 'ثانوي' },
                  ]}
                  value={stratStage}
                  onChange={setStratStage}
                  placeholder="— اختر —"
                  triggerClassName={inputCls + ' cursor-pointer'}
                  allowClear
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={labelCls}><i className="ti ti-users text-[var(--em7)]" /> الصف</div>
                <input type="text" className={inputCls} placeholder="مثال: الثالث متوسط" value={stratGrade} onChange={e => setStratGrade(e.target.value)} />
              </div>
              <div>
                <div className={labelCls}><i className="ti ti-clock text-[var(--em7)]" /> الحصة</div>
                <input type="number" min={1} step={1} className={inputCls} placeholder="مثال: 3" value={stratPeriod} onChange={e => setStratPeriod(e.target.value)} />
              </div>
            </div>
            <div>
              <div className={labelCls}><i className="ti ti-book text-[var(--em7)]" /> اسم المادة</div>
              <input type="text" className={inputCls} placeholder="مثال: الرياضيات" value={stratSubject} onChange={e => setStratSubject(e.target.value)} />
            </div>
          </div>
        )}

        {/* الوضع العادي (رفع ملف/رابط) — مخفي بالكامل أثناء "الكتابة من الصفر" */}
        {!writeFromScratch && <>
        {/* نوع الشاهد */}
        <div>
          <div className={labelCls}><i className="ti ti-category text-[var(--em7)]" /> نوع الشاهد <span className="text-red-400">*</span></div>
          <div className="grid grid-cols-5 gap-2">
            {TYPE_CONFIG.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setEvidenceType(t.id); setFileUrl(''); setFileName(''); setUploadSuccess(false); setLinkUrl(''); setAiSelectedFile(null); setAiTitleSuggestion(''); setAiIndicatorSuggestion(null); setAiDescriptionSuggestion(''); setAiSuggestionAttempted(false); setAiConsentPromptOpen(false); }}
                className="flex flex-col items-center gap-2 py-3.5 px-2 rounded-2xl border-[1.5px] text-[12px] font-bold transition-all duration-250 hover:-translate-y-0.5 cursor-pointer font-[var(--font)]"
                style={evidenceType === t.id
                  ? { borderColor: t.color, color: t.color, backgroundColor: `${t.color}18` }
                  : { borderColor: 'rgba(255,255,255,.08)', color: 'var(--text3)', backgroundColor: 'rgba(255,255,255,.03)' }
                }
              >
                <i className={`ti ${t.icon} text-[22px]`} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* رفع الملف */}
        {currentTypeConfig.hasFile && (
          <div>
            <div className={labelCls}><i className="ti ti-cloud-upload text-[var(--em7)]" /> الملف</div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept={currentTypeConfig.accept}
              onChange={handleFileChange}
            />
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-[1.5px] border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-250 relative overflow-hidden group ${
                uploadSuccess ? 'border-[var(--em8)]/40 bg-[var(--em7)]/5'
                : uploading    ? 'border-[var(--em7)]/20 opacity-80 cursor-wait'
                :                'border-white/10 hover:border-[var(--em7)]/30 hover:bg-white/3'
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center py-1">
                  <i className="ti ti-loader animate-spin text-[32px] text-[var(--em8)] mb-2" />
                  <p className="text-[13px] text-white font-bold animate-pulse">جاري الرفع...</p>
                  <span className="text-[11px] text-[var(--text4)] mt-1" dir="ltr" style={{unicodeBidi:'isolate'}}>{fileName}</span>
                </div>
              ) : uploadSuccess ? (
                <div className="flex flex-col items-center py-1">
                  <i className="ti ti-cloud-check text-[32px] text-[var(--em8)] mb-2" />
                  <p className="text-[13px] text-[var(--em8)] font-black">تم الرفع بنجاح ☁️</p>
                  <span className="text-[11.5px] text-white mt-1.5 font-semibold" dir="ltr" style={{unicodeBidi:'isolate'}}>{fileName}</span>
                  <span className="text-[10.5px] text-[var(--text4)] mt-1">انقر لاستبدال الملف</span>
                </div>
              ) : (
                <div className="py-1">
                  <i className="ti ti-cloud-upload text-[32px] text-[var(--em6)] mb-2 block transition-transform duration-300 group-hover:-translate-y-1" />
                  <p className="text-[13px] text-[var(--text3)] font-semibold">انقر لاختيار الملف</p>
                  <span className="text-[11px] text-[var(--text4)] mt-0.5 block">{currentTypeConfig.hint}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* اقتراح تلقائي من الصورة (Beta) — مرئية فقط لحسابات مُفعَّلة ولأقسام محددة */}
        {isAiSuggestionEligible && (
          <div className="bg-[var(--em7)]/5 border border-[var(--em7)]/15 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className={labelCls + ' !mb-0'}><i className="ti ti-sparkles text-[var(--em7)]" /> اقتراح تلقائي من الصورة</span>
              <span className="text-[9.5px] font-black text-[var(--gold)] bg-[var(--gold)]/10 border border-[var(--gold)]/30 rounded-full px-2 py-0.5">Beta</span>
            </div>

            {aiConsentPromptOpen ? (
              <div className="bg-black/20 border border-[var(--gold)]/25 rounded-xl p-3.5 space-y-3">
                <p className="text-[12px] text-[var(--text3)] leading-relaxed">
                  {AI_CONSENT_TEXT}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handleAiConsentAccept} className="py-2 px-4 rounded-lg bg-[var(--em6)] text-white text-[12px] font-bold cursor-pointer">أوافق ومتابعة</button>
                  <button type="button" onClick={() => setAiConsentPromptOpen(false)} className="py-2 px-4 rounded-lg border border-[var(--line2)] text-[var(--text4)] text-[12px] font-bold cursor-pointer">إلغاء</button>
                </div>
              </div>
            ) : (aiTitleSuggestion || aiIndicatorSuggestion || aiDescriptionSuggestion || aiSuggestionAttempted) ? (
              <div className="space-y-3.5">
                {/* اقتراح العنوان — قبول/رفض مستقل */}
                {aiTitleSuggestion && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-wide uppercase">العنوان المقترح</div>
                    <input
                      type="text"
                      className={inputCls}
                      value={aiTitleSuggestion}
                      onChange={e => setAiTitleSuggestion(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={acceptAiTitle} className="py-1.5 px-3.5 rounded-lg bg-[var(--em6)] text-white text-[11.5px] font-bold cursor-pointer">استخدام هذا العنوان</button>
                      <button type="button" onClick={dismissAiTitle} className="py-1.5 px-3.5 rounded-lg border border-[var(--line2)] text-[var(--text4)] text-[11.5px] font-bold cursor-pointer">تجاهل</button>
                    </div>
                  </div>
                )}

                {/* اقتراح المؤشر الفرعي — قبول/رفض مستقل، أو رسالة إن لم تكن الثقة كافية */}
                {aiIndicatorSuggestion ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-wide uppercase">المؤشر الفرعي المقترح</div>
                    <div className="text-[12.5px] text-white font-semibold py-2.5 px-3.5 bg-white/5 border border-[var(--line2)] rounded-xl">{aiIndicatorSuggestion.name_ar}</div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={acceptAiIndicator} className="py-1.5 px-3.5 rounded-lg bg-[var(--em6)] text-white text-[11.5px] font-bold cursor-pointer">استخدام هذا المؤشر</button>
                      <button type="button" onClick={dismissAiIndicator} className="py-1.5 px-3.5 rounded-lg border border-[var(--line2)] text-[var(--text4)] text-[11.5px] font-bold cursor-pointer">تجاهل</button>
                    </div>
                  </div>
                ) : aiSuggestionAttempted && (
                  <div className="text-[11.5px] text-[var(--text4)] flex items-center gap-1.5">
                    <i className="ti ti-info-circle" /> لم يقترح النموذج مؤشراً بثقة كافية — يمكنك اختياره يدوياً أعلاه
                  </div>
                )}

                {/* اقتراح الوصف — قبول/رفض مستقل */}
                {aiDescriptionSuggestion && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-wide uppercase">الوصف المقترح</div>
                    <textarea
                      className={inputCls + ' resize-none'}
                      rows={3}
                      value={aiDescriptionSuggestion}
                      onChange={e => setAiDescriptionSuggestion(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={acceptAiDescription} className="py-2 px-4 rounded-lg bg-[var(--em6)] text-white text-[12px] font-bold cursor-pointer">استخدام هذا الوصف</button>
                      <button type="button" onClick={dismissAiDescription} className="py-2 px-4 rounded-lg border border-[var(--line2)] text-[var(--text4)] text-[12px] font-bold cursor-pointer">تجاهل</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAiSuggestClick}
                disabled={!aiSelectedFile || !uploadSuccess || aiLoading}
                className="flex items-center gap-2 py-2 px-4 rounded-lg bg-[var(--em6)]/15 border border-[var(--em6)]/30 text-[var(--em8)] text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {aiLoading ? <><i className="ti ti-loader animate-spin" /> جاري التحليل...</> : <><i className="ti ti-wand" /> اقترح لي البيانات</>}
              </button>
            )}
          </div>
        )}

        {/* رابط خارجي */}
        {currentTypeConfig.hasLink && (
          <div>
            <div className={labelCls}><i className="ti ti-link text-[var(--em7)]" /> الرابط <span className="text-red-400">*</span></div>
            <input
              type="url"
              className={inputCls}
              placeholder="https://..."
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              dir="ltr"
              style={{ unicodeBidi: 'isolate' }}
            />
          </div>
        )}
        </>}

        {/* الكتابة من الصفر — منتقي قوالب + نص الخطة (يُحفظ في نفس حقل الوصف
            أدناه)، بلا أي رفع ملف أو رابط */}
        {writeFromScratch && (
          <div className="bg-[var(--em7)]/5 border border-[var(--em7)]/15 rounded-2xl p-4 space-y-3">
            <div className={labelCls + ' !mb-0'}><i className="ti ti-template text-[var(--em7)]" /> ابدأ من قالب (اختياري)</div>
            {templates.length > 0 ? (
              <SelectDropdown
                options={templates.map(t => ({ value: t.id, label: t.title }))}
                value={selectedTemplateId}
                onChange={applyTemplate}
                placeholder="— اختر قالباً —"
                triggerClassName={inputCls + ' cursor-pointer'}
                allowClear
              />
            ) : (
              <p className="text-[11.5px] text-[var(--text4)]">لا توجد قوالب متاحة حالياً — يمكنك الكتابة الحرة في حقل "نص الخطة" أدناه.</p>
            )}
          </div>
        )}

        {/* ── الحقول الاختيارية ── */}
        <div className="border-t border-[var(--line)] pt-4">
          <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-widest uppercase mb-4">حقول اختيارية</div>
          <div className="space-y-4">

            {/* الوصف */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className={labelCls + ' !mb-0'}>
                  <i className="ti ti-align-right text-[var(--em7)]" />
                  {writeFromScratch ? <>نص الخطة <span className="text-red-400">*</span></> : 'وصف الشاهد'}
                </div>
                {voiceFeatureEnabled && (
                  <button
                    type="button"
                    onClick={handleVoiceButtonClick}
                    disabled={voiceLoading}
                    title={voiceRecording.isRecording ? 'إيقاف التسجيل' : 'توثيق صوتي'}
                    className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11.5px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                      voiceRecording.isRecording
                        ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                        : 'bg-[var(--em6)]/15 border border-[var(--em6)]/30 text-[var(--em8)]'
                    }`}
                  >
                    {voiceRecording.isRecording
                      ? <><i className="ti ti-player-stop-filled" /> إيقاف · {voiceRecording.secondsElapsed}ث</>
                      : <><i className="ti ti-microphone" /> توثيق صوتي</>}
                    <span className="text-[9.5px] font-black text-[var(--gold)] bg-[var(--gold)]/10 border border-[var(--gold)]/30 rounded-full px-1.5 py-0.5">Beta</span>
                  </button>
                )}
              </div>

              {voiceFeatureEnabled && voiceConsentPromptOpen && (
                <div className="bg-black/20 border border-[var(--gold)]/25 rounded-xl p-3.5 space-y-3 mb-3">
                  <p className="text-[12px] text-[var(--text3)] leading-relaxed">{AI_CONSENT_TEXT}</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleVoiceConsentAccept} className="py-2 px-4 rounded-lg bg-[var(--em6)] text-white text-[12px] font-bold cursor-pointer">أوافق ومتابعة</button>
                    <button type="button" onClick={() => setVoiceConsentPromptOpen(false)} className="py-2 px-4 rounded-lg border border-[var(--line2)] text-[var(--text4)] text-[12px] font-bold cursor-pointer">إلغاء</button>
                  </div>
                </div>
              )}

              {voiceFeatureEnabled && voiceRecording.error && (
                <p className="text-[11.5px] text-red-400 mb-2 flex items-center gap-1.5"><i className="ti ti-alert-circle" /> {voiceRecording.error}</p>
              )}

              {voiceFeatureEnabled && voiceLoading && (
                <div className="flex items-center gap-2 text-[12px] text-[var(--text3)] font-bold mb-3">
                  <i className="ti ti-loader animate-spin text-[var(--em8)]" /> جاري تفريغ التسجيل الصوتي...
                </div>
              )}

              {voiceFeatureEnabled && !voiceLoading && (voiceTranscript || voiceSuggestedDesc) && (
                <div className="bg-[var(--em7)]/5 border border-[var(--em7)]/15 rounded-2xl p-4 space-y-3 mb-3">
                  <div>
                    <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-1.5">التفريغ النصي</div>
                    <textarea
                      className={inputCls + ' resize-none'}
                      rows={2}
                      value={voiceTranscript}
                      onChange={e => setVoiceTranscript(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-wide uppercase mb-1.5">الوصف المقترح</div>
                    <textarea
                      className={inputCls + ' resize-none'}
                      rows={2}
                      value={voiceSuggestedDesc}
                      onChange={e => setVoiceSuggestedDesc(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={acceptVoiceSuggestion} className="py-2 px-4 rounded-lg bg-[var(--em6)] text-white text-[12px] font-bold cursor-pointer">استخدام هذا الوصف</button>
                    <button type="button" onClick={dismissVoiceSuggestion} className="py-2 px-4 rounded-lg border border-[var(--line2)] text-[var(--text4)] text-[12px] font-bold cursor-pointer">تجاهل</button>
                  </div>
                </div>
              )}

              <textarea
                className={inputCls + ' resize-none'}
                rows={writeFromScratch ? 8 : 2}
                placeholder={writeFromScratch ? 'اكتب خطة الدرس هنا، أو ابدأ من قالب أعلاه...' : 'صف ما يُثبته هذا الشاهد...'}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* الأثر */}
            <div>
              <div className={labelCls}><i className="ti ti-chart-bar text-[var(--em7)]" /> الأثر والنتيجة</div>
              <textarea
                className={inputCls + ' resize-none'}
                rows={2}
                placeholder="ما الأثر الذي أحدثه هذا العمل على الطلاب أو البيئة التعليمية؟"
                value={impact}
                onChange={e => setImpact(e.target.value)}
              />
            </div>

            {/* الصف + الفصل */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={labelCls}><i className="ti ti-school text-[var(--em7)]" /> الصف الدراسي</div>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="مثال: الثالث متوسط"
                  value={contextGrade}
                  onChange={e => setContextGrade(e.target.value)}
                />
              </div>
              <div>
                <div className={labelCls}><i className="ti ti-calendar text-[var(--em7)]" /> الفصل الدراسي</div>
                <SelectDropdown
                  options={[
                    { value: 'الأول', label: 'الفصل الأول' },
                    { value: 'الثاني', label: 'الفصل الثاني' },
                  ]}
                  value={academicTerm}
                  onChange={setAcademicTerm}
                  placeholder="— اختر —"
                  triggerClassName={inputCls + ' cursor-pointer'}
                  allowClear
                />
              </div>
            </div>

            {/* التأمل الذاتي */}
            <div>
              <div className={labelCls}><i className="ti ti-heart text-[var(--em7)]" /> تأمل ذاتي</div>
              <textarea
                className={inputCls + ' resize-none'}
                rows={2}
                placeholder="ما الذي تعلمته من هذه التجربة؟ وكيف ستحسّن ممارستك مستقبلاً؟"
                value={selfReflection}
                onChange={e => setSelfReflection(e.target.value)}
              />
            </div>

          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-[var(--line)] shrink-0">
        <button
          onClick={onClose}
          className="py-2.5 px-6 rounded-xl border border-[var(--line2)] bg-transparent text-[13.5px] font-bold text-[var(--text3)] hover:text-white hover:bg-white/5 transition-all duration-200 font-[var(--font)] cursor-pointer"
        >
          إلغاء
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 py-2.5 px-7 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em6)] text-white text-[13.5px] font-extrabold shadow-[0_6px_20px_rgba(42,122,68,.45)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(42,122,68,.6)] transition-all duration-250 disabled:opacity-60 disabled:cursor-not-allowed font-[var(--font)] cursor-pointer"
        >
          {saving
            ? <><i className="ti ti-loader animate-spin" /> جاري الحفظ...</>
            : <><i className="ti ti-check" /> حفظ الشاهد</>
          }
        </button>
      </div>
    </>
  );
}

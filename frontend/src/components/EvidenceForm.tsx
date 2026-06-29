import React, { useState, useEffect, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '../supabaseClient';
import type { EvidenceType } from '../hooks/useSupabaseEvidence';
import type { Evidence } from '../types';

type SupabaseEvidenceHook = ReturnType<typeof import('../hooks/useSupabaseEvidence').useSupabaseEvidence>;

interface Indicator {
  id: string;
  name_ar: string;
}

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
    stratFields?: Pick<Evidence, 'stratDate' | 'stratStage' | 'stratGrade' | 'stratPeriod' | 'stratSubject'>
  ) => void;
  onToast: (msg: string, icon?: string) => void;
}

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

const toLocalType = (t: EvidenceType): 'pdf' | 'img' | 'doc' | 'vid' => {
  if (t === 'image') return 'img';
  if (t === 'video') return 'vid';
  if (t === 'file')  return 'pdf';
  return 'doc';
};

/**
 * يحتوي على نموذج إضافة الشاهد كاملاً (الترويسة + المحتوى + الفوتر) بدون أي
 * حاوية/overlay خاصة به — تتولى الحاوية المستدعية (EvidenceModal على
 * الديسكتوب، أو BottomSheet على الجوال) تحديد شكل العرض الخارجي.
 */
export default function EvidenceForm({
  isOpen, onClose, sectionId, sub, userId, supabaseEv, onAddEv, onToast,
}: EvidenceFormProps) {
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

  // ── Misc ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setTitle(''); setIndicatorId(''); setEvidenceType('file');
    setDescription(''); setImpact(''); setContextGrade('');
    setAcademicTerm(''); setSelfReflection(''); setLinkUrl('');
    setFileUrl(''); setFileName(''); setUploadSuccess(false);
    setStratDate(''); setStratStage(''); setStratGrade(''); setStratPeriod(''); setStratSubject('');
  }, [isOpen]);

  // Fetch indicators for this section
  useEffect(() => {
    if (!isOpen || !sectionId || !supabase) return;
    supabase
      .from('section_indicators')
      .select('id, name_ar')
      .eq('section_id', sectionId)
      .order('weight' as any)
      .then(({ data }) => setIndicators(data ?? []));
  }, [isOpen, sectionId]);

  const currentTypeConfig = TYPE_CONFIG.find(t => t.id === evidenceType)!;

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
    if (currentTypeConfig.hasFile && !fileUrl) { onToast('يرجى رفع الملف أولاً', '⚠️'); return; }
    if (currentTypeConfig.hasLink && !linkUrl.trim()) { onToast('يرجى إدخال الرابط', '⚠️'); return; }

    setSaving(true);
    try {
      const result = await supabaseEv.addEvidence({
        section_id:      sectionId,
        indicator_id:    indicatorId  || undefined,
        title:           title.trim(),
        description:     description.trim()    || undefined,
        impact:          impact.trim()         || undefined,
        context_grade:   contextGrade.trim()   || undefined,
        academic_term:   academicTerm          || undefined,
        evidence_type:   evidenceType,
        file_url:        fileUrl               || undefined,
        link_url:        linkUrl.trim()        || undefined,
        self_reflection: selfReflection.trim() || undefined,
      });

      if (result) {
        // أيضاً احفظ في state.ev المحلي
        const url = fileUrl || linkUrl.trim() || undefined;
        const stratFields = isStratEvidence ? {
          stratDate:    stratDate || undefined,
          stratStage:   stratStage ? (stratStage as 'ابتدائي' | 'متوسط' | 'ثانوي') : undefined,
          stratGrade:   stratGrade.trim() || undefined,
          stratPeriod:  stratPeriod ? Number(stratPeriod) : undefined,
          stratSubject: stratSubject.trim() || undefined,
        } : undefined;
        onAddEv(sectionId, sub, toLocalType(evidenceType), title.trim(), url, stratFields);
        onToast('تم إضافة الشاهد بنجاح ✅', '✅');
        onClose();
      } else {
        onToast('تعذّر الحفظ، يرجى المحاولة مجدداً', '❌');
      }
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-xl text-[13.5px] font-[var(--font)] text-white outline-none transition-all duration-200 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_3px_rgba(42,122,68,.12)]';
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

        {/* المؤشر الفرعي */}
        {indicators.length > 0 && (
          <div>
            <div className={labelCls}><i className="ti ti-list-check text-[var(--em7)]" /> المؤشر الفرعي</div>
            <select
              className={inputCls + ' cursor-pointer'}
              value={indicatorId}
              onChange={e => setIndicatorId(e.target.value)}
            >
              <option value="">— اختر المؤشر (اختياري) —</option>
              {indicators.map(ind => (
                <option key={ind.id} value={ind.id}>{ind.name_ar}</option>
              ))}
            </select>
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
                <select className={inputCls + ' cursor-pointer'} value={stratStage} onChange={e => setStratStage(e.target.value)}>
                  <option value="">— اختر —</option>
                  <option value="ابتدائي">ابتدائي</option>
                  <option value="متوسط">متوسط</option>
                  <option value="ثانوي">ثانوي</option>
                </select>
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

        {/* نوع الشاهد */}
        <div>
          <div className={labelCls}><i className="ti ti-category text-[var(--em7)]" /> نوع الشاهد <span className="text-red-400">*</span></div>
          <div className="grid grid-cols-5 gap-2">
            {TYPE_CONFIG.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setEvidenceType(t.id); setFileUrl(''); setFileName(''); setUploadSuccess(false); setLinkUrl(''); }}
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

        {/* ── الحقول الاختيارية ── */}
        <div className="border-t border-[var(--line)] pt-4">
          <div className="text-[11px] font-extrabold text-[var(--text4)] tracking-widest uppercase mb-4">حقول اختيارية</div>
          <div className="space-y-4">

            {/* الوصف */}
            <div>
              <div className={labelCls}><i className="ti ti-align-right text-[var(--em7)]" /> وصف الشاهد</div>
              <textarea
                className={inputCls + ' resize-none'}
                rows={2}
                placeholder="صف ما يُثبته هذا الشاهد..."
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
                <select
                  className={inputCls + ' cursor-pointer'}
                  value={academicTerm}
                  onChange={e => setAcademicTerm(e.target.value)}
                >
                  <option value="">— اختر —</option>
                  <option value="الأول">الفصل الأول</option>
                  <option value="الثاني">الفصل الثاني</option>
                </select>
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

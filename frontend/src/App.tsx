import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { PageType } from './types';
import { useAppStore } from './hooks/useAppStore';
import { useAdminStore } from './hooks/useAdminStore';
import { usePublicProfile } from './hooks/usePublicProfile';
import { usePublicEvidence } from './hooks/usePublicEvidence';
import { useTeachingStrategies } from './hooks/useTeachingStrategies';
import { usePublicTeachingStrategies } from './hooks/usePublicTeachingStrategies';
import { usePublicResultsAnalysis } from './hooks/usePublicResultsAnalysis';
import { usePublicSectionSummaries } from './hooks/usePublicSectionSummaries';
import { useHarvestReport } from './hooks/useHarvestReport';
import { useResultsAnalysis } from './components/ResultsAnalysis/useResultsAnalysis';
import { toPublicResultsAnalysisRow } from './components/ResultsAnalysis/logic';

import Background from './components/Background';
import Nav from './components/Nav';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Public from './components/Public';
import { PublicTopBar, PublicUnavailable } from './components/PublicChrome';
import AdminDashboard from './components/Admin/AdminDashboard';
import Onboarding from './components/Onboarding';
import SplashScreen from './components/SplashScreen';
import DashboardSkeleton from './components/DashboardSkeleton';
import { Modal, Toast, SelectDropdown } from './components/UI';
import EvidenceModal from './components/EvidenceModal';
import { supabase } from './supabaseClient';
import { isProfileIncomplete } from './utils';
import { useSupabaseEvidence } from './hooks/useSupabaseEvidence';
import type { SupabaseEvidence } from './hooks/useSupabaseEvidence';
import { useMonthlyProgress } from './hooks/useMonthlyProgress';
import { usePublicMonthlyProgress } from './hooks/usePublicMonthlyProgress';
import { useSections } from './hooks/useSections';
import { usePortfolioCompletion } from './hooks/usePortfolioCompletion';
import type { ContinuityData } from './types';
import { usePublicCustomIndicators } from './hooks/usePublicCustomIndicators';
import type { PublicCustomIndicator } from './hooks/usePublicCustomIndicators';
import { useCustomIndicators } from './hooks/useCustomIndicators';
import type { IndicatorResult } from './hooks/useCustomIndicators';
import type { ToastAction, ToastKind } from './components/UI';
import { BTN_DNG } from './components/SectionView';
// حقول نافذتي «إعدادات الحساب» و«إضافة استراتيجية» — مشتركة مع صفحة الدخول
import { FIELD, LABEL, HINT, SECTION_TITLE, BTN_2ND, toggleBtn } from './components/formStyles';

/** مهلة «تراجع» بعد حذف مؤشر مخصص — لا شيء يصل إلى القاعدة قبل انتهائها */
const INDICATOR_UNDO_MS = 6000;

/** حذف مؤشر مخصص معلّق: نقل شواهده إلى toId، أو حذفها معه */
interface PendingIndicatorOp {
  indicatorId: string;
  mode: 'move' | 'delete';
  toId?: string;
}

export default function App() {
  // Read ?share=USER_ID from URL — if present, show that user's public profile directly
  const shareUserId = new URLSearchParams(window.location.search).get('share');
  // Read ?report=REPORT_ID — مسار منفصل تماماً عن ?share=: يعرض لقطة ثابتة من
  // harvest_reports بدل الملف الحي (انظر useHarvestReport وblock الرندر أدناه).
  const reportId = new URLSearchParams(window.location.search).get('report');

  const [currentPage, setCurrentPage] = useState<PageType>(
    shareUserId || reportId ? 'public' : 'dashboard'
  );
  const [toastData, setToastData] = useState<{ msg: string; icon: string; show: boolean; action?: ToastAction; kind?: ToastKind }>({ msg: '', icon: '✓', show: false });
  const { 
    state,
    user,
    loading,
    isAdmin,
    passwordRecovery,
    clearPasswordRecovery,
    updateProfile,
    saveState,
    signOut,
    announcements,
    markNotificationsSeen,
    updateWelcome,
    markHintSeen,
    academicDates,
    shareEnabled,
    updateShareEnabled,
    setAiSuggestConsent,
    aiSummary,
    aiTopAchievementEvidenceId,
    pinnedTopEvidenceId,
    aiTopAchievementApproved,
    setPinnedTopEvidence,
    approveTopSuggestion,
    dismissTopSuggestion,
  } = useAppStore();

  const {
    users: adminUsers,
    stats: adminStats,
    loading: adminLoading,
    error: adminError,
    reload: adminReload,
    deleteUserPortfolio,
    resetUserPortfolio,
    exportCSV,
    getShareUrl,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    createAcademicDate,
    updateAcademicDate,
    deleteAcademicDate,
    featureFlags,
    featureOverrides,
    setGlobalFeatureFlag,
    setPortfolioFeatureOverride,
    removePortfolioFeatureOverride,
  } = useAdminStore(isAdmin);

  // مصدر SectionData[] الوحيد للتطبيق كله — يدمج SECS الثابتة (data.ts) مع
  // مؤشرات section_indicators الحقيقية من القاعدة (انظر useSections.ts).
  // مستقل عن حالة تسجيل الدخول (يُستهلك أيضاً في مساري ?share= و?report=
  // العامّين أدناه)، لذا يُستدعى هنا بلا شرط.
  const { sections, status: sectionsStatus, reload: reloadSections, refresh: refreshSections } = useSections();

  const monthlyProgress = useMonthlyProgress({
    userId: user?.id ?? null,
    yearStartMonth: state.yearStartMonth ?? 9,
  });

  const supabaseEv = useSupabaseEvidence(user?.id ?? null, monthlyProgress.removeEvidence);

  // نسبة الجاهزية العامة (تراكمية) — مصدر واحد للوحة التحكم ولمعاينة المالك
  // لصفحته العامة، يُعاد جلبها تلقائياً كلما تغيّرت الشواهد (انظر الهوك).
  const portfolioCompletion = usePortfolioCompletion(user?.id ?? null, supabaseEv.evidence);

  // يسجّل الشاهد في monthly_progress بعد نجاح إدراجه في evidence (يستدعيه
  // useSaveEvidence فقط بعد النجاح). createdAt اختياري: يُمرَّر فقط عند الإضافة
  // من أرشيف شهر سابق ضمن نافذة التعديل المسموحة، لربط الشاهد بشهره الصحيح.
  const onEvidenceSaved = (sectionId: number, createdAt?: string) =>
    monthlyProgress.recordEvidence(sectionId, createdAt);

  const [evidenceModal, setEvidenceModal] = useState<{
    open: boolean; sectionId: number; sub: string; strategyId?: string; indicatorId?: string;
    mode?: 'add' | 'edit'; initial?: SupabaseEvidence;
  }>({
    open: false, sectionId: 0, sub: '',
  });

  // كتالوج استراتيجيات التدريس (بند 4) — عام + خاص بالمعلم الحالي، لتدفّق
  // "إضافة استراتيجية" ولحلّ evidence[].strategy_id إلى اسم معروض بمعاينة
  // المالك لملفه (Dashboard.tsx وPublic.tsx في وضع 'public' الداخلي).
  const teachingStrategies = useTeachingStrategies(user?.id ?? null);
  const strategyNames = useMemo(
    () => Object.fromEntries(teachingStrategies.strategies.map(s => [s.id, s.name_ar])),
    [teachingStrategies.strategies]
  );

  // نفس الحل لكن للعرض العام (?share=) عبر get_shared_teaching_strategies —
  // RLS تمنع زوار الصفحة العامة من قراءة teaching_strategies الخاصة مباشرة.
  const sharedTeachingStrategies = usePublicTeachingStrategies(shareUserId ?? null);
  const sharedStrategyNames = useMemo(
    () => Object.fromEntries((sharedTeachingStrategies ?? []).map(s => [s.id, s.name_ar])),
    [sharedTeachingStrategies]
  );

  // Load shared profile (only when ?share= param is present)
  const { state: sharedState, loading: sharedLoading, error: sharedError } = usePublicProfile(
    shareUserId ?? null
  );

  // مؤشر الاستمرارية عبر الزمن للعرض العام — جلب منفصل عبر RPC آمنة (RLS
  // تمنع قراءة monthly_progress مباشرة لغير المالك، انظر usePublicMonthlyProgress).
  const sharedContinuity = usePublicMonthlyProgress(shareUserId ?? null);

  // شواهد جدول evidence الجديد (الغني) للعرض العام — جلب منفصل عبر RPC آمنة
  // (RLS تمنع قراءة evidence مباشرة لغير المالك، انظر usePublicEvidence).
  const sharedEvidence = usePublicEvidence(shareUserId ?? null);

  // بند 10 (تحليل نتائج المتعلمين) للعرض العام — جلب منفصل عبر RPC آمنة بنفس
  // نمط sharedEvidence (RLS تمنع قراءة results_analysis مباشرة لغير المالك،
  // انظر usePublicResultsAnalysis)؛ الشكل المُرجَع مبسَّط أصلاً بلا أي اسم طالب.
  const sharedResultsAnalysis = usePublicResultsAnalysis(shareUserId ?? null);

  // ملخصات الأقسام العادية للعرض العام — عبر RPC آمنة (RLS تمنع قراءة
  // section_ai_summaries مباشرة لغير المالك، انظر usePublicSectionSummaries).
  const sharedSectionSummaries = usePublicSectionSummaries(shareUserId ?? null);

  // المؤشرات المخصصة للعرض العام (التي عليها شواهد فقط) — عبر RPC آمنة، لأن
  // useSections يحمّل مخصص المستخدم المسجّل لا مخصص صاحب الصفحة.
  const sharedCustomIndicators = usePublicCustomIndicators(shareUserId ?? null);

  // تقرير حصاد فصلي (?report=) — عبر RPC get_harvest_report (القراءة المباشرة
  // على harvest_reports للمالك والأدمن فقط، انظر useHarvestReport).
  const { report: harvestReport, loading: harvestReportLoading, error: harvestReportError } = useHarvestReport(reportId ?? null);

  // نفس البيانات لمعاينة المالك لملفه الخاص (صفحة 'public' داخل التطبيق) —
  // تُبنى مباشرة من monthlyProgress.rows المحمّلة أصلاً بلا أي طلب إضافي.
  // evidenceCount هنا هو مجموع evidence_count عبر كل الأقسام لنفس الشهر
  // (الصفوف الخام مقسّمة لكل قسم على حدة) — يُستخدم في نظام النقاط بـPublic.tsx.
  const ownMonthTotals = new Map<string, { year: number; month: number; evidenceCount: number }>();
  monthlyProgress.rows.forEach(r => {
    const key = `${r.year}-${r.month}`;
    const existing = ownMonthTotals.get(key);
    if (existing) existing.evidenceCount += r.evidence_count;
    else ownMonthTotals.set(key, { year: r.year, month: r.month, evidenceCount: r.evidence_count });
  });
  const ownContinuity: ContinuityData = {
    yearStartMonth: state.yearStartMonth ?? 9,
    activeMonths: Array.from(ownMonthTotals.values()).filter(m => m.evidenceCount > 0),
  };

  // بند 10 لمعاينة المالك لملفه الخاص — لا حاجة RPC هنا إطلاقاً (المالك يملك
  // صلاحية RLS مباشرة على results_analysis عبر useResultsAnalysis نفسه، نفس
  // الهوك المستخدَم داخل Dashboard.tsx). نسخة مستقلة هنا لأن Dashboard.tsx غير
  // مركَّب أصلاً أثناء عرض صفحة 'public' — لكن userId يُمرَّر فقط أثناء عرض
  // هذه المعاينة تحديداً (isOwnPreview)، لا في كل جلسة مسجَّلة، فلا يتكرر جلب
  // results_analysis كاملاً بلا داعٍ لمجرد فتح لوحة التحكم العادية. تُحوَّل
  // لنفس الشكل المبسَّط الآمن (toPublicResultsAnalysisRow) قبل التمرير
  // لـPublic.tsx، بدل تمرير الصفوف الكاملة التي تحمل أسماء الطلاب — القسم لا
  // يحتاجها، وPublic.tsx يعامل هذا النمط ونمط ?share= بنفس الشكل تماماً بلا
  // فرع خاص.
  const isOwnPreview = currentPage === 'public' && !shareUserId && !reportId;
  const ownResultsAnalysis = useResultsAnalysis(isOwnPreview ? user?.id : undefined);
  const ownResultsAnalysisPublic = useMemo(
    () => ownResultsAnalysis.analyses.map(toPublicResultsAnalysisRow),
    [ownResultsAnalysis.analyses]
  );

  // ملخصات الأقسام لمعاينة المالك لملفه — قراءة مباشرة بـRLS (المالك يقرأ
  // صفوفه في section_ai_summaries)، غير المخفية فقط كما في الصفحة العامة.
  const [ownSectionSummaries, setOwnSectionSummaries] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!isOwnPreview || !user?.id || !supabase) { setOwnSectionSummaries({}); return; }
    let cancelled = false;
    supabase
      .from('section_ai_summaries')
      .select('section_id, ai_sentence')
      .eq('portfolio_id', user.id)
      .eq('hidden', false)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.warn('[App] تعذّر جلب ملخصات الأقسام:', error.message); setOwnSectionSummaries({}); return; }
        const map: Record<number, string> = {};
        for (const row of data ?? []) map[row.section_id] = row.ai_sentence;
        setOwnSectionSummaries(map);
      });
    return () => { cancelled = true; };
  }, [isOwnPreview, user?.id]);

  // Redirect users dynamically based on auth status — but not when in shared-profile view
  useEffect(() => {
    if (shareUserId || reportId) return; // Don't redirect if viewing a shared profile or a harvest report
    if (passwordRecovery) {
      // Keep the user on the auth screen to set a new password, even though a
      // temporary recovery session makes them "logged in".
      setCurrentPage('auth');
      return;
    }
    if (!loading) {
      if (user) {
        if (currentPage === 'auth') {
          setCurrentPage('dashboard');
        }
      } else {
        if (currentPage === 'dashboard') {
          setCurrentPage('auth');
          showToast('انتهت جلستك، يرجى تسجيل الدخول مجدداً 🔒', '🔒');
        }
      }
    }
  }, [user, loading, currentPage, shareUserId, reportId, passwordRecovery]);

  // ── visibilitychange: تحديث خلفي عند العودة بعد 5 دقائق + حفظ موقع التمرير ──
  const lastRefreshRef = useRef<number>(Date.now());
  const refetchRef = useRef({ ev: supabaseEv.refetch, monthly: monthlyProgress.refetch });
  // تحديث الـ ref في كل render بدون إعادة تسجيل المستمع
  refetchRef.current = { ev: supabaseEv.refetch, monthly: monthlyProgress.refetch };

  useEffect(() => {
    const FIVE_MIN = 5 * 60 * 1000;
    const onVisibilityChange = () => {
      if (document.hidden) {
        sessionStorage.setItem('wathq_scrollY', String(window.scrollY));
        return;
      }
      // عودة للتبويب — استعد موقع التمرير
      const savedY = sessionStorage.getItem('wathq_scrollY');
      if (savedY) {
        requestAnimationFrame(() => window.scrollTo({ top: parseInt(savedY, 10), behavior: 'instant' }));
      }
      // تحديث خلفي فقط إذا مضى أكثر من 5 دقائق
      const now = Date.now();
      if (now - lastRefreshRef.current > FIVE_MIN) {
        lastRefreshRef.current = now;
        refetchRef.current.ev();
        refetchRef.current.monthly();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []); // يُسجَّل مرة واحدة — الـ refs تضمن أحدث قيم

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    icon: string;
    body: React.ReactNode;
    onConfirm: () => void;
    confirmDisabled?: boolean;
    confirmHelperText?: string;
    tone?: 'danger';
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    icon: 'ti-plus',
    body: null,
    onConfirm: () => {}
  });

  // مؤقّت واحد للرسالة: رسالة جديدة تلغي مؤقّت السابقة فلا تُخفيها مبكراً.
  // الرسالة التي فيها زر (مثل «تراجع») تبقى مدة أطول.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, icon = '✓', action?: ToastAction, durationMs?: number, kind?: ToastKind) => {
    setToastData({ msg, icon, show: true, action, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(
      () => setToastData(prev => ({ ...prev, show: false })),
      durationMs ?? (action ? INDICATOR_UNDO_MS : 3200),
    );
  }, []);
  const hideToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastData(prev => ({ ...prev, show: false }));
  }, []);

  // ── المؤشرات المخصصة: إضافة وإعادة تسمية وحذف مؤجّل ─────────────
  const customIndicators = useCustomIndicators(user?.id ?? null);

  const handleAddIndicator = async (sectionId: number, name: string): Promise<IndicatorResult> => {
    const r = await customIndicators.addIndicator(sectionId, name);
    if (r.ok) { await refreshSections(); showToast('أُضيف المؤشر المخصص'); }
    else if (r.toast) showToast(r.toast, '⚠️');
    return r;
  };

  const handleRenameIndicator = async (indicatorId: string, name: string): Promise<IndicatorResult> => {
    const r = await customIndicators.renameIndicator(indicatorId, name);
    if (r.ok) { await refreshSections(); showToast('حُفظ المؤشر'); }
    else if (r.toast) showToast(r.toast, '⚠️');
    return r;
  };

  // الحذف لا يصل إلى القاعدة إلا بعد INDICATOR_UNDO_MS بلا «تراجع»: حذف الشواهد
  // يحذف ملفاتها من Storage نهائياً، فالتراجع بعد التنفيذ مستحيل. indicatorOps
  // كل عملية لم تنتهِ بعد (معلّقة أو قيد التنفيذ) وتُطبَّق على العرض تفاؤلياً،
  // وpendingOpRef العملية الوحيدة التي ما زال «تراجع» ممكناً لها. الحالة هنا لا
  // في Dashboard، لأن Dashboard قد يُفكّ تركيبه (المعاينة مثلاً) فيضيع المؤقّت.
  const [indicatorOps, setIndicatorOps] = useState<PendingIndicatorOp[]>([]);
  const pendingOpRef = useRef<PendingIndicatorOp | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // التنفيذ يقرأ أحدث شواهد ودوال، لا نسخة وقت بدء المهلة
  const supabaseEvRef = useRef(supabaseEv);
  supabaseEvRef.current = supabaseEv;

  const commitIndicatorOp = useCallback(async (op: PendingIndicatorOp) => {
    const ev = supabaseEvRef.current;
    try {
      if (op.mode === 'move' && op.toId) {
        const moved = await ev.moveIndicatorEvidence(op.indicatorId, op.toId);
        if (!moved) { showToast('تعذّر نقل الشواهد، ولم يُحذف المؤشر', '⚠️'); return; }
        // إن فشل الحذف هنا فالشواهد في مكانها الجديد والمؤشر فارغ — لا ضرر
        const deleted = await customIndicators.deleteIndicator(op.indicatorId);
        if (!deleted) showToast('نُقلت الشواهد، وتعذّر حذف المؤشر', '⚠️');
      } else {
        const ids = ev.evidence.filter(e => e.indicator_id === op.indicatorId).map(e => e.id);
        // deleteEvidence تحذف الملف من Storage وتُنقص عدّاد الشهر، وترمي عند الفشل
        for (const id of ids) await ev.deleteEvidence(id);
        const deleted = await customIndicators.deleteIndicator(op.indicatorId);
        if (!deleted) showToast('حُذفت الشواهد، وتعذّر حذف المؤشر', '⚠️');
      }
    } catch (err) {
      console.error('[commitIndicatorOp]', err);
      showToast('تعذّر حذف المؤشر، حاول مجدداً', '⚠️');
    } finally {
      // نجح أو فشل: العرض يعود إلى ما في القاعدة فعلاً
      await Promise.all([refreshSections(), supabaseEvRef.current.refetch()]);
      setIndicatorOps(list => list.filter(o => o !== op));
    }
  }, [customIndicators, refreshSections, showToast]);

  const undoIndicatorOp = useCallback((op: PendingIndicatorOp) => {
    if (pendingOpRef.current !== op) return; // بدأ التنفيذ فعلاً
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
    pendingOpRef.current = null;
    setIndicatorOps(list => list.filter(o => o !== op));
    hideToast();
  }, [hideToast]);

  const handleDeleteIndicator = useCallback((indicatorId: string, mode: 'move' | 'delete', toId?: string, evidenceCount = 0) => {
    // عملية واحدة معلّقة: السابقة تُنفَّذ فوراً قبل بدء الجديدة
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
    const prev = pendingOpRef.current;
    pendingOpRef.current = null;
    if (prev) void commitIndicatorOp(prev);

    const op: PendingIndicatorOp = { indicatorId, mode, toId };
    pendingOpRef.current = op;
    setIndicatorOps(list => [...list, op]);
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      if (pendingOpRef.current === op) pendingOpRef.current = null;
      void commitIndicatorOp(op);
    }, INDICATOR_UNDO_MS);

    const msg = mode === 'move' ? 'حُذف المؤشر ونُقلت شواهده'
      : evidenceCount > 0 ? 'حُذف المؤشر وشواهده' : 'حُذف المؤشر';
    showToast(msg, '🗑️', { label: 'تراجع', onClick: () => undoIndicatorOp(op) });
  }, [commitIndicatorOp, undoIndicatorOp, showToast]);

  // إغلاق الصفحة أثناء المهلة: لا يُنفَّذ شيء، والمعلّق يسقط (الاتجاه الآمن)
  useEffect(() => {
    const onPageHide = () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
      pendingOpRef.current = null;
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // العرض التفاؤلي: المؤشر المحذوف يختفي، وشواهده تختفي (حذف) أو تظهر تحت
  // المؤشر المختار (نقل). القاعدة لم تتغيّر بعد.
  const viewSections = useMemo(() => indicatorOps.length === 0 ? sections : sections.map(s => {
    const indicators = s.indicators.filter(ind => !indicatorOps.some(op => op.indicatorId === ind.id));
    return indicators.length === s.indicators.length ? s : { ...s, indicators, subs: indicators.map(ind => ind.name_ar) };
  }), [sections, indicatorOps]);
  const viewEvidence = useMemo(() => indicatorOps.length === 0 ? supabaseEv.evidence : supabaseEv.evidence.flatMap(e => {
    let indicatorId = e.indicator_id;
    for (const op of indicatorOps) {
      if (op.indicatorId !== indicatorId) continue;
      if (op.mode === 'delete') return [];
      indicatorId = op.toId ?? indicatorId;
    }
    return indicatorId === e.indicator_id ? [e] : [{ ...e, indicator_id: indicatorId }];
  }), [supabaseEv.evidence, indicatorOps]);
  const viewSupabaseEv = indicatorOps.length === 0 ? supabaseEv : { ...supabaseEv, evidence: viewEvidence };

  // معاينة المعلم لصفحته: مؤشراته المخصصة التي عليها شواهد فقط، كما يراها الزائر
  const ownCustomIndicators = useMemo<PublicCustomIndicator[]>(() => viewSections.flatMap(s =>
    s.indicators
      .filter(ind => ind.isCustom && viewEvidence.some(e => e.indicator_id === ind.id))
      .map(ind => ({ id: ind.id, section_id: s.id, name_ar: ind.name_ar }))
  ), [viewSections, viewEvidence]);

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const openAddEvModal = (sid: number, sub: string, strategyId?: string, indicatorId?: string) => {
    setEvidenceModal({ open: true, sectionId: sid, sub, strategyId, indicatorId, mode: 'add' });
  };

  // وضع التعديل — القسم من الشاشة المعروضة لا من ev.section_id (يقبل الفراغ)
  const openEditEvModal = (sid: number, ev: SupabaseEvidence) => {
    setEvidenceModal({ open: true, sectionId: sid, sub: '', mode: 'edit', initial: ev });
  };

  // خطوة 1 من تدفّق "استراتيجيات التدريس" الجديد: اختيار استراتيجية من الكتالوج
  // (عامة + خاصة بهذا المعلم) أو إضافة واحدة جديدة — لا حفظ فعلي هنا، فقط تحديد
  // strategy_id/الاسم، ثم فتح نموذج الدليل الموحّد (خطوة 2، إجباري) عبر
  // openAddEvModal(4, name, id). لا "إضافة استراتيجية بلا دليل" بعد الآن.
  const openAddStrategyModal = () => {
    let mode: 'pick' | 'new' = teachingStrategies.strategies.length > 0 ? 'pick' : 'new';
    let selectedId = '';
    let newName = '';

    const Body = () => {
      const [localMode, setLocalMode] = useState(mode);
      const [localSelectedId, setLocalSelectedId] = useState('');

      // التبديل بين الوضعين محايد: الأخضر محجوز لزر «حفظ»
      const toggleCls = toggleBtn;

      return (
        <div className="flex flex-col gap-4">
          {teachingStrategies.strategies.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={localMode === 'pick'}
                onClick={() => { mode = 'pick'; setLocalMode('pick'); }}
                className={toggleCls(localMode === 'pick')}
              >من الكتالوج</button>
              <button
                type="button"
                aria-pressed={localMode === 'new'}
                onClick={() => { mode = 'new'; setLocalMode('new'); }}
                className={toggleCls(localMode === 'new')}
              >+ استراتيجية جديدة</button>
            </div>
          )}

          {localMode === 'pick' ? (
            <div>
              <div className={LABEL}>
                <i className="ti ti-bulb text-[16px] text-[var(--t3)]"></i> اختر استراتيجية
              </div>
              <SelectDropdown
                options={teachingStrategies.strategies.map(s => ({ value: s.id, label: s.name_ar }))}
                value={localSelectedId}
                onChange={v => { selectedId = v; setLocalSelectedId(v); }}
                placeholder="— اختر —"
                triggerClassName={FIELD + ' cursor-pointer'}
              />
            </div>
          ) : (
            <div>
              <div className={LABEL}>
                <i className="ti ti-bulb text-[16px] text-[var(--t3)]"></i> اسم الاستراتيجية الجديدة
              </div>
              <input
                type="text"
                autoFocus
                className={FIELD}
                placeholder="مثال: التعلم بالاستقصاء"
                onChange={e => { newName = e.target.value; }}
              />
            </div>
          )}
        </div>
      );
    };

    setModalConfig({
      isOpen: true,
      title: 'إضافة استراتيجية',
      subtitle: 'اختر ثم أضف دليلاً موثّقاً لها في الخطوة التالية',
      icon: 'ti-bulb',
      body: <Body />,
      onConfirm: async () => {
        if (mode === 'pick') {
          const s = teachingStrategies.strategies.find(x => x.id === selectedId);
          if (!s) { showToast('يرجى اختيار استراتيجية', '⚠️'); return; }
          closeModal();
          openAddEvModal(4, s.name_ar, s.id);
          return;
        }
        const name = newName.trim();
        if (!name) { showToast('يرجى كتابة اسم الاستراتيجية', '⚠️'); return; }
        const result = await teachingStrategies.addStrategy(name);
        if ('error' in result) {
          showToast(
            result.error === 'duplicate' ? 'هذه الاستراتيجية مضافة لديك مسبقاً' : 'تعذّر إضافة الاستراتيجية، حاول مجدداً',
            '❌'
          );
          return;
        }
        closeModal();
        openAddEvModal(4, result.strategy.name_ar, result.strategy.id);
      }
    });
  };

  const ARABIC_MONTHS_LIST = [
    { v: 1, l: 'يناير' }, { v: 2, l: 'فبراير' }, { v: 3, l: 'مارس' },
    { v: 4, l: 'أبريل' }, { v: 5, l: 'مايو'   }, { v: 6, l: 'يونيو' },
    { v: 7, l: 'يوليو' }, { v: 8, l: 'أغسطس'  }, { v: 9, l: 'سبتمبر' },
    { v: 10, l: 'أكتوبر' }, { v: 11, l: 'نوفمبر' }, { v: 12, l: 'ديسمبر' },
  ];

  const openProfileSettings = () => {
    let p = { ...state.profile };
    let yearStart = state.yearStartMonth ?? 9;
    
    const Body = () => {
      const [localP, setLocalP] = useState(p);
      const [isProcessing, setIsProcessing] = useState(false);
      const [originalAvatar, setOriginalAvatar] = useState<string | null>(null);
      const [localYearStart, setLocalYearStart] = useState(yearStart);
      const [localShareEnabled, setLocalShareEnabled] = useState(shareEnabled);
      const [shareToggleBusy, setShareToggleBusy] = useState(false);

      const handleShareToggle = async () => {
        const next = !localShareEnabled;
        setShareToggleBusy(true);
        setLocalShareEnabled(next); // تحديث تفاؤلي
        const ok = await updateShareEnabled(next);
        setShareToggleBusy(false);
        if (!ok) {
          setLocalShareEnabled(!next); // تراجع عند الفشل
          showToast('فشل تحديث إعداد المشاركة، حاول مجدداً', '⚠️');
          return;
        }
        showToast(next ? 'تم تفعيل المشاركة العامة لملفك ✓' : 'تم إيقاف المشاركة العامة لملفك', next ? '✓' : '🔒');
      };

      const handleUpdate = (field: string, value: any) => {
        const next = { ...localP, [field]: value };
        setLocalP(next);
        p = next;
      };

      // يبثّ isProcessing لأعلى إلى modalConfig نفسه — يعطّل زر "حفظ" بالمودال
      // بالكامل (وليس فقط زر رفع الصورة) طالما رفع/معالجة الصورة لم تكتمل بعد،
      // حتى لا يحفظ المستخدم رابط avatar مؤقت (base64) قبل اكتمال رفعه لـ Storage
      const setProcessing = (value: boolean) => {
        setIsProcessing(value);
        setModalConfig(prev => ({
          ...prev,
          confirmDisabled: value,
          confirmHelperText: value ? 'بانتظار اكتمال معالجة الصورة...' : undefined,
        }));
      };

      const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
          if (ev.target?.result) {
            const dataUrl = ev.target.result as string;
            setOriginalAvatar(dataUrl);
            handleUpdate('avatar', dataUrl);

            setProcessing(true);
            try {
              const imgly = await import('@imgly/background-removal') as any;
              const removeBg = imgly.default || imgly.removeBackground;
              const blob = await removeBg(file);

              const img = new Image();
              img.src = URL.createObjectURL(blob);
              img.onload = () => {
                // تصغير لأقصى بُعد 512px مع الحفاظ على النسبة، قبل الرفع لـ Storage
                const scale = Math.min(1, 512 / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                  gradient.addColorStop(0, '#52c478'); // var(--em4)
                  gradient.addColorStop(1, '#1a4f2c'); // var(--em7) roughly
                  ctx.fillStyle = gradient;
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  URL.revokeObjectURL(img.src);

                  canvas.toBlob(async (finalBlob) => {
                    if (finalBlob && user && supabase) {
                      try {
                        const filePath = `${user.id}/avatar.jpg`;
                        const { error: uploadError } = await supabase.storage
                          .from('avatars')
                          .upload(filePath, finalBlob, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
                        if (uploadError) throw uploadError;
                        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
                        // كسر الكاش: نفس المسار يُستبدل بـ upsert فيبقى الرابط ثابتاً بدون هذا
                        handleUpdate('avatar', `${urlData.publicUrl}?v=${Date.now()}`);
                      } catch (uploadErr) {
                        console.error('فشل رفع الصورة الشخصية إلى Storage:', uploadErr);
                        showToast('تعذّر رفع الصورة، حاول مجدداً', '⚠️');
                      }
                    } else if (finalBlob) {
                      // بلا حساب Supabase — لا يوجد Storage للرفع، fallback لـ base64 محلياً كباقي التطبيق
                      handleUpdate('avatar', canvas.toDataURL('image/jpeg', 0.95));
                    }
                    setProcessing(false);
                  }, 'image/jpeg', 0.95);
                } else {
                  setProcessing(false);
                }
              };
            } catch (err) {
              console.error("BG removal failed", err);
              // Fallback to original
              setProcessing(false);
            }
          }
        };
        reader.readAsDataURL(file);
      };

      const handleUndo = () => {
        if (!originalAvatar) return;
        const original = originalAvatar;
        // تحديث تفاؤلي فوري بالمعاينة المحلية (نفس نمط handleFile)، يُستبدل
        // بالرابط النهائي من Storage بعد اكتمال الرفع أدناه
        handleUpdate('avatar', original);
        setOriginalAvatar(null);

        const img = new Image();
        img.onload = () => {
          setProcessing(true);
          // نفس تصغير 512px المستخدم بـ handleFile، قبل الرفع لنفس المسار
          const scale = Math.min(1, 512 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) { setProcessing(false); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(async (finalBlob) => {
            if (finalBlob && user && supabase) {
              try {
                const filePath = `${user.id}/avatar.jpg`;
                const { error: uploadError } = await supabase.storage
                  .from('avatars')
                  .upload(filePath, finalBlob, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
                if (uploadError) throw uploadError;
                const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
                handleUpdate('avatar', `${urlData.publicUrl}?v=${Date.now()}`);
              } catch (uploadErr) {
                console.error('فشل رفع صورة التراجع إلى Storage:', uploadErr);
                showToast('تعذّر رفع الصورة، حاول مجدداً', '⚠️');
              }
            } else if (finalBlob) {
              // بلا حساب Supabase — لا يوجد Storage للرفع، fallback لـ base64 محلياً كباقي التطبيق
              handleUpdate('avatar', canvas.toDataURL('image/jpeg', 0.95));
            }
            setProcessing(false);
          }, 'image/jpeg', 0.95);
        };
        img.src = original;
      };

      const handleDeleteAvatar = async () => {
        handleUpdate('avatar', '');
        setOriginalAvatar(null);
        if (user && supabase) {
          try {
            const { error } = await supabase.storage.from('avatars').remove([`${user.id}/avatar.jpg`]);
            if (error) console.error('فشل حذف الصورة الشخصية من Storage:', error);
          } catch (err) {
            console.error('فشل حذف الصورة الشخصية من Storage:', err);
          }
        }
      };

      return (
        <div className="flex flex-col gap-6 max-h-[min(60vh,calc(100dvh-17rem))] overflow-y-auto">
          <section>
            <div className={SECTION_TITLE}><i className="ti ti-user text-[16px] text-[var(--t3)]"></i> الملف الشخصي</div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-[var(--r-full)] shrink-0 flex items-center justify-center text-[length:var(--fs-md)] font-bold text-[var(--t1)] bg-cover bg-center overflow-hidden ${localP.avatar ? '' : 'bg-[var(--s2)] border border-[var(--bd2)]'}`} style={localP.avatar ? { backgroundImage: `url(${localP.avatar})` } : {}}>
                  {!localP.avatar && localP.name.substring(0, 2)}
                </div>
                <div className="flex flex-col items-start gap-2 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <label className={`${BTN_2ND} border-[var(--bd2)] text-[var(--t2)] ${isProcessing ? 'opacity-40 cursor-wait' : 'cursor-pointer hover:bg-[var(--s2)] hover:text-[var(--t1)]'}`}>
                      <i className="ti ti-upload text-[16px]"></i>رفع صورة
                      <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={isProcessing} />
                    </label>
                    {localP.avatar && (
                      <button type="button" className={`${BTN_2ND} border-[var(--danger)]/35 text-[var(--danger)] cursor-pointer hover:bg-[var(--s2)]`} onClick={handleDeleteAvatar}>
                        حذف
                      </button>
                    )}
                    {originalAvatar && !isProcessing && (
                      <button type="button" className={`${BTN_2ND} border-[var(--bd2)] text-[var(--t2)] cursor-pointer hover:bg-[var(--s2)] hover:text-[var(--t1)]`} onClick={handleUndo}>
                        <i className="ti ti-arrow-back-up text-[16px]"></i>تراجع عن التفريغ
                      </button>
                    )}
                  </div>
                  {isProcessing && (
                    <div className="text-[length:var(--fs-xs)] text-[var(--t3)] flex items-center gap-2">
                      <i className="ti ti-loader animate-spin"></i> جاري معالجة الصورة وتفريغ الخلفية...
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className={LABEL}>الاسم الكامل</div>
                  <input type="text" value={localP.name} onChange={e => handleUpdate('name', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <div className={LABEL}>المسمى الوظيفي</div>
                  <input type="text" value={localP.role} onChange={e => handleUpdate('role', e.target.value)} className={FIELD} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className={LABEL}>جهة العمل (المدرسة)</div>
                  <input type="text" value={localP.school} onChange={e => handleUpdate('school', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <div className={LABEL}>سنوات الخبرة</div>
                  <input type="number" value={localP.yearsOfExperience} onChange={e => handleUpdate('yearsOfExperience', parseInt(e.target.value) || 0)} className={FIELD} />
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-[var(--bd)] pt-6">
            <div className={SECTION_TITLE}><i className="ti ti-address-book text-[16px] text-[var(--t3)]"></i> التواصل</div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className={LABEL}>رقم الجوال</div>
                  <input type="text" value={localP.phone} onChange={e => handleUpdate('phone', e.target.value)} className={FIELD} placeholder="05XXXXXXXX" />
                  <div className={HINT}>يظهر في صفحتك العامة عند تفعيل المشاركة</div>
                </div>
                <div>
                  <div className={LABEL}>البريد الإلكتروني</div>
                  <input type="email" value={localP.email} onChange={e => handleUpdate('email', e.target.value)} className={FIELD} placeholder="email@example.com" />
                  <div className={HINT}>يظهر في صفحتك العامة عند تفعيل المشاركة</div>
                </div>
              </div>
              <div>
                <div className={LABEL}>حساب X (تويتر)</div>
                <input type="text" value={localP.twitter} onChange={e => handleUpdate('twitter', e.target.value)} className={FIELD} placeholder="https://x.com/..." />
              </div>
              <div>
                <div className={LABEL}>حساب LinkedIn</div>
                <input type="text" value={localP.linkedin} onChange={e => handleUpdate('linkedin', e.target.value)} className={FIELD} placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <div className={LABEL}>قناة YouTube</div>
                <input type="text" value={localP.youtube} onChange={e => handleUpdate('youtube', e.target.value)} className={FIELD} placeholder="https://youtube.com/@..." />
              </div>
            </div>
          </section>

          <section className="border-t border-[var(--bd)] pt-6">
            <div className={SECTION_TITLE}><i className="ti ti-share text-[16px] text-[var(--t3)]"></i> المشاركة</div>
            <div className="flex items-center justify-between gap-3 bg-[var(--s2)] border border-[var(--bd)] rounded-[var(--r-sm)] p-3">
              <div className="min-w-0">
                <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">مشاركة ملفي علناً</div>
                <div className={`${HINT} leading-relaxed`}>
                  عند التفعيل، يستطيع أي شخص يملك رابط المشاركة عرض ملف إنجازك دون تسجيل دخول. الوضع الافتراضي معطّل.
                </div>
              </div>
              {/* مساحة الضغط 44px، والمسار 44×24 داخلها */}
              <button
                type="button"
                role="switch"
                aria-checked={localShareEnabled}
                aria-label="مشاركة ملفي علناً"
                disabled={shareToggleBusy}
                onClick={handleShareToggle}
                className={`shrink-0 w-11 h-11 flex items-center justify-center bg-transparent border-none p-0 ${shareToggleBusy ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
              >
                <span className={`relative block w-11 h-6 rounded-[var(--r-full)] border transition-colors duration-[250ms] motion-reduce:transition-none ${localShareEnabled ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--s3)] border-[var(--bd2)]'}`}>
                  <span className={`absolute top-px w-5 h-5 rounded-[var(--r-full)] bg-[var(--t1)] transition-[left] duration-[250ms] motion-reduce:transition-none ${localShareEnabled ? 'left-[21px]' : 'left-px'}`} />
                </span>
              </button>
            </div>
          </section>

          <section className="border-t border-[var(--bd)] pt-6">
            <div className={SECTION_TITLE}><i className="ti ti-calendar-stats text-[16px] text-[var(--t3)]"></i> السنة الدراسية</div>
            <div>
              <div className={LABEL}>شهر بداية السنة الدراسية</div>
              <SelectDropdown
                options={ARABIC_MONTHS_LIST.map(m => ({ value: String(m.v), label: m.l }))}
                value={String(localYearStart)}
                onChange={v => { const n = Number(v); setLocalYearStart(n); yearStart = n; }}
                placeholder="اختر الشهر"
                triggerClassName={FIELD + ' cursor-pointer'}
              />
              <div className={HINT}>يُستخدم لحساب المعدل الشهري ونسب الإنجاز السنوي</div>
            </div>
          </section>

          {user && (
            <div className="border-t border-[var(--bd)] pt-6">
              <button
                type="button"
                className={`${BTN_DNG} w-full transition-colors duration-150 hover:bg-[var(--s2)]`}
                onClick={async () => {
                  closeModal();
                  await signOut();
                  showToast('تم تسجيل الخروج بنجاح 👋', '👋');
                }}
              >
                <i className="ti ti-logout text-[20px]"></i>
                تسجيل الخروج من الحساب
              </button>
            </div>
          )}
        </div>
      );
    };

    setModalConfig({
      isOpen: true,
      title: 'إعدادات الحساب',
      subtitle: 'تحديث بيانات الملف الشخصي وحسابات التواصل',
      icon: 'ti-settings',
      body: <Body />,
      onConfirm: async () => {
        // ندمج تعديلي profile وyearStartMonth في استدعاء saveState واحد بدل
        // استدعاءين منفصلين (updateProfile ثم updateYearStartMonth) — كل واحد
        // منهما كان يبني newState من نسخة state القديمة في الـ closure دون رؤية
        // تعديل الآخر، فيتصارعان على نفس عمود state ويكتب الثاني فوق الأول
        const combinedState = {
          ...state,
          profile: { ...state.profile, ...p },
          yearStartMonth: yearStart,
        };
        const saved = await saveState(combinedState);
        if (!saved) {
          showToast('فشل الحفظ، تحقق من اتصالك وحاول مجدداً', '⚠️');
          return; // لا نغلق المودال — يبقى تعديل المستخدم كما هو ليعيد المحاولة
        }
        showToast('تم تحديث الحساب بنجاح ✨', '✨');
        closeModal();
      }
    });
  };

  // openEvalModal() حُذفت (14 سبتمبر 2026) مع calculateEvaluation() — كانت تفتح
  // مودال تفصيلي (50/30/20 نقطة) لنفس الشارة المهجورة المحذوفة من utils.ts.

  // «أبرز إنجاز»: الشاهد المثبّت إن كان موجوداً في الشواهد المحمّلة. حذفه يجعل
  // العمود NULL في القاعدة (ON DELETE SET NULL)، وهذا الاشتقاق يتبعها فوراً.
  const effectivePinnedId = pinnedTopEvidenceId && supabaseEv.evidence.some(e => e.id === pinnedTopEvidenceId)
    ? pinnedTopEvidenceId : null;
  // أولوية get_shared_portfolio نفسها — لمعاينة المالك صفحته
  const approvedAiTopId = aiTopAchievementApproved && aiTopAchievementEvidenceId
    && supabaseEv.evidence.some(e => e.id === aiTopAchievementEvidenceId && e.section_id !== null)
    ? aiTopAchievementEvidenceId : null;

  const handleTogglePin = async (ev: SupabaseEvidence) => {
    const unpin = ev.id === effectivePinnedId;
    const ok = await setPinnedTopEvidence(unpin ? null : ev.id);
    if (!ok) { showToast('تعذّر التثبيت، حاول مجدداً', '⚠️'); return; }
    showToast(unpin ? 'أُلغي التثبيت' : 'ثُبّت كأبرز إنجاز', '✓');
  };

  const handleToggleGallery = async (ev: SupabaseEvidence) => {
    const hide = !ev.hidden_from_gallery;
    const ok = await supabaseEv.setHiddenFromGallery(ev.id, hide);
    if (!ok) { showToast('تعذّر الحفظ، حاول مجدداً', '⚠️'); return; }
    showToast(hide ? 'أُخفي من اللمحات' : 'ظهر في اللمحات', '✓');
  };

  const handleApproveTopSuggestion = async (evidenceId: string) => {
    const ok = await approveTopSuggestion(evidenceId);
    if (!ok) { showToast('تعذّر الاعتماد، حاول مجدداً', '⚠️'); return; }
    showToast('اعتُمد كأبرز إنجاز', '✓');
  };

  const handleDeleteEv = (evidenceId: string) => {
    setModalConfig({
      isOpen: true,
      title: 'حذف الشاهد',
      subtitle: 'سيُحذف الشاهد نهائياً من ملفك، ولا يمكن استرجاعه.',
      icon: 'ti-trash',
      tone: 'danger',
      body: null,
      onConfirm: async () => {
        // الحذف بمعرّف الدليل في جدول evidence فقط — رسالة النجاح بعد نجاحه فعلياً
        try {
          await supabaseEv.deleteEvidence(evidenceId);
          showToast('حُذف الشاهد', '');
        } catch (err) {
          console.error('[handleDeleteEv] Supabase evidence delete failed:', err);
          showToast('تعذّر حذف الشاهد، حاول مجدداً', '');
        }
        closeModal();
      }
    });
  };

  // شاشة تحميل الأقسام/المؤشرات — تسبق كل مسارات العرض (لوحة التحكم، المشاركة
  // العامة، تقرير الحصاد)، إذ تحتاجها جميعاً لبناء sections الكامل (subs
  // مشتقة من section_indicators). لا سقوط على subs ثابتة عند الفشل أبداً.
  // شاشة البداية تحمل key="boot" في كل مواضعها، فيبقى المكوّن نفسه (ومؤقتاته)
  // حياً عند الانتقال من حالة تحميل إلى أخرى. بعد معرفة أن المستخدم مسجّل
  // الدخول تُعرض بدلها هيكلة لوحة التحكم.
  const showDashboardSkeleton = !!user && !shareUserId && !reportId && !passwordRecovery;

  if (sectionsStatus === 'loading') {
    return showDashboardSkeleton ? <DashboardSkeleton /> : <SplashScreen key="boot" />;
  }

  // فشل جلب مؤشرات الأقسام — لا يمكن بناء أي واجهة صحيحة بدونها (subs
  // مشتقة منها كلياً الآن)، فتُحجب الواجهة كاملة بدل عرض بيانات ناقصة/مضلِّلة.
  // key مختلف: «إعادة المحاولة» تعيد تركيب شاشة جديدة بمؤقتات من الصفر.
  if (sectionsStatus === 'error') {
    return <SplashScreen key="failed" failed onRetry={reloadSections} />;
  }

  // Show loading screen for shared profile view
  if (shareUserId && sharedLoading) {
    return <SplashScreen key="boot" />;
  }

  // Show error screen if shared profile not found
  if (shareUserId && !sharedLoading && (sharedError || !sharedState)) {
    return <PublicUnavailable kind="profile" />;
  }

  // Show loading screen for a harvest report (?report=)
  if (reportId && harvestReportLoading) {
    return <SplashScreen key="boot" />;
  }

  // Show error screen if the harvest report was not found
  if (reportId && !harvestReportLoading && (harvestReportError || !harvestReport)) {
    return <PublicUnavailable kind="report" />;
  }

  if (loading) {
    return showDashboardSkeleton ? <DashboardSkeleton /> : <SplashScreen key="boot" />;
  }

  // If viewing a shared profile via ?share= — render minimal layout with shared state
  if (shareUserId && sharedState) {
    return (
      <>
        <PublicTopBar />
        <main>
          <Public state={sharedState} sections={sections} continuity={sharedContinuity} evidence={sharedEvidence} resultsAnalysis={sharedResultsAnalysis} sectionSummaries={sharedSectionSummaries} strategyNames={sharedStrategyNames} customIndicators={sharedCustomIndicators} />
        </main>
      </>
    );
  }

  // If viewing a harvest report via ?report= — لقطة ثابتة، بلا أي RPC حية
  if (reportId && harvestReport) {
    const snapshot = harvestReport.snapshot;
    return (
      <>
        <PublicTopBar />
        <main>
          <Public
            state={snapshot.state}
            sections={sections}
            continuity={snapshot.continuity}
            evidence={snapshot.evidence}
            resultsAnalysis={snapshot.resultsAnalysis}
            frozenResultsComparisons={snapshot.resultsComparisons}
            strategyNames={snapshot.strategyNames}
            customIndicators={snapshot.customIndicators ?? []}
            reportMeta={{
              periodLabel: snapshot.periodLabel,
              periodFrom: snapshot.periodFrom,
              generatedAt: snapshot.generatedAt,
              pointsLevel: snapshot.pointsLevel,
            }}
          />
        </main>
      </>
    );
  }

  // ملف شخصي ناقص (مستخدم جديد أو حساب قديم لم يُكمل بياناته) — يحجب الواجهة
  // كاملة حتى الحفظ، ولا يُغلق بزر X أو بالضغط خارجه.
  if (user && !passwordRecovery && currentPage !== 'auth' && isProfileIncomplete(state.profile)) {
    return (
      <>
        <Background />
        <Onboarding
          profile={state.profile}
          onComplete={(update) => {
            updateProfile(update);
            showToast('تم حفظ بياناتك بنجاح ✓', '✓');
          }}
        />
        <Toast {...toastData} />
      </>
    );
  }

  return (
    <>
      <Background />
      {/* Hide the navigation bar on the login page — only show it after the user signs in */}
      {user && currentPage !== 'auth' && (
        <Nav currentPage={currentPage} setPage={setCurrentPage} profile={state.profile} onOpenProfileSettings={openProfileSettings} isAdmin={isAdmin} isLoggedIn={!!user} />
      )}

      <main className="lg:pb-0 pb-[80px]">
        {currentPage === 'auth' && (
          <Auth
            onLoginSuccess={() => setCurrentPage('dashboard')}
            onToast={(msg, kind) => showToast(msg, '', undefined, undefined, kind)}
            recovery={passwordRecovery}
            onRecoveryComplete={() => {
              clearPasswordRecovery();
              setCurrentPage('dashboard');
            }}
          />
        )}
        
        {currentPage === 'dashboard' && (
          <Dashboard
            state={state}
            sections={viewSections}
            onAddEvClick={openAddEvModal}
            onDeleteEv={handleDeleteEv}
            onEditEv={openEditEvModal}
            onAddStrategyClick={openAddStrategyModal}
            strategyNames={strategyNames}
            announcements={announcements}
            onMarkNotificationsSeen={markNotificationsSeen}
            onOpenProfileSettings={openProfileSettings}
            shareEnabled={shareEnabled}
            onUpdateWelcome={updateWelcome}
            onMarkHintSeen={markHintSeen}
            accountCreatedAt={user?.created_at}
            academicDates={academicDates}
            supabaseEv={viewSupabaseEv}
            monthlyProgress={monthlyProgress}
            completion={portfolioCompletion.completion}
            completionError={portfolioCompletion.error}
            userId={user?.id}
            onEvidenceSaved={onEvidenceSaved}
            onToast={showToast}
            aiConsentGiven={!!state.aiSuggestConsentAt}
            onGiveAiConsent={setAiSuggestConsent}
            onAddIndicator={handleAddIndicator}
            onRenameIndicator={handleRenameIndicator}
            onDeleteIndicator={handleDeleteIndicator}
            highlight={{ pinnedId: effectivePinnedId, onTogglePin: handleTogglePin, onToggleGallery: handleToggleGallery }}
            topSuggestionId={aiTopAchievementApproved ? null : aiTopAchievementEvidenceId}
            onApproveTopSuggestion={handleApproveTopSuggestion}
            onDismissTopSuggestion={dismissTopSuggestion}
          />
        )}

        {currentPage === 'public' && (
          <Public
            state={{
              ...state,
              ai_summary: aiSummary,
              top_achievement_evidence_id: effectivePinnedId ?? approvedAiTopId,
              top_achievement_source: effectivePinnedId ? 'teacher' : approvedAiTopId ? 'ai' : null,
              completion: portfolioCompletion.completion ?? undefined,
            }}
            sections={viewSections}
            continuity={ownContinuity}
            evidence={viewEvidence}
            resultsAnalysis={ownResultsAnalysisPublic}
            sectionSummaries={ownSectionSummaries}
            strategyNames={strategyNames}
            customIndicators={ownCustomIndicators}
            ownerPreview
          />
        )}
        
        {currentPage === 'admin' && isAdmin && (
          <AdminDashboard
            users={adminUsers}
            stats={adminStats}
            loading={adminLoading}
            error={adminError}
            onReload={adminReload}
            onDeleteUser={deleteUserPortfolio}
            onResetUser={resetUserPortfolio}
            onExportCSV={exportCSV}
            onToast={showToast}
            getShareUrl={getShareUrl}
            onPublishAnnouncement={createAnnouncement}
            onUpdateAnnouncement={updateAnnouncement}
            onDeleteAnnouncement={deleteAnnouncement}
            announcements={announcements}
            onPublishAcademicDate={createAcademicDate}
            onUpdateAcademicDate={updateAcademicDate}
            onDeleteAcademicDate={deleteAcademicDate}
            academicDates={academicDates}
            featureFlags={featureFlags}
            featureOverrides={featureOverrides}
            onSetGlobalFeatureFlag={setGlobalFeatureFlag}
            onSetPortfolioFeatureOverride={setPortfolioFeatureOverride}
            onRemovePortfolioFeatureOverride={removePortfolioFeatureOverride}
          />
        )}
      </main>
      
      <Modal {...modalConfig} onClose={closeModal}>{modalConfig.body}</Modal>

      <EvidenceModal
        isOpen={evidenceModal.open}
        onClose={() => setEvidenceModal(prev => ({ ...prev, open: false }))}
        sectionId={evidenceModal.sectionId}
        sub={evidenceModal.sub}
        strategyId={evidenceModal.strategyId}
        indicatorId={evidenceModal.indicatorId}
        mode={evidenceModal.mode}
        initial={evidenceModal.initial}
        userId={user?.id}
        supabaseEv={supabaseEv}
        onEvidenceSaved={onEvidenceSaved}
        onToast={showToast}
        aiConsentGiven={!!state.aiSuggestConsentAt}
        onGiveAiConsent={setAiSuggestConsent}
      />

      <Toast {...toastData} />
    </>
  );
}


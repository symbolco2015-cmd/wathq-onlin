import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import type { AppState, UserProfile, Announcement, AcademicDate } from '../types';

// ═══════════════════════════════════════════════════════════
// قائمة المشرفين — أضف إيميلك هنا لمنح صلاحيات الأدمن
// ═══════════════════════════════════════════════════════════
const ADMIN_EMAILS = [
  'azozsaleh@gmail.com',
];
// ═══════════════════════════════════════════════════════════

const defaultProfile: UserProfile = {
  name: 'الاسم الثلاثي',
  role: 'معلم رياضيات',
  school: 'متوسطة الفيصل، جدة',
  phone: '',
  email: 'ahmed@edu.sa',
  twitter: '',
  linkedin: '',
  youtube: '',
  avatar: '',
  yearsOfExperience: 12
};

const defaultState: AppState = {
  ev: {},
  csubs: {},
  notes: {},
  profile: defaultProfile,
  readAnnouncements: [],
  yearStartMonth: 9,
};

// إصدار تخزين localStorage — غيّره عند أي تصفير كامل لقاعدة البيانات لإبطال
// مفتاح 'w4' القديم محلياً تلقائياً عند كل مستخدم، بدل أن يُعاد كتابته فوق
// القاعدة النظيفة عبر saveState (انظر الـeffect الأول في useAppStore).
const STORAGE_VERSION = 'v2-2026-08';

export function useAppStore() {
  const [state, setState] = useState<AppState>(defaultState);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [academicDates, setAcademicDates] = useState<AcademicDate[]>([]);
  // share_enabled يعيش في عمود مستقل بجدول portfolios (وليس داخل state JSONB) —
  // الافتراضي معطّل دائماً؛ المعلم وحده من يفعّله من إعدادات حسابه.
  const [shareEnabled, setShareEnabled] = useState(false);
  // ai_summary / ai_top_achievement_evidence_id: عمودان مستقلان بجدول portfolios
  // (وليسا داخل state JSONB) — لا يجب دمجهما في AppState لأن ذلك يجعلهما يُكتَبان
  // خطأً داخل عمود state عند أي saveState لاحق. تُحفظان هنا بمعزل تام، ويُبنى منهما
  // كائن مركَّب عند التمرير لمكوّن Public.tsx فقط في معاينة المالك لملفه الخاص.
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiTopAchievementEvidenceId, setAiTopAchievementEvidenceId] = useState<string | null>(null);
  // عدّاد طلبات تحميل state — يزيده أي تحميل جديد (الـeffect رقم 2) وأي حفظ
  // يدوي ناجح (saveState). عند رجوع نتيجة SELECT متأخرة، إن لم يعد رقمها
  // المحلي مطابقاً لهذا العدّاد، تُتجاهل تماماً بدل استدعاء setState — يمنع
  // race condition تمحو حفظاً حديثاً بنتيجة تحميل قديمة رجعت متأخرة.
  const loadRequestIdRef = useRef(0);

  // 0. ترحيل/إبطال localStorage — يجب أن يعمل قبل أي قراءة لمفتاح 'w4' (يقع
  // في الـeffect رقم 2 أدناه، ضمن fallback عدم وجود مستخدم/Supabase). React
  // يُشغّل effects حسب ترتيب تصريحها ضمن نفس الـcommit، لذا وضعه هنا قبل بقية
  // الـeffects يضمن اكتمال الترحيل قبل أي fallback قراءة لاحق.
  useEffect(() => {
    try {
      const storedVersion = localStorage.getItem('w4_version');
      if (storedVersion !== STORAGE_VERSION) {
        localStorage.removeItem('w4');
        localStorage.setItem('w4_version', STORAGE_VERSION);
      }
    } catch (e) {}
  }, []);

  // 1. Listen to Auth State
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase fires PASSWORD_RECOVERY after the user opens the reset link in their email
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      setUser(session?.user ?? null);
      if (!session?.user) {
        // Reset state on logout
        setState(defaultState);
        setShareEnabled(false);
        setAiSummary(null);
        setAiTopAchievementEvidenceId(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 1b. حساب صلاحية الأدمن بشكل فوري من الإيميل — بدون Supabase
  const isAdmin = useMemo(() => {
    if (!user?.email) return false;
    const email = user.email.toLowerCase().trim();
    const result = ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(email);
    return result;
  }, [user]);

  // Fetch announcements من Supabase
  const fetchAnnouncements = async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          setAnnouncements(data);
          return;
        }
        console.warn('[Announcements] Error or missing table. Error:', error?.message);
      } catch (err) {
        console.warn('[Announcements] Exception:', err);
      }
    }
    setAnnouncements([]);
  };

  useEffect(() => {
    fetchAnnouncements();
    if (supabase) {
      const channel = supabase
        .channel('public:announcements')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
          fetchAnnouncements();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  // Fetch academic_dates من Supabase
  const fetchAcademicDates = async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('academic_dates')
          .select('*')
          .order('date', { ascending: true });
        if (!error && data) {
          setAcademicDates(data);
          return;
        }
        console.warn('[AcademicDates] Error or missing table. Error:', error?.message);
      } catch (err) {
        console.warn('[AcademicDates] Exception:', err);
      }
    }
    setAcademicDates([]);
  };

  useEffect(() => {
    fetchAcademicDates();
    if (supabase) {
      const channel = supabase
        .channel('public:academic_dates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'academic_dates' }, () => {
          fetchAcademicDates();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  // 2. Load State (from Supabase if logged in, otherwise localStorage)
  useEffect(() => {
    async function loadData() {
      const requestId = ++loadRequestIdRef.current;
      setLoading(true);
      if (user && supabase) {
        try {
          const { data, error } = await supabase
            .from('portfolios')
            .select('state, share_enabled, ai_summary, ai_top_achievement_evidence_id')
            .eq('id', user.id)
            .single();

          // تجاهل هذه النتيجة إن بدأ تحميل أحدث، أو إن نجح حفظ يدوي (saveState
          // يزيد loadRequestIdRef عند النجاح) أثناء انتظار هذا الـ SELECT
          if (requestId !== loadRequestIdRef.current) return;

          if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
            console.error("Error loading portfolio from Supabase:", error);
          }

          if (data && data.state && Object.keys(data.state).length > 0) {
            setState({
              ...defaultState,
              ...data.state,
              profile: {
                ...defaultState.profile,
                ...(data.state.profile || {})
              }
            });
            setShareEnabled(!!data.share_enabled);
            setAiSummary(data.ai_summary ?? null);
            setAiTopAchievementEvidenceId(data.ai_top_achievement_evidence_id ?? null);
            setLoading(false);
            return;
          } else {
            // Seeding new user portfolio with their Auth metadata
            const initialProfile = {
              ...defaultProfile,
              name: user.user_metadata?.full_name || user.email?.split('@')[0] || defaultProfile.name,
              email: user.email || defaultProfile.email,
            };
            const initialStateWithProfile = {
              ...defaultState,
              profile: initialProfile
            };
            setState(initialStateWithProfile);
            setShareEnabled(false); // ملف جديد دائماً غير مفعّل للمشاركة العامة افتراضياً
            setAiSummary(null);
            setAiTopAchievementEvidenceId(null);

            // Save newly seeded state to DB
            const { error: insertError } = await supabase
              .from('portfolios')
              .upsert({
                id: user.id,
                state: initialStateWithProfile,
                updated_at: new Date().toISOString()
              });

            // نفس منطق التجاهل هنا: لو حفظ يدوي أحدث نجح أثناء انتظار تزريع
            // الحساب الجديد، لا نُنهي التحميل فوق حالة أحدث حفظها المستخدم للتو
            if (requestId !== loadRequestIdRef.current) return;

            if (insertError) {
              console.error("Failed to seed initial portfolio row:", insertError);
            }
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error("Exception loading data from Supabase:", e);
        }
      }

      // نفس منطق التجاهل: قد نصل هنا بعد استثناء وقع خلال الانتظار أعلاه —
      // تحقق أن هذا لا يزال أحدث طلب قبل الكتابة فوق state بأي fallback
      if (requestId !== loadRequestIdRef.current) return;

      // Local storage fallback for guests or before Supabase connects
      try {
        const d = localStorage.getItem('w4');
        if (d) {
          const parsed = JSON.parse(d);
          setState({
            ...defaultState,
            ...parsed,
            profile: {
              ...defaultState.profile,
              ...(parsed.profile || {})
            }
          });
        }
      } catch (e) {}
      setAiSummary(null);
      setAiTopAchievementEvidenceId(null);
      setLoading(false);
    }

    loadData();
  }, [user?.id]); // يعتمد على ID فقط — لا يُعاد التحميل عند تجديد الـ token (TOKEN_REFRESHED)

  // 3. Save State (local & DB)
  // ترجع Promise<boolean> (true = نجح الحفظ فعلياً) بدل fire-and-forget، حتى
  // تقدر الواجهة (مثل مودال إعدادات الحساب) تعرف إن فشل الحفظ الصامت ولا
  // تتصرف كأنه نجح (إغلاق المودال، toast نجاح، ...).
  const saveState = async (newState: AppState): Promise<boolean> => {
    setState(newState);

    // Always save to localStorage for offline access
    try {
      localStorage.setItem('w4', JSON.stringify(newState));
    } catch (e) {}

    // Sync with Supabase if authenticated
    if (user && supabase) {
      try {
        const { error } = await supabase
          .from('portfolios')
          .upsert({
            id: user.id,
            state: newState,
            updated_at: new Date().toISOString()
          });

        if (error) {
          console.error("Error saving portfolio to Supabase:", error);
          return false;
        }

        // حفظ يدوي ناجح يُبطل أي طلب تحميل (SELECT) سابق لا يزال معلّقاً —
        // حتى لو لم يبدأ أي تحميل جديد فعلياً — يمنع نتيجته المتأخرة من محو
        // هذا الحفظ (انظر التعليق أعلى loadRequestIdRef وeffect رقم 2)
        loadRequestIdRef.current++;
        return true;
      } catch (e) {
        console.error("Failed to sync portfolio to Supabase:", e);
        return false;
      }
    }

    return true;
  };

  const updateProfile = (profileUpdate: Partial<UserProfile>) => {
    return saveState({ ...state, profile: { ...state.profile, ...profileUpdate } });
  };

  // share_enabled عمود مستقل خارج state JSONB — يُحدَّث مباشرة وليس عبر saveState
  const updateShareEnabled = async (enabled: boolean): Promise<boolean> => {
    if (!user || !supabase) return false;
    setShareEnabled(enabled); // تحديث تفاؤلي للواجهة
    const { error } = await supabase
      .from('portfolios')
      .update({ share_enabled: enabled })
      .eq('id', user.id);

    if (error) {
      console.error('Error updating share_enabled:', error);
      setShareEnabled(!enabled); // تراجع عند الفشل
      return false;
    }
    return true;
  };

  const addEv = (
    sid: number,
    sub: string,
    type: 'pdf' | 'img' | 'doc' | 'vid',
    name: string,
    url?: string
  ) => {
    const k = `${sid}|${sub}`;
    const newEv = { ...state.ev };
    if (!newEv[k]) newEv[k] = [];
    newEv[k].push({
      type,
      name,
      url,
      date: new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }),
    });
    return saveState({ ...state, ev: newEv });
  };

  const delEv = (sid: number, sub: string, i: number) => {
    const k = `${sid}|${sub}`;
    const newEv = { ...state.ev };
    if (newEv[k]) {
      newEv[k].splice(i, 1);
      return saveState({ ...state, ev: newEv });
    }
  };

  const addSub = (sid: number, val: string) => {
    const newSubs = { ...state.csubs };
    if (!newSubs[sid]) newSubs[sid] = [];
    newSubs[sid].push(val);
    return saveState({ ...state, csubs: newSubs });
  };

  const delSub = (sid: number, subName: string) => {
    const newSubs = { ...state.csubs };
    if (newSubs[sid]) {
      newSubs[sid] = newSubs[sid].filter(s => s !== subName);
    }
    // Also remove any evidence linked to this sub
    const k = `${sid}|${subName}`;
    const newEv = { ...state.ev };
    delete newEv[k];
    const newNotes = { ...state.notes };
    delete newNotes[k];
    return saveState({ ...state, csubs: newSubs, ev: newEv, notes: newNotes });
  };

  const updateNote = (k: string, val: string) => {
    return saveState({ ...state, notes: { ...state.notes, [k]: val } });
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('w4');
    setState(defaultState);
    setShareEnabled(false);
  };

  // Called once the user has finished setting a new password via the recovery flow
  const clearPasswordRecovery = () => setPasswordRecovery(false);

  const updateYearStartMonth = (month: number) => {
    return saveState({ ...state, yearStartMonth: month });
  };

  const markAnnouncementAsRead = (id: string) => {
    const read = state.readAnnouncements || [];
    if (!read.includes(id)) {
      const nextRead = [...read, id];
      return saveState({
        ...state,
        readAnnouncements: nextRead
      });
    }
  };

  // يُسجَّل مرة واحدة فقط لكل حساب — يمنع تكرار عرض تحذير خصوصية ميزة
  // "اقتراح تلقائي من الصورة" بعد أول موافقة.
  const setAiSuggestConsent = () => {
    if (state.aiSuggestConsentAt) return;
    return saveState({ ...state, aiSuggestConsentAt: new Date().toISOString() });
  };

  return {
    state,
    user,
    loading,
    isAdmin,
    passwordRecovery,
    clearPasswordRecovery,
    addEv,
    delEv,
    addSub,
    delSub,
    updateNote,
    updateProfile,
    saveState,
    signOut,
    announcements,
    markAnnouncementAsRead,
    fetchAnnouncements,
    academicDates,
    updateYearStartMonth,
    shareEnabled,
    updateShareEnabled,
    setAiSuggestConsent,
    aiSummary,
    aiTopAchievementEvidenceId,
  };
}


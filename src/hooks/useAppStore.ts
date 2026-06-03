import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import type { AppState, UserProfile, Announcement } from '../types';

// ═══════════════════════════════════════════════════════════
// قائمة المشرفين — أضف إيميلك هنا لمنح صلاحيات الأدمن
// ═══════════════════════════════════════════════════════════
const ADMIN_EMAILS = [
  'azozsaleh@gmail.com',
];
// ═══════════════════════════════════════════════════════════

const defaultProfile: UserProfile = {
  name: 'أحمد محمد العمري',
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
  strats: ['الصف المقلوب', 'التعلم التعاوني', 'التعلم النشط'],
  csubs: {},
  notes: {},
  profile: defaultProfile,
  readAnnouncements: []
};

const mockAnnouncements: Announcement[] = [
  {
    id: 'mock-1',
    title: 'إطلاق لوحة إعلانات التحديثات والتعاميم البرمجية والإدارية',
    content: 'نرحب بكم في لوحة إعلانات وثّق الجديدة! هنا تجدون آخر التعاميم الإدارية الصادرة، والتحديثات البرمجية للمنصة لتبسيط توثيق ملفاتكم وإنجازاتكم المهنية والتعليمية.',
    category: 'tech',
    created_at: new Date('2026-06-03T12:00:00Z').toISOString(),
  },
  {
    id: 'mock-2',
    title: 'بدء رفع أدلة وشواهد التقييم للعام الدراسي 1446',
    content: 'وفقاً لتوجيهات وزارة التعليم، نحث جميع الزملاء المعلمين والمعلمات على البدء في رفع الأدلة والشواهد الخاصة ببنود التقييم المهني. يرجى توثيق ما لا يقل عن 5 شواهد وتفعيل استراتيجيتين للحصول على شارة التوثيق الكامل.',
    category: 'admin',
    created_at: new Date('2026-06-02T08:00:00Z').toISOString(),
  },
  {
    id: 'mock-3',
    title: 'موعد إغلاق إدخال الشواهد النهائية لملف الإنجاز',
    content: 'تنبيه هام لجميع المعلمين: آخر موعد لرفع وتعديل الشواهد واستراتيجيات التدريس هو نهاية الفصل الدراسي الثاني 1447/01/15 هـ. يرجى مراجعة وتدقيق ملفاتكم والتأكد من إكمال جميع المتمتطلبات المهنية.',
    category: 'urgent',
    created_at: new Date('2026-06-01T15:30:00Z').toISOString(),
  }
];

export function useAppStore() {
  const [state, setState] = useState<AppState>(defaultState);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

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
    console.log('[Admin] email:', email, '| isAdmin:', result);
    return result;
  }, [user]);

  // Fetch announcements — مع fallback لبيانات تجريبية إذا لم يوجد الجدول
  const fetchAnnouncements = async () => {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data) {
          // استخدم البيانات الحقيقية إذا وُجدت، وإلا استخدم التجريبية
          setAnnouncements(data.length > 0 ? data : mockAnnouncements);
          return;
        }
        console.warn('[Announcements] Error or missing table, using mock data. Error:', error?.message);
      } catch (err) {
        console.warn('[Announcements] Exception, using mock data:', err);
      }
    }
    setAnnouncements(mockAnnouncements);
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

  // 2. Load State (from Supabase if logged in, otherwise localStorage)
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      if (user && supabase) {
        try {
          const { data, error } = await supabase
            .from('portfolios')
            .select('state')
            .eq('id', user.id)
            .single();

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
            
            // Save newly seeded state to DB
            const { error: insertError } = await supabase
              .from('portfolios')
              .upsert({
                id: user.id,
                state: initialStateWithProfile,
                updated_at: new Date().toISOString()
              });
            
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
      setLoading(false);
    }

    loadData();
  }, [user]);

  // 3. Save State (local & DB)
  const saveState = async (newState: AppState) => {
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
        }
      } catch (e) {
        console.error("Failed to sync portfolio to Supabase:", e);
      }
    }
  };

  const updateProfile = (profileUpdate: Partial<UserProfile>) => {
    saveState({ ...state, profile: { ...state.profile, ...profileUpdate } });
  };

  const addEv = (sid: number, sub: string, type: 'pdf' | 'img' | 'doc' | 'vid', name: string, url?: string) => {
    const k = `${sid}|${sub}`;
    const newEv = { ...state.ev };
    if (!newEv[k]) newEv[k] = [];
    newEv[k].push({
      type,
      name,
      url,
      date: new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
    });
    saveState({ ...state, ev: newEv });
  };

  const delEv = (sid: number, sub: string, i: number) => {
    const k = `${sid}|${sub}`;
    const newEv = { ...state.ev };
    if (newEv[k]) {
      newEv[k].splice(i, 1);
      saveState({ ...state, ev: newEv });
    }
  };

  const toggleStrat = (s: string) => {
    const newStrats = [...state.strats];
    const i = newStrats.indexOf(s);
    if (i >= 0) newStrats.splice(i, 1);
    else newStrats.push(s);
    saveState({ ...state, strats: newStrats });
  };

  const addStrat = (s: string) => {
     if (s) {
       saveState({ ...state, strats: [...state.strats, s] });
     }
  };

  const addSub = (sid: number, val: string) => {
    const newSubs = { ...state.csubs };
    if (!newSubs[sid]) newSubs[sid] = [];
    newSubs[sid].push(val);
    saveState({ ...state, csubs: newSubs });
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
    saveState({ ...state, csubs: newSubs, ev: newEv, notes: newNotes });
  };

  const updateNote = (k: string, val: string) => {
    saveState({ ...state, notes: { ...state.notes, [k]: val } });
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('w4');
    setState(defaultState);
  };

  // Called once the user has finished setting a new password via the recovery flow
  const clearPasswordRecovery = () => setPasswordRecovery(false);

  const markAnnouncementAsRead = (id: string) => {
    const read = state.readAnnouncements || [];
    if (!read.includes(id)) {
      const nextRead = [...read, id];
      saveState({
        ...state,
        readAnnouncements: nextRead
      });
    }
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
    toggleStrat,
    addSub,
    delSub,
    updateNote,
    addStrat,
    updateProfile,
    signOut,
    announcements,
    markAnnouncementAsRead,
    fetchAnnouncements
  };
}


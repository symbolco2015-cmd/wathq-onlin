import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { AppState, Evidence, UserProfile } from '../types';

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
  profile: defaultProfile
};

export function useAppStore() {
  const [state, setState] = useState<AppState>(defaultState);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  return { 
    state, 
    user, 
    loading, 
    addEv, 
    delEv, 
    toggleStrat, 
    addSub, 
    updateNote, 
    addStrat, 
    updateProfile, 
    signOut 
  };
}


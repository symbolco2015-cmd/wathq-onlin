import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import type { AppState, Announcement } from '../types';

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  name: string;
  role: string;
  school: string;
  avatar: string;
  yearsOfExperience: number;
  evidenceCount: number;
  strategiesCount: number;
  updated_at: string | null;
  is_banned?: boolean;
}

export interface PlatformStats {
  totalUsers: number;
  activeUsers: number;      // updated in last 30 days
  totalEvidence: number;
  avgEvidence: number;
  verifiedUsers: number;    // score >= 70
  newUsersThisWeek: number;
  schoolsDistribution: Record<string, number>;
  rolesDistribution: Record<string, number>;
  dailySignups: { date: string; count: number }[];
}

export function useAdminStore(isAdmin: boolean) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin || !supabase) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch all portfolios (admin RLS policy required in Supabase)
      const { data: portfolios, error: portfolioError } = await supabase
        .from('portfolios')
        .select('id, state, updated_at, created_at')
        .order('updated_at', { ascending: false });

      if (portfolioError) throw portfolioError;

      if (!portfolios) {
        setUsers([]);
        setStats(null);
        setLoading(false);
        return;
      }

      // Map portfolios to AdminUser objects
      const mapped: AdminUser[] = portfolios.map((p: any) => {
        const state: AppState = p.state || {};
        const profile = state.profile || {} as any;
        const ev = state.ev || {};
        const strats = state.strats || [];

        const evidenceCount = Object.values(ev).reduce(
          (sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        );

        return {
          id: p.id,
          email: profile.email || '',
          created_at: p.created_at || new Date().toISOString(),
          last_sign_in_at: p.updated_at || null,
          name: profile.name || 'غير محدد',
          role: profile.role || 'غير محدد',
          school: profile.school || 'غير محدد',
          avatar: profile.avatar || '',
          yearsOfExperience: profile.yearsOfExperience || 0,
          evidenceCount,
          strategiesCount: strats.length,
          updated_at: p.updated_at || null,
        };
      });

      setUsers(mapped);

      // Compute platform stats
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const activeUsers = mapped.filter(u => {
        if (!u.updated_at) return false;
        return new Date(u.updated_at) >= thirtyDaysAgo;
      }).length;

      const newUsersThisWeek = mapped.filter(u => {
        if (!u.created_at) return false;
        return new Date(u.created_at) >= sevenDaysAgo;
      }).length;

      const totalEvidence = mapped.reduce((s, u) => s + u.evidenceCount, 0);

      const verifiedUsers = mapped.filter(u => {
        // Simple score calculation: evidence >= 5 AND sections > 0 AND strategies >= 2
        return u.evidenceCount >= 5 && u.strategiesCount >= 2;
      }).length;

      // Schools distribution
      const schoolsDist: Record<string, number> = {};
      mapped.forEach(u => {
        const s = u.school || 'غير محدد';
        schoolsDist[s] = (schoolsDist[s] || 0) + 1;
      });

      // Roles distribution
      const rolesDist: Record<string, number> = {};
      mapped.forEach(u => {
        const r = u.role || 'غير محدد';
        rolesDist[r] = (rolesDist[r] || 0) + 1;
      });

      // Daily signups (last 7 days)
      const dailyMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        dailyMap[key] = 0;
      }
      mapped.forEach(u => {
        if (u.created_at) {
          const key = u.created_at.slice(0, 10);
          if (dailyMap[key] !== undefined) {
            dailyMap[key]++;
          }
        }
      });
      const dailySignups = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

      setStats({
        totalUsers: mapped.length,
        activeUsers,
        totalEvidence,
        avgEvidence: mapped.length > 0 ? Math.round(totalEvidence / mapped.length) : 0,
        verifiedUsers,
        newUsersThisWeek,
        schoolsDistribution: schoolsDist,
        rolesDistribution: rolesDist,
        dailySignups,
      });

    } catch (e: any) {
      console.error('Admin data load error:', e);
      setError(e?.message || 'حدث خطأ في تحميل بيانات الأدمن');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin, loadAdminData]);

  // Delete a user's portfolio (admin only)
  const deleteUserPortfolio = async (userId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { error } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.filter(u => u.id !== userId));
      return true;
    } catch (e: any) {
      console.error('Delete portfolio error:', e);
      return false;
    }
  };

  // Reset a user's portfolio data (keep profile, clear evidence/notes)
  const resetUserPortfolio = async (userId: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      // Fetch current state to preserve profile
      const { data, error: fetchError } = await supabase
        .from('portfolios')
        .select('state')
        .eq('id', userId)
        .single();
      if (fetchError) throw fetchError;

      const currentState = (data?.state || {}) as any;
      const resetState = {
        ...currentState,
        ev: {},
        csubs: {},
        notes: {},
        strats: ['الصف المقلوب', 'التعلم التعاوني', 'التعلم النشط'],
      };

      const { error } = await supabase
        .from('portfolios')
        .update({ state: resetState, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, evidenceCount: 0, strategiesCount: 3 } : u
      ));
      return true;
    } catch (e: any) {
      console.error('Reset portfolio error:', e);
      return false;
    }
  };

  // Export users list as CSV
  const exportCSV = (usersList: AdminUser[]) => {
    const headers = ['الاسم', 'البريد الإلكتروني', 'المسمى الوظيفي', 'جهة العمل', 'سنوات الخبرة', 'عدد الأدلة', 'الاستراتيجيات', 'آخر نشاط', 'تاريخ الانضمام'];
    const rows = usersList.map(u => [
      `"${u.name}"`,
      u.email,
      `"${u.role}"`,
      `"${u.school}"`,
      u.yearsOfExperience,
      u.evidenceCount,
      u.strategiesCount,
      u.updated_at ? u.updated_at.slice(0, 10) : '',
      u.created_at ? u.created_at.slice(0, 10) : '',
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wathq-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Get the public share URL for a user
  const getShareUrl = (userId: string): string => {
    return `${window.location.origin}${window.location.pathname}?share=${userId}`;
  };

  // Create a new announcement (admin only)
  const createAnnouncement = async (
    title: string,
    content: string,
    category: 'tech' | 'admin' | 'urgent',
    attachmentUrl?: string
  ): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase
        .from('announcements')
        .insert({
          title,
          content,
          category,
          attachment_url: attachmentUrl || null,
          created_by: currentUser?.id || null
        });
      if (insertError) throw insertError;
      return true;
    } catch (e) {
      console.error('Create announcement error:', e);
      return false;
    }
  };

  // Update an existing announcement (admin only)
  const updateAnnouncement = async (
    id: string,
    title: string,
    content: string,
    category: 'tech' | 'admin' | 'urgent',
    attachmentUrl?: string
  ): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('announcements')
        .update({
          title,
          content,
          category,
          attachment_url: attachmentUrl || null
        })
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Update announcement error:', e);
      return false;
    }
  };

  // Delete an announcement (admin only)
  const deleteAnnouncement = async (id: string): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Delete announcement error:', e);
      return false;
    }
  };

  // Create a new academic date (admin only)
  const createAcademicDate = async (
    title: string,
    date: string,
    hijriLabel?: string
  ): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase
        .from('academic_dates')
        .insert({
          title,
          date,
          hijri_label: hijriLabel || null,
          created_by: currentUser?.id || null
        });
      if (insertError) throw insertError;
      return true;
    } catch (e) {
      console.error('Create academic date error:', e);
      return false;
    }
  };

  // Update an existing academic date (admin only)
  const updateAcademicDate = async (
    id: string,
    title: string,
    date: string,
    hijriLabel?: string
  ): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('academic_dates')
        .update({
          title,
          date,
          hijri_label: hijriLabel || null
        })
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Update academic date error:', e);
      return false;
    }
  };

  // Delete an academic date (admin only)
  const deleteAcademicDate = async (id: string): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('academic_dates')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Delete academic date error:', e);
      return false;
    }
  };

  return {
    users,
    stats,
    loading,
    error,
    reload: loadAdminData,
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
  };
}

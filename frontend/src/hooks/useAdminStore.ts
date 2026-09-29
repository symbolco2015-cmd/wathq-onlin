import { useState, useEffect, useCallback } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import type { AppState, Announcement } from '../types';

// نتيجة إعادة تعيين ملف معلم أو حذفه عبر admin-portfolio-action
export type PortfolioActionResult =
  | { ok: true; storageErrors: number; authError?: string }
  | { ok: false; message: string };

const PORTFOLIO_ACTION_FALLBACK_MESSAGE = 'تعذّر تنفيذ العملية، حاول مجدداً';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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

export interface PortfolioFeatureOverride {
  portfolio_id: string;
  feature: string;
  enabled: boolean;
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

// صف من admin_list_users() — بيانات auth.users للأدمن فقط
interface AuthUserRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export function useAdminStore(isAdmin: boolean) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [featureOverrides, setFeatureOverrides] = useState<PortfolioFeatureOverride[]>([]);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin || !supabase) return;
    setLoading(true);
    setError(null);

    try {
      // الاستعلامات الأربعة مستقلة فتُشغَّل معاً. admin_list_users يُرجع البريد
      // وتاريخ الإنشاء وآخر دخول فعلي من auth.users — فشله لا يوقف اللوحة.
      const [
        { data: portfolios, error: portfolioError },
        { data: stratEvidenceRows, error: stratEvidenceError },
        { data: evidenceRows, error: evidenceError },
        { data: authUsers, error: authUsersError },
      ] = await Promise.all([
        // Fetch all portfolios (admin RLS policy required in Supabase)
        supabase
          .from('portfolios')
          .select('id, state, updated_at, created_at')
          .order('updated_at', { ascending: false }),
        // عدد الاستراتيجيات "المفعّلة" (strategiesCount) كان يُحسَب من
        // state.strats.length — مصفوفة نصية مهجورة تماماً بعد إعادة بناء قسم
        // الاستراتيجيات (14 سبتمبر 2026)، ستبقى صفراً دائماً لكل الحسابات
        // الجديدة إن اعتُمد عليها. الحساب الحقيقي الآن: عدد strategy_id المميّزة
        // ضمن أدلة القسم 4 (isStrat، رقمه ثابت 4 كما في Dashboard.tsx لبندي 5/10
        // — لا ثابت مسمّى بالمشروع لهذا) لكل portfolio_id، من جدول evidence مباشرة.
        supabase
          .from('evidence')
          .select('portfolio_id, strategy_id')
          .eq('section_id', 4)
          .not('strategy_id', 'is', null),
        // عدد الشواهد لكل معلم من جدول evidence مباشرة (عدد الصفوف لكل portfolio_id)
        supabase
          .from('evidence')
          .select('portfolio_id'),
        supabase.rpc('admin_list_users'),
      ]);

      if (portfolioError) throw portfolioError;
      if (stratEvidenceError) throw stratEvidenceError;
      if (evidenceError) throw evidenceError;

      const authUsersById = new Map<string, AuthUserRow>();
      if (authUsersError) {
        console.warn('[admin_list_users] تعذّر جلب بيانات الدخول، يُستخدم البديل:', authUsersError.message);
      } else {
        ((authUsers || []) as AuthUserRow[]).forEach(u => authUsersById.set(u.id, u));
      }

      if (!portfolios) {
        setUsers([]);
        setStats(null);
        setLoading(false);
        return;
      }

      const strategyIdsByPortfolio = new Map<string, Set<string>>();
      (stratEvidenceRows || []).forEach((row: any) => {
        const set = strategyIdsByPortfolio.get(row.portfolio_id) ?? new Set<string>();
        set.add(row.strategy_id);
        strategyIdsByPortfolio.set(row.portfolio_id, set);
      });
      const strategiesCountByPortfolio = new Map<string, number>(
        Array.from(strategyIdsByPortfolio.entries()).map(([id, set]) => [id, set.size])
      );

      const evidenceCountByPortfolio = new Map<string, number>();
      (evidenceRows || []).forEach((row: any) => {
        evidenceCountByPortfolio.set(row.portfolio_id, (evidenceCountByPortfolio.get(row.portfolio_id) ?? 0) + 1);
      });

      // Map portfolios to AdminUser objects
      const mapped: AdminUser[] = portfolios.map((p: any) => {
        const state: AppState = p.state || {};
        const profile = state.profile || {} as any;
        const evidenceCount = evidenceCountByPortfolio.get(p.id) ?? 0;
        const authUser = authUsersById.get(p.id);

        return {
          id: p.id,
          // البريد وتاريخ الإنشاء وآخر دخول من auth.users؛ البديل عند غيابها
          // هو السلوك السابق (profile.email و portfolios)
          email: authUser?.email || profile.email || '',
          created_at: authUser?.created_at || p.created_at || new Date().toISOString(),
          last_sign_in_at: authUser ? authUser.last_sign_in_at : (p.updated_at || null),
          name: profile.name || 'غير محدد',
          role: profile.role || 'غير محدد',
          school: profile.school || 'غير محدد',
          avatar: profile.avatar || '',
          yearsOfExperience: profile.yearsOfExperience || 0,
          evidenceCount,
          strategiesCount: strategiesCountByPortfolio.get(p.id) ?? 0,
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

  // Load feature flags + per-portfolio overrides (admin only)
  const loadFeatureFlags = useCallback(async () => {
    if (!isAdmin || !supabase) return;
    try {
      const [{ data: flags, error: flagsError }, { data: overrides, error: overridesError }] = await Promise.all([
        supabase.from('feature_flags').select('feature, enabled'),
        supabase.from('portfolio_feature_overrides').select('portfolio_id, feature, enabled'),
      ]);
      if (flagsError) throw flagsError;
      if (overridesError) throw overridesError;

      const flagsMap: Record<string, boolean> = {};
      (flags || []).forEach((f: any) => { flagsMap[f.feature] = f.enabled; });
      setFeatureFlags(flagsMap);
      setFeatureOverrides(overrides || []);
    } catch (e: any) {
      console.error('Load feature flags error:', e);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadFeatureFlags();
    }
  }, [isAdmin, loadFeatureFlags]);

  // تسجيل عملية أدمن في admin_audit_log بعد نجاحها. details للمعلومات
  // الأساسية فقط (لا محتوى كامل ولا بيانات شخصية). الفشل لا يُفشل العملية
  // الأصلية ولا يظهر للمستخدم — console.warn فقط.
  const logAdminAction = async (
    action: string,
    targetPortfolioId?: string,
    details: Record<string, unknown> = {}
  ): Promise<void> => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const adminId = session?.user?.id;
      if (!adminId) {
        console.warn('[admin_audit_log] لا يوجد مستخدم حالي، لم تُسجَّل العملية:', action);
        return;
      }
      const { error } = await supabase.from('admin_audit_log').insert({
        admin_id: adminId,
        action,
        target_portfolio_id: targetPortfolioId ?? null,
        details,
      });
      if (error) console.warn('[admin_audit_log] فشل التسجيل:', action, error.message);
    } catch (e) {
      console.warn('[admin_audit_log] فشل التسجيل:', action, e);
    }
  };

  // Set the platform-wide switch for a feature (admin only)
  const setGlobalFeatureFlag = async (featureKey: string, enabled: boolean): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('feature_flags')
        .upsert({ feature: featureKey, enabled, updated_at: new Date().toISOString() });
      if (error) throw error;
      setFeatureFlags(prev => ({ ...prev, [featureKey]: enabled }));
      void logAdminAction('feature.set', undefined, { feature: featureKey, enabled });
      return true;
    } catch (e) {
      console.error('Set global feature flag error:', e);
      return false;
    }
  };

  // Create/update a per-portfolio exception for a feature (admin only)
  const setPortfolioFeatureOverride = async (portfolioId: string, featureKey: string, enabled: boolean): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('portfolio_feature_overrides')
        .upsert({ portfolio_id: portfolioId, feature: featureKey, enabled, updated_at: new Date().toISOString() });
      if (error) throw error;
      setFeatureOverrides(prev => {
        const withoutExisting = prev.filter(o => !(o.portfolio_id === portfolioId && o.feature === featureKey));
        return [...withoutExisting, { portfolio_id: portfolioId, feature: featureKey, enabled }];
      });
      void logAdminAction('feature_override.set', portfolioId, { feature: featureKey, enabled });
      return true;
    } catch (e) {
      console.error('Set portfolio feature override error:', e);
      return false;
    }
  };

  // Remove a per-portfolio exception, falling back to the platform-wide switch (admin only)
  const removePortfolioFeatureOverride = async (portfolioId: string, featureKey: string): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('portfolio_feature_overrides')
        .delete()
        .eq('portfolio_id', portfolioId)
        .eq('feature', featureKey);
      if (error) throw error;
      setFeatureOverrides(prev => prev.filter(o => !(o.portfolio_id === portfolioId && o.feature === featureKey)));
      void logAdminAction('feature_override.remove', portfolioId, { feature: featureKey });
      return true;
    } catch (e) {
      console.error('Remove portfolio feature override error:', e);
      return false;
    }
  };

  // إعادة التعيين والحذف على الخادم (admin-portfolio-action): الصلاحية ومطابقة
  // الاسم وحذف الملفات والتسجيل في admin_audit_log كلها هناك، فلا logAdminAction هنا.
  const invokePortfolioAction = async (body: {
    portfolio_id: string;
    mode: 'reset' | 'delete';
    confirm_name: string;
    delete_auth?: boolean;
  }): Promise<PortfolioActionResult> => {
    if (!supabase) return { ok: false, message: PORTFOLIO_ACTION_FALLBACK_MESSAGE };
    try {
      const { data, error } = await supabase.functions.invoke('admin-portfolio-action', { body });
      if (error) {
        // الرد غير 2xx: error.context هو Response الأصلي، ورسالة الخادم العربية في جسمه
        if (error instanceof FunctionsHttpError) {
          const errBody: unknown = await error.context.json().catch(() => null);
          if (isRecord(errBody) && typeof errBody.message === 'string' && errBody.message) {
            return { ok: false, message: errBody.message };
          }
        }
        console.error(`[admin-portfolio-action] ${body.mode} error:`, error);
        return { ok: false, message: PORTFOLIO_ACTION_FALLBACK_MESSAGE };
      }
      if (!isRecord(data) || data.ok !== true) {
        return { ok: false, message: PORTFOLIO_ACTION_FALLBACK_MESSAGE };
      }
      const storageErrors = Array.isArray(data.storage_errors) ? data.storage_errors.length : 0;
      const authError = typeof data.auth_error === 'string' ? data.auth_error : undefined;
      await loadAdminData();
      return { ok: true, storageErrors, authError };
    } catch (e: unknown) {
      console.error(`[admin-portfolio-action] ${body.mode} error:`, e);
      return { ok: false, message: PORTFOLIO_ACTION_FALLBACK_MESSAGE };
    }
  };

  // Delete a user's portfolio (admin only)
  const deleteUserPortfolio = (userId: string, confirmName: string, deleteAuth: boolean): Promise<PortfolioActionResult> =>
    invokePortfolioAction({ portfolio_id: userId, mode: 'delete', confirm_name: confirmName, delete_auth: deleteAuth });

  // Reset a user's portfolio data (keep profile)
  const resetUserPortfolio = (userId: string, confirmName: string): Promise<PortfolioActionResult> =>
    invokePortfolioAction({ portfolio_id: userId, mode: 'reset', confirm_name: confirmName });

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
    // Hardcoded "/" — not window.location.pathname, which inherits whatever
    // path the admin happened to be on and produces a broken share link
    // (e.g. https://wathq.online/robots.txt?share=...).
    return `${window.location.origin}/?share=${userId}`;
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
      void logAdminAction('announcement.create', undefined, { title, category });
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
      void logAdminAction('announcement.update', undefined, { id, title, category });
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
      void logAdminAction('announcement.delete', undefined, { id });
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
    hijriLabel?: string,
    semesterBoundary?: 'start' | 'end' | null,
    semesterNumber?: 1 | 2 | 3 | null
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
          semester_boundary: semesterBoundary || null,
          semester_number: semesterNumber || null,
          created_by: currentUser?.id || null
        });
      if (insertError) throw insertError;
      void logAdminAction('academic_date.create', undefined, { title, date });
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
    hijriLabel?: string,
    semesterBoundary?: 'start' | 'end' | null,
    semesterNumber?: 1 | 2 | 3 | null
  ): Promise<boolean> => {
    if (!isAdmin || !supabase) return false;
    try {
      const { error } = await supabase
        .from('academic_dates')
        .update({
          title,
          date,
          hijri_label: hijriLabel || null,
          semester_boundary: semesterBoundary || null,
          semester_number: semesterNumber || null
        })
        .eq('id', id);
      if (error) throw error;
      void logAdminAction('academic_date.update', undefined, { id, title, date });
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
      void logAdminAction('academic_date.delete', undefined, { id });
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
    featureFlags,
    featureOverrides,
    setGlobalFeatureFlag,
    setPortfolioFeatureOverride,
    removePortfolioFeatureOverride,
  };
}

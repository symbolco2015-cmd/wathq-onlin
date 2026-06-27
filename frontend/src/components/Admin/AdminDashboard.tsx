import React, { useState, useMemo } from 'react';
import type { AdminUser, PlatformStats } from '../../hooks/useAdminStore';
import type { Announcement, AcademicDate } from '../../types';

/* ─────────────────────────────────────────────
   Stat Card
───────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color, delay = 0 }: {
  icon: string; label: string; value: string | number; sub?: string;
  color: string; delay?: number;
}) {
  return (
    <div
      className="stat-card"
      style={{ animationDelay: `${delay}ms`, '--card-color': color } as React.CSSProperties}
    >
      <div className="stat-icon">
        <i className={`ti ${icon}`} />
      </div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mini Bar Chart
───────────────────────────────────────────── */
function MiniBarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="mini-chart">
      {data.map((d, i) => {
        const pct = Math.max((d.count / max) * 100, d.count > 0 ? 8 : 3);
        const label = new Date(d.date).toLocaleDateString('ar-SA', { weekday: 'short' });
        return (
          <div key={i} className="mini-bar-wrap" title={`${label}: ${d.count} مستخدم`}>
            <div className="mini-bar" style={{ height: `${pct}%` }} />
            <span className="mini-bar-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Distribution Pills
───────────────────────────────────────────── */
function DistributionList({ data, title, limit = 5 }: {
  data: Record<string, number>; title: string; limit?: number;
}) {
  const sorted = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  return (
    <div className="dist-card">
      <div className="dist-title">{title}</div>
      <div className="dist-list">
        {sorted.map(([key, count], i) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={i} className="dist-item">
              <div className="dist-bar-bg">
                <div className="dist-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="dist-meta">
                <span className="dist-key" title={key}>{key}</span>
                <span className="dist-count">{count} <small>({pct}%)</small></span>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="dist-empty">لا توجد بيانات</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   User Row
───────────────────────────────────────────── */
function UserRow({ user, onView, idx }: {
  user: AdminUser; onView: (u: AdminUser) => void; idx: number;
}) {
  const lastActive = user.updated_at
    ? new Date(user.updated_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  const isActive = user.updated_at
    ? (Date.now() - new Date(user.updated_at).getTime()) < 30 * 24 * 60 * 60 * 1000
    : false;

  return (
    <tr className="user-row" style={{ animationDelay: `${idx * 30}ms` }}>
      <td className="td-avatar">
        <div className="user-av" style={user.avatar ? { backgroundImage: `url(${user.avatar})` } : {}}>
          {!user.avatar && user.name.substring(0, 2)}
        </div>
      </td>
      <td className="td-name">
        <div className="user-name">{user.name}</div>
        <div className="user-email">{user.email || '—'}</div>
      </td>
      <td className="td-role">
        <span className="role-badge">{user.role}</span>
      </td>
      <td className="td-school">
        <span className="school-text" title={user.school}>{user.school}</span>
      </td>
      <td className="td-ev">
        <div className="ev-count">
          <i className="ti ti-files" />
          {user.evidenceCount}
        </div>
      </td>
      <td className="td-strat">
        <div className="strat-count">
          <i className="ti ti-bulb" />
          {user.strategiesCount}
        </div>
      </td>
      <td className="td-status">
        <span className={`status-dot ${isActive ? 'active' : 'inactive'}`}>
          {isActive ? 'نشط' : 'غير نشط'}
        </span>
      </td>
      <td className="td-date">{lastActive}</td>
      <td className="td-actions">
        <button className="action-btn view-btn" onClick={() => onView(user)} title="عرض التفاصيل">
          <i className="ti ti-eye" />
        </button>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────
   User Detail Modal
───────────────────────────────────────────── */
function UserDetailModal({ user, onClose, onDelete, onReset, onToast, shareUrl }: {
  user: AdminUser;
  onClose: () => void;
  onDelete: (id: string) => Promise<boolean>;
  onReset: (id: string) => Promise<boolean>;
  onToast: (msg: string, icon?: string) => void;
  shareUrl: string;
}) {
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [inlineError, setInlineError] = useState('');

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      onToast('تم نسخ الرابط بنجاح 🔗', '🔗');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDelete = async () => {
    setInlineError('');
    setDeleting(true);
    try {
      const ok = await onDelete(user.id);
      if (ok) {
        onToast('تم حذف بيانات المستخدم نهائياً 🗑️', '🗑️');
        onClose();
      } else {
        setInlineError('✖ فشل الحذف — تأكد من تطبيق سياسة الحذف في Supabase RLS');
        setConfirmDelete(false);
      }
    } catch (e: any) {
      setInlineError(`خطأ: ${e?.message || 'حدث خطأ غير معروف'}`);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleReset = async () => {
    setInlineError('');
    setResetting(true);
    try {
      const ok = await onReset(user.id);
      if (ok) {
        onToast('تم إعادة تعيين بيانات المستخدم ✅', '✅');
        setConfirmReset(false);
        onClose();
      } else {
        setInlineError('✖ فشل إعادة التعيين — تأكد من تطبيق سياسة UPDATE في Supabase RLS');
        setConfirmReset(false);
      }
    } catch (e: any) {
      setInlineError(`خطأ: ${e?.message || 'حدث خطأ غير معروف'}`);
      setConfirmReset(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="user-modal">
        {/* Header */}
        <div className="umodal-header">
          <div className="umodal-av" style={user.avatar ? { backgroundImage: `url(${user.avatar})` } : {}}>
            {!user.avatar && user.name.substring(0, 2)}
          </div>
          <div>
            <div className="umodal-name">{user.name}</div>
            <div className="umodal-role">{user.role} — {user.school}</div>
            <div className="umodal-email">{user.email}</div>
          </div>
          <button className="umodal-close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        {/* Stats Row */}
        <div className="umodal-stats">
          <div className="umodal-stat">
            <i className="ti ti-files" />
            <span>{user.evidenceCount}</span>
            <small>أدلة</small>
          </div>
          <div className="umodal-stat">
            <i className="ti ti-bulb" />
            <span>{user.strategiesCount}</span>
            <small>استراتيجية</small>
          </div>
          <div className="umodal-stat">
            <i className="ti ti-calendar" />
            <span>{user.yearsOfExperience}</span>
            <small>سنوات خبرة</small>
          </div>
          <div className="umodal-stat">
            <i className="ti ti-id" />
            <span className="uid-text" title={user.id}>{user.id.slice(0, 8)}…</span>
            <small>المعرّف</small>
          </div>
        </div>

        {/* Info Grid */}
        <div className="umodal-grid">
          <div className="umodal-field">
            <label>تاريخ الانضمام</label>
            <span>{new Date(user.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <div className="umodal-field">
            <label>آخر تحديث</label>
            <span>{user.updated_at ? new Date(user.updated_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
          </div>
        </div>

        {/* Inline Error Banner */}
        {inlineError && (
          <div style={{
            margin: '0 24px 0',
            padding: '12px 16px',
            background: 'rgba(248,113,113,.1)',
            border: '1px solid rgba(248,113,113,.3)',
            borderRadius: '12px',
            fontSize: '13px',
            color: '#f87171',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            lineHeight: '1.5',
          }}>
            <i className="ti ti-alert-circle" style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }} />
            {inlineError}
          </div>
        )}

        {/* Actions */}
        <div className="umodal-actions">
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="umodal-btn primary-btn"
          >
            <i className="ti ti-external-link" /> عرض ملف الإنجاز
          </a>
          <button className="umodal-btn copy-btn" onClick={handleCopy}>
            <i className={`ti ${copied ? 'ti-check' : 'ti-copy'}`} />
            {copied ? 'تم النسخ!' : 'نسخ الرابط'}
          </button>

          {/* Reset Button */}
          {!confirmReset ? (
            <button className="umodal-btn warning-btn" onClick={() => { setConfirmReset(true); setConfirmDelete(false); }}>
              <i className="ti ti-refresh" /> إعادة تعيين
            </button>
          ) : (
            <button
              className="umodal-btn warning-btn confirm"
              onClick={handleReset}
              disabled={resetting}
            >
              <i className={`ti ${resetting ? 'ti-loader animate-spin' : 'ti-alert-triangle'}`} />
              {resetting ? 'جاري إعادة التعيين...' : 'تأكيد إعادة التعيين'}
            </button>
          )}

          {/* Delete Button */}
          {!confirmDelete ? (
            <button className="umodal-btn danger-btn" onClick={() => { setConfirmDelete(true); setConfirmReset(false); }}>
              <i className="ti ti-trash" /> حذف البيانات
            </button>
          ) : (
            <button
              className="umodal-btn danger-btn confirm"
              onClick={handleDelete}
              disabled={deleting}
            >
              <i className={`ti ${deleting ? 'ti-loader animate-spin' : 'ti-alert-triangle'}`} />
              {deleting ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main AdminDashboard
───────────────────────────────────────────── */
interface AdminDashboardProps {
  users: AdminUser[];
  stats: PlatformStats | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onDeleteUser: (id: string) => Promise<boolean>;
  onResetUser: (id: string) => Promise<boolean>;
  onExportCSV: (users: AdminUser[]) => void;
  onToast: (msg: string, icon?: string) => void;
  getShareUrl: (id: string) => string;
  onPublishAnnouncement?: (title: string, content: string, category: 'tech' | 'admin' | 'urgent', attachmentUrl?: string) => Promise<boolean>;
  onUpdateAnnouncement?: (id: string, title: string, content: string, category: 'tech' | 'admin' | 'urgent', attachmentUrl?: string) => Promise<boolean>;
  onDeleteAnnouncement?: (id: string) => Promise<boolean>;
  announcements?: Announcement[];
  onPublishAcademicDate?: (title: string, date: string, hijriLabel?: string) => Promise<boolean>;
  onUpdateAcademicDate?: (id: string, title: string, date: string, hijriLabel?: string) => Promise<boolean>;
  onDeleteAcademicDate?: (id: string) => Promise<boolean>;
  academicDates?: AcademicDate[];
}

export default function AdminDashboard({
  users, stats, loading, error, onReload, onDeleteUser, onResetUser, onExportCSV, onToast, getShareUrl, onPublishAnnouncement, onUpdateAnnouncement, onDeleteAnnouncement, announcements, onPublishAcademicDate, onUpdateAcademicDate, onDeleteAcademicDate, academicDates
}: AdminDashboardProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'evidenceCount' | 'updated_at' | 'created_at'>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'announcements' | 'academic-dates'>('users');

  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annCategory, setAnnCategory] = useState<'tech' | 'admin' | 'urgent'>('admin');
  const [annAttachmentUrl, setAnnAttachmentUrl] = useState('');
  const [publishingAnn, setPublishingAnn] = useState(false);
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);

  // Only real (DB) announcements are manageable — exclude the demo/placeholder ones
  const manageableAnnouncements = (announcements || []).filter(a => !String(a.id).startsWith('mock-'));
  const hasMockOnly = (announcements?.length || 0) > 0 && manageableAnnouncements.length === 0;

  const resetAnnForm = () => {
    setAnnTitle('');
    setAnnContent('');
    setAnnCategory('admin');
    setAnnAttachmentUrl('');
    setEditingAnnId(null);
  };

  const startEditAnnouncement = (ann: Announcement) => {
    setEditingAnnId(ann.id);
    setAnnTitle(ann.title);
    setAnnContent(ann.content);
    setAnnCategory(ann.category);
    setAnnAttachmentUrl(ann.attachment_url || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التعميم؟ سيتم إزالته من عند جميع المستخدمين فوراً.')) {
      return;
    }
    
    try {
      if (onDeleteAnnouncement) {
        const ok = await onDeleteAnnouncement(id);
        if (ok) {
          onToast('تم حذف التعميم بنجاح 🗑️', '🗑️');
        } else {
          onToast('فشل حذف التعميم. تأكد من صلاحيات الأدمن ❌', '❌');
        }
      } else {
        onToast('ميزة الحذف غير متوفرة في وضع التشغيل المحلي ⚠️', '⚠️');
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ أثناء محاولة الحذف ❌', '❌');
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) {
      onToast('يرجى ملء جميع الحقول المطلوبة ⚠️', '⚠️');
      return;
    }
    
    setPublishingAnn(true);
    try {
      if (editingAnnId) {
        // ── Edit mode ──
        if (onUpdateAnnouncement) {
          const ok = await onUpdateAnnouncement(editingAnnId, annTitle.trim(), annContent.trim(), annCategory, annAttachmentUrl.trim());
          if (ok) {
            onToast('تم تحديث التعميم بنجاح ✏️', '✏️');
            resetAnnForm();
          } else {
            onToast('فشل تحديث التعميم. تأكد من صلاحيات الأدمن ❌', '❌');
          }
        } else {
          onToast('ميزة التعديل غير متوفرة في وضع التشغيل المحلي ⚠️', '⚠️');
        }
      } else {
        // ── Create mode ──
        if (onPublishAnnouncement) {
          const ok = await onPublishAnnouncement(annTitle.trim(), annContent.trim(), annCategory, annAttachmentUrl.trim());
          if (ok) {
            onToast('تم نشر التعميم بنجاح لجميع المستخدمين 🚀', '🚀');
            resetAnnForm();
          } else {
            onToast('فشل نشر التعميم. تأكد من اتصالك وصلاحيات الأدمن ❌', '❌');
          }
        } else {
          onToast('ميزة النشر غير متوفرة في وضع التشغيل المحلي ⚠️', '⚠️');
        }
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ غير متوقع ❌', '❌');
    } finally {
      setPublishingAnn(false);
    }
  };

  const [adTitle, setAdTitle] = useState('');
  const [adDate, setAdDate] = useState('');
  const [adHijriLabel, setAdHijriLabel] = useState('');
  const [publishingAd, setPublishingAd] = useState(false);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);

  const sortedAcademicDates = useMemo(
    () => [...(academicDates || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [academicDates]
  );

  const resetAdForm = () => {
    setAdTitle('');
    setAdDate('');
    setAdHijriLabel('');
    setEditingAdId(null);
  };

  const startEditAcademicDate = (ad: AcademicDate) => {
    setEditingAdId(ad.id);
    setAdTitle(ad.title);
    setAdDate(ad.date);
    setAdHijriLabel(ad.hijri_label || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAcademicDate = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموعد الدراسي؟ سيتم إزالته من تذكيرات جميع المعلمين فوراً.')) {
      return;
    }

    try {
      if (onDeleteAcademicDate) {
        const ok = await onDeleteAcademicDate(id);
        if (ok) {
          onToast('تم حذف الموعد بنجاح 🗑️', '🗑️');
        } else {
          onToast('فشل حذف الموعد. تأكد من صلاحيات الأدمن ❌', '❌');
        }
      } else {
        onToast('ميزة الحذف غير متوفرة في وضع التشغيل المحلي ⚠️', '⚠️');
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ أثناء محاولة الحذف ❌', '❌');
    }
  };

  const handlePublishAcademicDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adTitle.trim() || !adDate.trim()) {
      onToast('يرجى ملء عنوان الموعد وتاريخه الميلادي ⚠️', '⚠️');
      return;
    }

    setPublishingAd(true);
    try {
      if (editingAdId) {
        if (onUpdateAcademicDate) {
          const ok = await onUpdateAcademicDate(editingAdId, adTitle.trim(), adDate, adHijriLabel.trim());
          if (ok) {
            onToast('تم تحديث الموعد بنجاح ✏️', '✏️');
            resetAdForm();
          } else {
            onToast('فشل تحديث الموعد. تأكد من صلاحيات الأدمن ❌', '❌');
          }
        } else {
          onToast('ميزة التعديل غير متوفرة في وضع التشغيل المحلي ⚠️', '⚠️');
        }
      } else {
        if (onPublishAcademicDate) {
          const ok = await onPublishAcademicDate(adTitle.trim(), adDate, adHijriLabel.trim());
          if (ok) {
            onToast('تمت إضافة الموعد الدراسي بنجاح 🚀', '🚀');
            resetAdForm();
          } else {
            onToast('فشلت إضافة الموعد. تأكد من اتصالك وصلاحيات الأدمن ❌', '❌');
          }
        } else {
          onToast('ميزة الإضافة غير متوفرة في وضع التشغيل المحلي ⚠️', '⚠️');
        }
      }
    } catch (err) {
      console.error(err);
      onToast('حدث خطأ غير متوقع ❌', '❌');
    } finally {
      setPublishingAd(false);
    }
  };

  const filteredUsers = useMemo(() => {
    let list = [...users];

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.school.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    }

    // Filter
    if (filterActive !== 'all') {
      const now = Date.now();
      const threshold = 30 * 24 * 60 * 60 * 1000;
      list = list.filter(u => {
        const isActive = u.updated_at
          ? (now - new Date(u.updated_at).getTime()) < threshold
          : false;
        return filterActive === 'active' ? isActive : !isActive;
      });
    }

    // Sort
    list.sort((a, b) => {
      let va: any = a[sortBy];
      let vb: any = b[sortBy];
      if (typeof va === 'string' && typeof vb === 'string') {
        if (sortBy === 'updated_at' || sortBy === 'created_at') {
          va = va ? new Date(va).getTime() : 0;
          vb = vb ? new Date(vb).getTime() : 0;
        } else {
          va = va.toLowerCase();
          vb = vb.toLowerCase();
        }
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [users, search, sortBy, sortDir, filterActive]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return <i className="ti ti-selector sort-icon neutral" />;
    return <i className={`ti ${sortDir === 'asc' ? 'ti-arrow-up' : 'ti-arrow-down'} sort-icon`} />;
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-loader">
          <i className="ti ti-shield-check" />
        </div>
        <div className="admin-loading-text">جاري تحميل بيانات الأدمن...</div>
        <div className="admin-loading-sub">الرجاء الانتظار</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-error">
        <i className="ti ti-alert-octagon" />
        <div className="admin-error-title">خطأ في تحميل البيانات</div>
        <div className="admin-error-msg">{error}</div>
        <div className="admin-error-hint">
          تأكد من إعداد جدول <code>admin_users</code> وسياسات RLS في Supabase.
        </div>
        <button className="admin-retry-btn" onClick={onReload}>
          <i className="ti ti-refresh" /> إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      {/* Page Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          <div className="admin-badge"><i className="ti ti-shield-check" /></div>
          <div>
            <h1 className="admin-title">لوحة تحكم الأدمن</h1>
            <p className="admin-subtitle">إدارة المستخدمين وإحصائيات المنصة</p>
          </div>
        </div>
        <button className="admin-reload-btn" onClick={onReload} title="تحديث البيانات">
          <i className="ti ti-refresh" />
          <span>تحديث</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <i className="ti ti-chart-bar" /> نظرة عامة
        </button>
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <i className="ti ti-users" /> المستخدمون
          <span className="tab-count">{users.length}</span>
        </button>
        <button
          className={`admin-tab ${activeTab === 'announcements' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcements')}
        >
          <i className="ti ti-speakerphone" /> نشر تعميم
        </button>
        <button
          className={`admin-tab ${activeTab === 'academic-dates' ? 'active' : ''}`}
          onClick={() => setActiveTab('academic-dates')}
        >
          <i className="ti ti-calendar-event" /> المواعيد الدراسية
          <span className="tab-count">{sortedAcademicDates.length}</span>
        </button>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && stats && (
        <div className="admin-overview">
          {/* Stats Grid */}
          <div className="stats-grid">
            <StatCard icon="ti-users" label="إجمالي المستخدمين" value={stats.totalUsers} sub="مسجّل في المنصة" color="#52c478" delay={0} />
            <StatCard icon="ti-activity" label="المستخدمون النشطون" value={stats.activeUsers} sub="آخر 30 يوماً" color="#38bdf8" delay={60} />
            <StatCard icon="ti-files" label="إجمالي الأدلة" value={stats.totalEvidence} sub={`معدل ${stats.avgEvidence} لكل مستخدم`} color="#a78bfa" delay={120} />
            <StatCard icon="ti-certificate" label="ملفات موثّقة" value={stats.verifiedUsers} sub="أدلة ≥ 5 واستراتيجيات ≥ 2" color="#fbbf24" delay={180} />
            <StatCard icon="ti-user-plus" label="انضم هذا الأسبوع" value={stats.newUsersThisWeek} sub="آخر 7 أيام" color="#f472b6" delay={240} />
          </div>

          {/* Chart + Distributions */}
          <div className="overview-bottom">
            {/* Signups Chart */}
            <div className="chart-card">
              <div className="chart-card-header">
                <i className="ti ti-chart-bar" />
                <span>التسجيلات (آخر 7 أيام)</span>
              </div>
              <MiniBarChart data={stats.dailySignups} />
            </div>

            {/* Distributions */}
            <DistributionList
              title="توزيع جهات العمل"
              data={stats.schoolsDistribution}
              limit={6}
            />
            <DistributionList
              title="توزيع المسميات الوظيفية"
              data={stats.rolesDistribution}
              limit={6}
            />
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'users' && (
        <div className="admin-users-tab">
          {/* Controls */}
          <div className="users-controls">
            <div className="search-wrap">
              <i className="ti ti-search search-ico" />
              <input
                type="text"
                placeholder="بحث بالاسم أو البريد أو المدرسة..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="admin-search"
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch('')}>
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
            <div className="filter-btns">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  className={`filter-btn ${filterActive === f ? 'active' : ''}`}
                  onClick={() => setFilterActive(f)}
                >
                  {f === 'all' ? 'الكل' : f === 'active' ? 'نشط' : 'غير نشط'}
                </button>
              ))}
            </div>
            <div className="results-count">
              {filteredUsers.length} من {users.length} مستخدم
            </div>
            <button
              className="export-btn"
              onClick={() => { onExportCSV(filteredUsers); onToast('تم تصدير الملف بنجاح 📄', '📄'); }}
              title="تصدير المستخدمين كملف CSV"
            >
              <i className="ti ti-file-spreadsheet" /> تصدير CSV
            </button>
          </div>

          {/* Table */}
          <div className="table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th className="th-av"></th>
                  <th className="th-sort" onClick={() => toggleSort('name')}>
                    الاسم <SortIcon col="name" />
                  </th>
                  <th>المسمى الوظيفي</th>
                  <th>جهة العمل</th>
                  <th className="th-sort" onClick={() => toggleSort('evidenceCount')}>
                    الأدلة <SortIcon col="evidenceCount" />
                  </th>
                  <th>الاستراتيجيات</th>
                  <th>الحالة</th>
                  <th className="th-sort" onClick={() => toggleSort('updated_at')}>
                    آخر نشاط <SortIcon col="updated_at" />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => (
                    <UserRow key={u.id} user={u} onView={setSelectedUser} idx={i} />
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div className="empty-state">
                <i className="ti ti-search-off" />
                <span>لا توجد نتائج مطابقة</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ANNOUNCEMENTS TAB ── */}
      {activeTab === 'announcements' && (
        <div className="admin-announcements-tab" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
          <div className="announcement-form-card">
            <div className="form-header">
              <i className={`ti ${editingAnnId ? 'ti-edit' : 'ti-speakerphone'}`} />
              <span>{editingAnnId ? 'تعديل التعميم' : 'نشر تعميم أو تحديث جديد للمستخدمين'}</span>
            </div>

            <form onSubmit={handlePublishAnnouncement} className="ann-form">
              <div className="form-group">
                <label>عنوان التعميم / التحديث</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تحديثات هامة بخصوص تعبئة ملف الإنجاز"
                  value={annTitle}
                  onChange={e => setAnnTitle(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>التصنيف</label>
                  <select
                    value={annCategory}
                    onChange={e => setAnnCategory(e.target.value as any)}
                    className="form-select"
                  >
                    <option value="admin">📄 تعميم إداري</option>
                    <option value="tech">⚙️ تحديث برمجي</option>
                    <option value="urgent">⚠️ تنبيه عاجل</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label>رابط مرفق (اختياري)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    value={annAttachmentUrl}
                    onChange={e => setAnnAttachmentUrl(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>محتوى التعميم</label>
                <textarea
                  required
                  rows={6}
                  placeholder="اكتب تفاصيل التعميم أو التحديث هنا بالتفصيل..."
                  value={annContent}
                  onChange={e => setAnnContent(e.target.value)}
                  className="form-textarea"
                />
              </div>

              <div className="ann-form-actions">
                <button
                  type="submit"
                  disabled={publishingAnn}
                  className="publish-submit-btn"
                >
                  {publishingAnn ? (
                    <>
                      <i className="ti ti-loader animate-spin" />
                      <span>{editingAnnId ? 'جاري حفظ التعديلات...' : 'جاري النشر...'}</span>
                    </>
                  ) : (
                    <>
                      <i className={`ti ${editingAnnId ? 'ti-device-floppy' : 'ti-send'}`} />
                      <span>{editingAnnId ? 'حفظ التعديلات' : 'نشر التعميم الآن'}</span>
                    </>
                  )}
                </button>
                {editingAnnId && (
                  <button
                    type="button"
                    onClick={resetAnnForm}
                    disabled={publishingAnn}
                    className="ann-cancel-btn"
                  >
                    <i className="ti ti-x" />
                    <span>إلغاء التعديل</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List of existing announcements */}
          <div className="announcements-manage-section" style={{ marginTop: '32px' }}>
            <div className="form-header" style={{ marginBottom: '16px' }}>
              <i className="ti ti-list" />
              <span>التعاميم المنشورة حالياً ({manageableAnnouncements.length})</span>
            </div>

            {manageableAnnouncements.length > 0 ? (
              <div className="ann-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {manageableAnnouncements.map((ann) => {
                  let catLabel = 'تحديث';
                  let catClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  if (ann.category === 'admin') {
                    catLabel = 'تعميم إداري';
                    catClass = 'bg-[var(--gold)]/10 text-[var(--gold)] border-[var(--gold)]/20';
                  } else if (ann.category === 'urgent') {
                    catLabel = 'تنبيه عاجل';
                    catClass = 'bg-red-500/10 text-red-400 border-red-500/20';
                  }

                  return (
                    <div
                      key={ann.id}
                      className="ann-manage-item"
                      style={{
                        background: editingAnnId === ann.id ? 'rgba(82,196,120,.08)' : 'rgba(255, 255, 255, 0.03)',
                        border: editingAnnId === ann.id ? '1px solid rgba(82,196,120,.4)' : '1px solid var(--line2)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[10px] font-bold border ${catClass}`}>
                            {catLabel}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text4)' }}>
                            {new Date(ann.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ann.title}</h4>
                        <p style={{ fontSize: '12px', color: 'var(--text3)', margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ann.content}</p>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            border: '1px solid rgba(82,196,120,.25)',
                            color: 'var(--em8)',
                            background: 'rgba(82,196,120,.06)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          title="تعديل التعميم"
                          onClick={() => startEditAnnouncement(ann)}
                        >
                          <i className="ti ti-edit" style={{ fontSize: '16px' }}></i>
                        </button>
                        <button
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            border: '1px solid rgba(248,113,113,.2)',
                            color: '#f87171',
                            background: 'rgba(248,113,113,.05)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          title="حذف التعميم"
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                        >
                          <i className="ti ti-trash" style={{ fontSize: '16px' }}></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed var(--line2)', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', color: 'var(--text4)' }}>
                <i className="ti ti-speakerphone" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.4 }}></i>
                <span>لا توجد تعاميم منشورة حالياً</span>
                {hasMockOnly && (
                  <p style={{ fontSize: '12px', color: 'var(--text4)', margin: '10px 0 0', lineHeight: 1.6, maxWidth: '420px' }}>
                    التعاميم الظاهرة للمستخدمين الآن هي <b>نماذج ترحيبية تجريبية</b> (غير قابلة للتعديل أو الحذف).
                    انشر تعميماً حقيقياً من الأعلى وسيحل محلها تلقائياً.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ACADEMIC DATES TAB ── */}
      {activeTab === 'academic-dates' && (
        <div className="admin-announcements-tab" style={{ animation: 'scaleIn .35s var(--sp) both' }}>
          <div className="announcement-form-card">
            <div className="form-header">
              <i className={`ti ${editingAdId ? 'ti-edit' : 'ti-calendar-event'}`} />
              <span>{editingAdId ? 'تعديل موعد دراسي' : 'إضافة موعد دراسي جديد'}</span>
            </div>

            <form onSubmit={handlePublishAcademicDate} className="ann-form">
              <div className="form-group">
                <label>عنوان الموعد</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: عودة المعلمين والمعلمات الممارسين للتدريس"
                  value={adTitle}
                  onChange={e => setAdTitle(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>التاريخ الميلادي</label>
                  <input
                    type="date"
                    required
                    value={adDate}
                    onChange={e => setAdDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group flex-1">
                  <label>التاريخ الهجري (للعرض فقط، اختياري)</label>
                  <input
                    type="text"
                    placeholder="مثال: ١٠ صفر ١٤٤٨ هـ"
                    value={adHijriLabel}
                    onChange={e => setAdHijriLabel(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="ann-form-actions">
                <button
                  type="submit"
                  disabled={publishingAd}
                  className="publish-submit-btn"
                >
                  {publishingAd ? (
                    <>
                      <i className="ti ti-loader animate-spin" />
                      <span>{editingAdId ? 'جاري حفظ التعديلات...' : 'جاري الإضافة...'}</span>
                    </>
                  ) : (
                    <>
                      <i className={`ti ${editingAdId ? 'ti-device-floppy' : 'ti-plus'}`} />
                      <span>{editingAdId ? 'حفظ التعديلات' : 'إضافة الموعد'}</span>
                    </>
                  )}
                </button>
                {editingAdId && (
                  <button
                    type="button"
                    onClick={resetAdForm}
                    disabled={publishingAd}
                    className="ann-cancel-btn"
                  >
                    <i className="ti ti-x" />
                    <span>إلغاء التعديل</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List of existing academic dates */}
          <div className="announcements-manage-section" style={{ marginTop: '32px' }}>
            <div className="form-header" style={{ marginBottom: '16px' }}>
              <i className="ti ti-list" />
              <span>المواعيد الدراسية المضافة حالياً ({sortedAcademicDates.length})</span>
            </div>

            {sortedAcademicDates.length > 0 ? (
              <div className="ann-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sortedAcademicDates.map((ad) => (
                  <div
                    key={ad.id}
                    className="ann-manage-item"
                    style={{
                      background: editingAdId === ad.id ? 'rgba(82,196,120,.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: editingAdId === ad.id ? '1px solid rgba(82,196,120,.4)' : '1px solid var(--line2)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md text-[10px] font-bold border bg-[var(--em7)]/10 text-[var(--em8)] border-[var(--em7)]/20">
                          {new Date(ad.date).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        {ad.hijri_label && (
                          <span style={{ fontSize: '11px', color: 'var(--text4)' }}>{ad.hijri_label}</span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.title}</h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(82,196,120,.25)',
                          color: 'var(--em8)',
                          background: 'rgba(82,196,120,.06)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        title="تعديل الموعد"
                        onClick={() => startEditAcademicDate(ad)}
                      >
                        <i className="ti ti-edit" style={{ fontSize: '16px' }}></i>
                      </button>
                      <button
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid rgba(248,113,113,.2)',
                          color: '#f87171',
                          background: 'rgba(248,113,113,.05)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        title="حذف الموعد"
                        onClick={() => handleDeleteAcademicDate(ad.id)}
                      >
                        <i className="ti ti-trash" style={{ fontSize: '16px' }}></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ background: 'rgba(255,255,255,.02)', border: '1px dashed var(--line2)', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', color: 'var(--text4)' }}>
                <i className="ti ti-calendar-event" style={{ fontSize: '24px', marginBottom: '8px', display: 'block', opacity: 0.4 }}></i>
                <span>لا توجد مواعيد دراسية مضافة حالياً</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDelete={async (id) => {
            const ok = await onDeleteUser(id);
            if (ok) setSelectedUser(null);
            return ok;
          }}
          onReset={async (id) => {
            const ok = await onResetUser(id);
            if (ok) setSelectedUser(null);
            return ok;
          }}
          onToast={onToast}
          shareUrl={getShareUrl(selectedUser.id)}
        />
      )}

      {/* Styles */}
      <style>{adminStyles}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CSS Styles
───────────────────────────────────────────── */
const adminStyles = `
/* ── Layout ── */
.admin-wrap {
  min-height: 100vh;
  padding: 32px 24px 80px;
  max-width: 1300px;
  margin: 0 auto;
  font-family: var(--font);
  direction: rtl;
}

/* ── Loading ── */
.admin-loading {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.admin-loader {
  width: 72px; height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--em3), var(--em6));
  display: flex; align-items: center; justify-content: center;
  font-size: 34px; color: white;
  animation: pulse 2s ease-in-out infinite;
  box-shadow: 0 0 0 1px rgba(82,196,120,.3), 0 16px 48px rgba(42,122,68,.4);
}
.admin-loading-text { font-size: 18px; font-weight: 800; color: white; }
.admin-loading-sub { font-size: 13px; color: var(--text4); }

/* ── Error ── */
.admin-error {
  min-height: 60vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; text-align: center; padding: 24px;
}
.admin-error > i { font-size: 48px; color: #f87171; }
.admin-error-title { font-size: 20px; font-weight: 800; color: white; }
.admin-error-msg { font-size: 14px; color: var(--text3); max-width: 400px; }
.admin-error-hint { font-size: 12px; color: var(--text4); background: rgba(255,255,255,.04); padding: 10px 16px; border-radius: 10px; border: 1px solid var(--line2); }
.admin-error-hint code { color: var(--em8); background: rgba(82,196,120,.1); padding: 2px 6px; border-radius: 4px; }
.admin-retry-btn {
  margin-top: 8px; padding: 10px 24px; border-radius: 12px;
  background: linear-gradient(135deg, var(--em4), var(--em7));
  color: white; font-size: 14px; font-weight: 700;
  border: none; cursor: pointer; display: flex; align-items: center; gap: 8px;
  transition: opacity .2s;
}
.admin-retry-btn:hover { opacity: .85; }

/* ── Header ── */
.admin-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 28px; gap: 16px; flex-wrap: wrap;
}
.admin-header-left { display: flex; align-items: center; gap: 16px; }
.admin-badge {
  width: 52px; height: 52px; border-radius: 16px;
  background: linear-gradient(135deg, var(--em3), var(--em6));
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; color: white;
  box-shadow: 0 0 0 1px rgba(82,196,120,.3), 0 8px 28px rgba(42,122,68,.4);
}
.admin-title { font-size: 26px; font-weight: 900; color: white; margin: 0; }
.admin-subtitle { font-size: 13px; color: var(--text4); margin: 0; }
.admin-reload-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px; border-radius: 12px;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--line2);
  color: var(--text2); font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all .2s; white-space: nowrap;
}
.admin-reload-btn:hover { background: rgba(82,196,120,.08); border-color: rgba(82,196,120,.3); color: var(--em8); }

/* ── Tabs ── */
.admin-tabs {
  display: flex; gap: 4px;
  background: rgba(255,255,255,.03);
  border: 1px solid var(--line2);
  border-radius: 14px; padding: 4px;
  margin-bottom: 28px; width: fit-content;
}
.admin-tab {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 20px; border-radius: 10px;
  border: none; cursor: pointer;
  font-size: 14px; font-weight: 600;
  color: var(--text3); background: transparent;
  transition: all .2s; font-family: var(--font);
}
.admin-tab.active {
  background: linear-gradient(135deg, var(--em3)/80%, var(--em6));
  color: white;
  box-shadow: 0 4px 14px rgba(42,122,68,.35);
}
.admin-tab:not(.active):hover { background: rgba(255,255,255,.05); color: var(--text1); }
.tab-count {
  background: rgba(82,196,120,.15);
  color: var(--em8); font-size: 12px; font-weight: 700;
  padding: 2px 8px; border-radius: 20px;
}
.admin-tab.active .tab-count { background: rgba(255,255,255,.2); color: white; }

/* ── Stats Grid ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}
.stat-card {
  display: flex; align-items: center; gap: 16px;
  padding: 20px; border-radius: 18px;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--line2);
  animation: scaleIn .4s var(--sp) both;
  transition: transform .2s, box-shadow .2s;
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(0,0,0,.3);
}
.stat-icon {
  width: 48px; height: 48px; border-radius: 14px; shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; background: color-mix(in srgb, var(--card-color) 15%, transparent);
  color: var(--card-color);
  border: 1px solid color-mix(in srgb, var(--card-color) 25%, transparent);
  flex-shrink: 0;
}
.stat-body { flex: 1; min-width: 0; }
.stat-value { font-size: 28px; font-weight: 900; color: white; line-height: 1; }
.stat-label { font-size: 12px; font-weight: 600; color: var(--text3); margin-top: 4px; }
.stat-sub { font-size: 11px; color: var(--text4); margin-top: 2px; }

/* ── Overview Bottom ── */
.overview-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
@media (max-width: 900px) { .overview-bottom { grid-template-columns: 1fr; } }

/* ── Chart Card ── */
.chart-card {
  background: rgba(255,255,255,.04);
  border: 1px solid var(--line2);
  border-radius: 18px; padding: 20px;
}
.chart-card-header {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 700; color: var(--text2);
  margin-bottom: 16px;
}
.chart-card-header i { color: var(--em8); font-size: 16px; }

.mini-chart {
  display: flex; align-items: flex-end; gap: 6px;
  height: 100px; padding-bottom: 20px; position: relative;
}
.mini-bar-wrap {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end; height: 100%;
}
.mini-bar {
  width: 100%; background: linear-gradient(to top, var(--em4), var(--em8));
  border-radius: 6px 6px 0 0; min-height: 3px;
  transition: height .6s var(--sp);
  box-shadow: 0 4px 12px rgba(82,196,120,.2);
}
.mini-bar-label {
  font-size: 10px; color: var(--text4);
  margin-top: 4px; white-space: nowrap; font-family: var(--font2);
}

/* ── Distribution Card ── */
.dist-card {
  background: rgba(255,255,255,.04);
  border: 1px solid var(--line2);
  border-radius: 18px; padding: 20px;
}
.dist-title {
  font-size: 14px; font-weight: 700; color: var(--text2); margin-bottom: 14px;
}
.dist-list { display: flex; flex-direction: column; gap: 10px; }
.dist-item { display: flex; flex-direction: column; gap: 4px; }
.dist-bar-bg {
  height: 5px; background: rgba(255,255,255,.07);
  border-radius: 99px; overflow: hidden;
}
.dist-bar-fill {
  height: 100%; background: linear-gradient(90deg, var(--em4), var(--em8));
  border-radius: 99px; transition: width .6s var(--sp);
}
.dist-meta { display: flex; justify-content: space-between; align-items: center; }
.dist-key {
  font-size: 12px; color: var(--text2); font-weight: 600;
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dist-count { font-size: 12px; color: var(--text4); }
.dist-count small { color: var(--text4); font-size: 10px; }
.dist-empty { font-size: 13px; color: var(--text4); text-align: center; padding: 16px; }

/* ── Users Tab ── */
.admin-users-tab { display: flex; flex-direction: column; gap: 16px; }
.users-controls {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.search-wrap {
  position: relative; flex: 1; min-width: 200px;
}
.search-ico {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  color: var(--text4); font-size: 16px; pointer-events: none;
}
.admin-search {
  width: 100%; padding: 10px 40px 10px 12px;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--line2); border-radius: 12px;
  color: white; font-size: 14px; font-family: var(--font);
  outline: none; transition: border-color .2s, background .2s;
}
.admin-search::placeholder { color: var(--text4); }
.admin-search:focus { border-color: rgba(82,196,120,.4); background: rgba(82,196,120,.04); }
.search-clear {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: var(--text4); cursor: pointer;
  font-size: 14px; padding: 4px;
}
.search-clear:hover { color: white; }
.filter-btns { display: flex; gap: 6px; }
.filter-btn {
  padding: 9px 16px; border-radius: 10px;
  background: rgba(255,255,255,.04); border: 1px solid var(--line2);
  color: var(--text3); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .2s; font-family: var(--font);
}
.filter-btn.active {
  background: rgba(82,196,120,.12); border-color: rgba(82,196,120,.3); color: var(--em8);
}
.filter-btn:not(.active):hover { background: rgba(255,255,255,.07); color: var(--text1); }
.results-count { font-size: 13px; color: var(--text4); white-space: nowrap; }

/* ── Table ── */
.table-wrap {
  background: rgba(255,255,255,.03);
  border: 1px solid var(--line2); border-radius: 18px;
  overflow: hidden; overflow-x: auto;
}
.users-table {
  width: 100%; border-collapse: collapse; min-width: 700px;
}
.users-table thead tr {
  background: rgba(255,255,255,.04);
  border-bottom: 1px solid var(--line2);
}
.users-table th {
  padding: 12px 14px; font-size: 12px; font-weight: 700;
  color: var(--text4); text-align: right; white-space: nowrap;
  font-family: var(--font);
}
.th-sort { cursor: pointer; user-select: none; }
.th-sort:hover { color: var(--text2); }
.th-av { width: 52px; }
.sort-icon { font-size: 13px; margin-right: 4px; }
.sort-icon.neutral { color: var(--text4); opacity: .5; }

.user-row {
  border-bottom: 1px solid var(--line2)/50%;
  animation: fadeIn .3s var(--sp) both;
  transition: background .15s;
}
.user-row:last-child { border-bottom: none; }
.user-row:hover { background: rgba(255,255,255,.03); }
.users-table td { padding: 12px 14px; vertical-align: middle; }

.td-avatar { width: 52px; }
.user-av {
  width: 38px; height: 38px; border-radius: 12px;
  background: linear-gradient(135deg, var(--em4), var(--em7));
  color: white; font-size: 13px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  background-size: cover; background-position: center;
  flex-shrink: 0;
}
.user-name { font-size: 14px; font-weight: 700; color: white; }
.user-email { font-size: 11px; color: var(--text4); margin-top: 2px; direction: ltr; }
.role-badge {
  font-size: 12px; font-weight: 600; color: var(--text2);
  background: rgba(255,255,255,.06); padding: 3px 10px; border-radius: 20px;
  border: 1px solid var(--line2); white-space: nowrap;
}
.school-text {
  font-size: 12px; color: var(--text3);
  max-width: 140px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; display: block;
}
.ev-count, .strat-count {
  display: flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 700; color: var(--text2);
}
.ev-count i { color: #a78bfa; }
.strat-count i { color: #fbbf24; }
.status-dot {
  font-size: 12px; font-weight: 700; padding: 3px 10px;
  border-radius: 20px; white-space: nowrap;
}
.status-dot.active { background: rgba(52,211,153,.12); color: #34d399; border: 1px solid rgba(52,211,153,.25); }
.status-dot.inactive { background: rgba(255,255,255,.05); color: var(--text4); border: 1px solid var(--line2); }
.td-date { font-size: 12px; color: var(--text4); white-space: nowrap; }
.action-btn {
  width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--line2);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .2s; background: transparent; font-size: 15px;
}
.view-btn { color: var(--em8); }
.view-btn:hover { background: rgba(82,196,120,.12); border-color: rgba(82,196,120,.3); }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; padding: 48px; color: var(--text4); font-size: 15px;
}
.empty-state i { font-size: 36px; opacity: .5; }

/* ── User Detail Modal ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,.7); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px; animation: fadeIn .2s ease both;
}
.user-modal {
  background: #0d1f14; border: 1px solid var(--line);
  border-radius: 24px; width: 100%; max-width: 520px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(82,196,120,.1);
  animation: scaleIn .3s var(--sp) both;
}
.umodal-header {
  display: flex; align-items: center; gap: 16px;
  padding: 24px; border-bottom: 1px solid var(--line2);
  background: rgba(82,196,120,.04); position: relative;
}
.umodal-av {
  width: 60px; height: 60px; border-radius: 18px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--em4), var(--em7));
  color: white; font-size: 20px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  background-size: cover; background-position: center;
  box-shadow: 0 0 0 2px rgba(82,196,120,.25);
}
.umodal-name { font-size: 18px; font-weight: 800; color: white; }
.umodal-role { font-size: 13px; color: var(--text3); margin-top: 2px; }
.umodal-email { font-size: 12px; color: var(--text4); margin-top: 2px; direction: ltr; }
.umodal-close {
  position: absolute; left: 16px; top: 16px;
  width: 32px; height: 32px; border-radius: 10px;
  background: rgba(255,255,255,.06); border: 1px solid var(--line2);
  color: var(--text3); cursor: pointer; font-size: 15px;
  display: flex; align-items: center; justify-content: center;
  transition: all .2s;
}
.umodal-close:hover { background: rgba(255,255,255,.1); color: white; }

.umodal-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--line2);
}
.umodal-stat {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 16px 8px; border-left: 1px solid var(--line2); text-align: center;
}
.umodal-stat:last-child { border-left: none; }
.umodal-stat i { font-size: 18px; color: var(--em8); }
.umodal-stat span { font-size: 20px; font-weight: 800; color: white; line-height: 1; }
.umodal-stat span.uid-text { font-size: 13px; font-family: monospace; direction: ltr; }
.umodal-stat small { font-size: 11px; color: var(--text4); }

.umodal-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 0; padding: 16px 24px;
  border-bottom: 1px solid var(--line2);
}
.umodal-field { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
.umodal-field label { font-size: 11px; color: var(--text4); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.umodal-field span { font-size: 13px; color: var(--text2); font-weight: 600; }

.umodal-actions {
  display: flex; gap: 10px; padding: 20px 24px; flex-wrap: wrap;
}
.umodal-btn {
  flex: 1; min-width: 120px; padding: 11px 16px; border-radius: 12px;
  border: none; cursor: pointer; font-size: 13px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  transition: all .2s; font-family: var(--font); text-decoration: none;
}
.primary-btn {
  background: linear-gradient(135deg, var(--em4), var(--em7)); color: white;
}
.primary-btn:hover { opacity: .85; transform: translateY(-1px); }
.copy-btn {
  background: rgba(255,255,255,.06); color: var(--text2);
  border: 1px solid var(--line2) !important;
}
.copy-btn:hover { background: rgba(255,255,255,.1); color: white; }
.danger-btn {
  background: rgba(248,113,113,.08); color: #f87171;
  border: 1px solid rgba(248,113,113,.2) !important;
}
.danger-btn:hover { background: rgba(248,113,113,.15); }
.danger-btn.confirm { background: rgba(248,113,113,.2); border-color: rgba(248,113,113,.4) !important; }
.warning-btn {
  background: rgba(251,191,36,.08); color: #fbbf24;
  border: 1px solid rgba(251,191,36,.2) !important;
}
.warning-btn:hover { background: rgba(251,191,36,.15); }
.warning-btn.confirm { background: rgba(251,191,36,.2); border-color: rgba(251,191,36,.4) !important; color: #f59e0b; }

.export-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 16px; border-radius: 10px;
  background: rgba(52,211,153,.08); color: #34d399;
  border: 1px solid rgba(52,211,153,.2);
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .2s; font-family: var(--font);
  white-space: nowrap;
}
.export-btn:hover { background: rgba(52,211,153,.15); border-color: rgba(52,211,153,.35); }

@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes scaleIn { from { opacity:0; transform:scale(.95) } to { opacity:1; transform:scale(1) } }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
@keyframes spin { to { transform: rotate(360deg) } }
.animate-spin { animation: spin 1s linear infinite; }

/* ── Announcements Form Tab ── */
.admin-announcements-tab {
  animation: scaleIn .35s var(--sp) both;
  max-width: 720px;
  margin: 0 auto;
}
.announcement-form-card {
  background: rgba(255,255,255,.04);
  border: 1px solid var(--line2);
  border-radius: 20px;
  padding: 24px;
}
.form-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 800;
  color: white;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--line2);
  padding-bottom: 16px;
}
.form-header i {
  color: var(--em8);
  font-size: 20px;
}
.ann-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-group label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text2);
}
.form-row {
  display: flex;
  gap: 16px;
}
@media (max-width: 600px) {
  .form-row {
    flex-direction: column;
  }
}
.form-input, .form-select, .form-textarea {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--line2);
  border-radius: 12px;
  color: white;
  font-size: 14px;
  font-family: var(--font);
  outline: none;
  transition: all .2s;
  box-sizing: border-box;
}
.form-select option {
  background: #0d1f14;
  color: white;
}
.form-input:focus, .form-select:focus, .form-textarea:focus {
  border-color: rgba(82,196,120,.4);
  background: rgba(82,196,120,.04);
  box-shadow: 0 0 0 3px rgba(82,196,120,.1);
}
.ann-form-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.publish-submit-btn {
  flex: 1;
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--em4), var(--em7));
  color: white;
  font-size: 14px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity .2s, transform .2s;
  font-family: var(--font);
}
.ann-cancel-btn {
  padding: 14px 20px;
  border-radius: 12px;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--line2);
  color: var(--text3);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all .2s;
  font-family: var(--font);
  white-space: nowrap;
}
.ann-cancel-btn:hover { background: rgba(255,255,255,.1); color: white; }
.ann-cancel-btn:disabled { opacity: .5; cursor: not-allowed; }
.publish-submit-btn:hover {
  opacity: .9;
  transform: translateY(-1px);
}
.publish-submit-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}
`;

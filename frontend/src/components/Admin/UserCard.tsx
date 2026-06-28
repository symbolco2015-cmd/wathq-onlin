import { useState } from 'react';
import type { AdminUser } from '../../hooks/useAdminStore';

// عتبة "فيه نشاط فعلي" — نفس القيمة المستخدمة في عرض الجدول (UserRow) لإبراز
// نفس الصف بلون التمييز البرتقالي عند توسيع البطاقة. أي دليل واحد فأكثر يستحق
// التمييز، لذا العتبة 1 لا تتطلب رقماً "مرتفعاً" فعلياً.
const HIGH_EVIDENCE_THRESHOLD = 1;

/**
 * بطاقة مستخدم لعرض الجوال فقط (md:hidden) — تستبدل صفوف الجدول الأفقي
 * بنفس بيانات `filteredUsers` المشتركة مع الجدول، بدون تكرار منطق
 * الجلب/الفلترة/الترتيب.
 *
 * كل بطاقة تدير حالة الطوي/التوسيع (expanded) محلياً ومستقلة عن البطاقات
 * الأخرى — هذا أبسط من تنسيق "بطاقة مفتوحة واحدة" في المكوّن الأب، والنتيجة
 * المقصودة: يمكن فتح أكثر من بطاقة بنفس الوقت.
 */
export default function UserCard({ user, onView }: {
  user: AdminUser;
  onView: (u: AdminUser) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const lastActive = user.updated_at
    ? new Date(user.updated_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  const isActive = user.updated_at
    ? (Date.now() - new Date(user.updated_at).getTime()) < 30 * 24 * 60 * 60 * 1000
    : false;

  const isHighEvidence = user.evidenceCount >= HIGH_EVIDENCE_THRESHOLD;

  return (
    <div className={`user-card ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="user-card-head"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <div className="user-av" style={user.avatar ? { backgroundImage: `url(${user.avatar})` } : {}}>
          {!user.avatar && user.name.substring(0, 2)}
        </div>
        <span className="user-card-name">{user.name}</span>
        <i className={`ti ti-chevron-down user-card-chevron ${expanded ? 'open' : ''}`} />
      </button>

      {expanded && (
        <div className="user-card-body">
          <div className="ucard-row">
            <span className="ucard-label">البريد</span>
            <span className="ucard-value" dir="ltr">{user.email || '—'}</span>
          </div>
          <div className="ucard-row">
            <span className="ucard-label">المسمى الوظيفي</span>
            <span className="role-badge">{user.role}</span>
          </div>
          <div className="ucard-row">
            <span className="ucard-label">جهة العمل</span>
            <span className="ucard-value" title={user.school}>{user.school}</span>
          </div>
          <div className="ucard-row">
            <span className="ucard-label">الحالة</span>
            <span className={`status-dot ${isActive ? 'active' : 'inactive'}`}>
              {isActive ? 'نشط' : 'غير نشط'}
            </span>
          </div>
          <div className="ucard-row">
            <span className="ucard-label">الأدلة</span>
            <div className={`ev-count${isHighEvidence ? ' ev-count-high' : ''}`}>
              <i className="ti ti-files" />
              {user.evidenceCount}
            </div>
          </div>
          <div className="ucard-row">
            <span className="ucard-label">الاستراتيجيات</span>
            <div className="strat-count">
              <i className="ti ti-bulb" />
              {user.strategiesCount}
            </div>
          </div>
          <div className="ucard-row">
            <span className="ucard-label">آخر نشاط</span>
            <span className="ucard-value">{lastActive}</span>
          </div>

          <button
            type="button"
            className="action-btn view-btn ucard-manage"
            onClick={() => onView(user)}
          >
            <i className="ti ti-eye" /> عرض التفاصيل الكاملة
          </button>
        </div>
      )}
    </div>
  );
}

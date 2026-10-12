import { useState } from 'react';
import type { AdminUser } from '../../hooks/useAdminStore';
import { formatDate } from '../../utils';
import { BTN_2ND } from '../formStyles';

// عتبة "فيه نشاط فعلي" — أي دليل أو استراتيجية واحدة فأكثر يُبرز رقمها بـ --t1،
// والصفر يبقى خافتاً بـ --t3. مشتركة بين البطاقة وصف الجدول (UserRow).
const HIGH_EVIDENCE_THRESHOLD = 1;

/** نشط = حدّث ملفه خلال آخر 30 يوماً */
export const isUserActive = (user: AdminUser): boolean =>
  user.updated_at
    ? (Date.now() - new Date(user.updated_at).getTime()) < 30 * 24 * 60 * 60 * 1000
    : false;

/** الصورة الشخصية، أو أول حرفين من الاسم على --s2 */
export function UserAvatar({ user, size = 'md' }: { user: AdminUser; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-14 h-14 text-[length:var(--fs-lg)]' : 'w-9 h-9 text-[length:var(--fs-xs)]';
  return (
    <div
      className={`${dims} shrink-0 rounded-[var(--r-full)] bg-[var(--s2)] border border-[var(--bd)] bg-cover bg-center flex items-center justify-center font-bold text-[var(--t2)]`}
      style={user.avatar ? { backgroundImage: `url(${user.avatar})` } : {}}
    >
      {!user.avatar && user.name.substring(0, 2)}
    </div>
  );
}

/** حالة النشاط: نقطة مع نص دائماً — لا معنى باللون وحده */
export function ActiveStatus({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-[length:var(--fs-xs)] font-bold ${active ? 'text-[var(--t1)]' : 'text-[var(--t3)]'}`}>
      <span className={`w-2 h-2 shrink-0 rounded-[var(--r-full)] ${active ? 'bg-[var(--accent)]' : 'bg-[var(--idle)]'}`} aria-hidden="true" />
      {active ? 'نشط' : 'غير نشط'}
    </span>
  );
}

/** عدد الأدلة أو الاستراتيجيات بأيقونة محايدة */
export function CountBadge({ icon, count }: { icon: string; count: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[length:var(--fs-sm)] font-bold ${count >= HIGH_EVIDENCE_THRESHOLD ? 'text-[var(--t1)]' : 'text-[var(--t3)]'}`}>
      <i className={`ti ${icon} text-[var(--t3)]`} />
      {count}
    </span>
  );
}

const ROW = 'flex items-center justify-between gap-3';
const ROW_LABEL = 'shrink-0 text-[length:var(--fs-xs)] text-[var(--t3)]';
const ROW_VALUE = 'min-w-0 truncate text-left text-[length:var(--fs-sm)] text-[var(--t2)]';

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
    ? formatDate(user.updated_at, 'long')
    : '—';

  return (
    <div className="bg-[var(--s1)] border border-[var(--bd)] rounded-[var(--r-md)] overflow-hidden">
      <button
        type="button"
        className="w-full min-h-14 flex items-center gap-3 p-3 bg-transparent border-0 text-right cursor-pointer"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <UserAvatar user={user} />
        <span className="flex-1 min-w-0 truncate text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{user.name}</span>
        <i className={`ti ti-chevron-down shrink-0 text-[length:var(--fs-md)] text-[var(--t3)] transition-transform duration-[250ms] ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 px-3 pt-3 pb-3 border-t border-[var(--bd)]">
          <div className={ROW}>
            <span className={ROW_LABEL}>البريد</span>
            <span className={ROW_VALUE} dir="ltr">{user.email || '—'}</span>
          </div>
          <div className={ROW}>
            <span className={ROW_LABEL}>المسمى الوظيفي</span>
            <span className="min-w-0 truncate inline-flex items-center rounded-[var(--r-full)] bg-[var(--s2)] border border-[var(--bd)] px-2 py-0.5 text-[length:var(--fs-xs)] font-bold text-[var(--t2)]">{user.role}</span>
          </div>
          <div className={ROW}>
            <span className={ROW_LABEL}>جهة العمل</span>
            <span className={ROW_VALUE} title={user.school}>{user.school}</span>
          </div>
          <div className={ROW}>
            <span className={ROW_LABEL}>الحالة</span>
            <ActiveStatus active={isUserActive(user)} />
          </div>
          <div className={ROW}>
            <span className={ROW_LABEL}>الأدلة</span>
            <CountBadge icon="ti-files" count={user.evidenceCount} />
          </div>
          <div className={ROW}>
            <span className={ROW_LABEL}>الاستراتيجيات</span>
            <CountBadge icon="ti-bulb" count={user.strategiesCount} />
          </div>
          <div className={ROW}>
            <span className={ROW_LABEL}>آخر نشاط</span>
            <span className={ROW_VALUE}>{lastActive}</span>
          </div>

          <button
            type="button"
            className={`${BTN_2ND} w-full mt-1 border-[var(--bd2)] text-[var(--t1)] cursor-pointer hover:bg-[var(--s2)]`}
            onClick={() => onView(user)}
          >
            <i className="ti ti-eye" /> عرض التفاصيل الكاملة
          </button>
        </div>
      )}
    </div>
  );
}

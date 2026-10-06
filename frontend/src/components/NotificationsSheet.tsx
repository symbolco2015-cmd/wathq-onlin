import { useEffect, useState } from 'react';
import type { Announcement } from '../types';
import { formatDate } from '../utils';
import NavPanel from './NavPanel';
import { BTN_PRI_SM } from './SectionView';

/** عنصر واحد في قائمة الجرس — يبنيه Dashboard من التعاميم والتذكيرات وحالة الملخص */
export type NotificationItem =
  // معلّق: لا يُعلَّم مقروءاً أبداً، ويبقى في الشارة حتى يصير عدده صفراً
  | { key: string; kind: 'pending'; count: number; unread: false }
  | { key: string; kind: 'announcement'; announcement: Announcement; unread: boolean }
  | { key: string; kind: 'reminder'; icon: string; title: string; subtitle: string; unread: boolean }
  | { key: string; kind: 'summary'; unread: boolean };

type NotificationsSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  items: NotificationItem[];
  /** مفاتيح ما كان غير مقروء لحظة فتح اللوحة — تبقى نقاطها ظاهرة حتى الإغلاق */
  unreadAtOpen: ReadonlySet<string>;
  onOpenSummary: () => void;
  onOpenBulkReview: () => void;
};

const CATEGORY_META: Record<string, { icon: string; color: string; label: string }> = {
  urgent: { icon: 'ti-alert-triangle', color: 'text-[var(--danger)]', label: 'تنبيه عاجل' },
  admin: { icon: 'ti-speakerphone', color: 'text-[var(--info)]', label: 'تعميم إداري' },
  tech: { icon: 'ti-tool', color: 'text-[var(--t2)]', label: 'تحديث تقني' },
};
const CATEGORY_FALLBACK = { icon: 'ti-bell', color: 'text-[var(--t2)]', label: 'تعميم' };

const ROW = 'w-full min-h-11 flex items-start gap-3 p-2 rounded-[var(--r-sm)] text-right';

function IconBox({ icon, color, unread }: { icon: string; color: string; unread: boolean }) {
  return (
    <span className={`h-9 w-9 shrink-0 rounded-[var(--r-sm)] flex items-center justify-center text-[20px] ${color} ${unread ? 'bg-[var(--s3)]' : 'bg-[var(--s2)]'}`}>
      <i className={`ti ${icon}`} />
    </span>
  );
}

function UnreadDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="h-2 w-2 mt-2 shrink-0 rounded-full bg-[var(--accent)]" aria-label="جديد" />;
}

/** لوحة الإشعارات (الجرس): ورقة سفلية في الجوال، ولوحة منسدلة تحت الشريط فيما عداه */
export default function NotificationsSheet({ isOpen, onClose, items, unreadAtOpen, onOpenSummary, onOpenBulkReview }: NotificationsSheetProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setExpandedId(null);
  }, [isOpen]);

  const list = items.length === 0 ? (
    <div className="flex flex-col items-center gap-2 py-8">
      <i className="ti ti-bell-off text-[32px] text-[var(--t3)]" />
      <span className="text-[length:var(--fs-sm)] text-[var(--t2)]">لا إشعارات</span>
    </div>
  ) : (
    <div className="flex flex-col gap-1">
      {items.map(item => {
        const dot = item.unread || unreadAtOpen.has(item.key);
        const rowBg = dot ? 'bg-[var(--s2)]' : '';

        // خلفية دائمة لأنه غير مكتمل، وبلا نقطة «جديد»
        if (item.kind === 'pending') {
          return (
            <div key={item.key} className="w-full min-h-11 flex items-center gap-3 p-2 rounded-[var(--r-sm)] text-right bg-[var(--s2)]">
              <IconBox icon="ti-photo-check" color="text-[var(--warn)]" unread />
              <span className="flex-1 min-w-0">
                <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{item.count} ملف من الاستيراد الجماعي جاهز للمراجعة</span>
                <span className="block text-[length:var(--fs-xs)] text-[var(--t3)]">استيراد جماعي</span>
              </span>
              <button type="button" onClick={onOpenBulkReview} className={`${BTN_PRI_SM} shrink-0`}>
                مراجعة الآن
              </button>
            </div>
          );
        }

        if (item.kind === 'announcement') {
          const ann = item.announcement;
          const meta = CATEGORY_META[ann.category] ?? CATEGORY_FALLBACK;
          const expanded = expandedId === ann.id;
          return (
            <div key={item.key} className={`rounded-[var(--r-sm)] ${rowBg}`}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : ann.id)}
                className={`${ROW} cursor-pointer hover:bg-[var(--s2)]`}
              >
                <IconBox icon={meta.icon} color={meta.color} unread={dot} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)] min-w-0">{ann.title}</span>
                    {ann.category === 'urgent' && (
                      <span className="shrink-0 text-[length:var(--fs-xs)] font-bold text-[var(--danger)]">عاجل</span>
                    )}
                  </span>
                  <span className="block text-[length:var(--fs-xs)] text-[var(--t3)]">
                    {meta.label} · {formatDate(ann.created_at, 'dayMonth')}
                  </span>
                </span>
                <UnreadDot show={dot} />
              </button>
              {expanded && (
                <div className="px-2 pb-3 flex flex-col items-start gap-3">
                  <p className="text-[length:var(--fs-sm)] text-[var(--t2)] whitespace-pre-wrap">{ann.content}</p>
                  {ann.attachment_url && (
                    <a
                      href={ann.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-[length:var(--fs-sm)] font-bold text-[var(--accent)] no-underline hover:underline"
                    >
                      <i className="ti ti-paperclip text-[16px]" /> تحميل الملف المرفق
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        }

        if (item.kind === 'summary') {
          return (
            <button
              key={item.key}
              type="button"
              onClick={onOpenSummary}
              className={`${ROW} ${rowBg} cursor-pointer hover:bg-[var(--s2)]`}
            >
              <IconBox icon="ti-sparkles" color="text-[var(--t2)]" unread={dot} />
              <span className="flex-1 min-w-0">
                <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">ملخصك العام يحتاج تحديثاً</span>
                <span className="block text-[length:var(--fs-xs)] text-[var(--t3)]">حدّثه من «أدوات»</span>
              </span>
              <UnreadDot show={dot} />
            </button>
          );
        }

        return (
          <div key={item.key} className={`${ROW} ${rowBg}`}>
            <IconBox icon={item.icon} color="text-[var(--t2)]" unread={dot} />
            <span className="flex-1 min-w-0">
              <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--t1)]">{item.title}</span>
              <span className="block text-[length:var(--fs-xs)] text-[var(--t3)]">{item.subtitle}</span>
            </span>
            <UnreadDot show={dot} />
          </div>
        );
      })}
    </div>
  );

  return (
    <NavPanel isOpen={isOpen} onClose={onClose} title="الإشعارات">
      {list}
    </NavPanel>
  );
}

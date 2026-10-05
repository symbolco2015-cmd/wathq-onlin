import { useEffect, useState, type ReactNode } from 'react';
import BottomSheet from './BottomSheet';
import { BTN_GH_SM } from './SectionView';

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

type NavPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  /** عنوان الورقة في الجوال، واسم اللوحة لقارئ الشاشة */
  title: string;
  children: ReactNode;
};

/** غلاف لوحات الشريط العلوي («أدوات» والإشعارات): ورقة سفلية في الجوال،
 * ولوحة منسدلة تحت الشريط فيما عداه. تُغلق بـ Esc وبالضغط خارجها. */
export default function NavPanel({ isOpen, onClose, title, children }: NavPanelProps) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--bd)] shrink-0">
          <div className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">{title}</div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className={`${BTN_GH_SM} w-11 h-11 px-0`}>
            <i className="ti ti-x text-[20px]" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 pb-6">{children}</div>
      </BottomSheet>
    );
  }

  if (!isOpen) return null;
  return (
    <>
      {/* فوق الشريط العلوي (z-[300]) حتى يغلق الضغطُ على أي مكان اللوحةَ، بما فيه أزرار الشريط */}
      <div className="fixed inset-0 z-[310]" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="fixed z-[320] top-[80px] left-4 sm:left-9 w-[320px] max-h-[calc(100vh-96px)] overflow-y-auto p-2 rounded-[var(--r-md)] border border-[var(--bd)] bg-[var(--s1)]"
        style={{ animation: 'scaleIn .25s var(--sp) both', transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </>
  );
}

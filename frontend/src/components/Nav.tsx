import { useEffect, useState, useRef } from 'react';
import type { PageType, UserProfile } from '../types';
import { SHOW_SECTIONS_EVENT, OPEN_TOOLS_EVENT, OPEN_NOTIFICATIONS_EVENT, NOTIF_COUNT_EVENT, REQUEST_NOTIF_COUNT_EVENT } from './Dashboard';
import { BTN_GH_SM } from './SectionView';

// عنصر الشريط السفلي: النشط --accent، والباقي --t3
function bnavClass(active: boolean) {
  return `flex flex-col items-center justify-center gap-1 w-full h-full cursor-pointer transition-colors duration-150 ${active ? 'text-[var(--accent)]' : 'text-[var(--t3)]'}`;
}

interface NavProps {
  currentPage: PageType;
  setPage: (page: PageType) => void;
  profile: UserProfile;
  onOpenProfileSettings: () => void;
  isAdmin?: boolean;
  isLoggedIn?: boolean;
}

export default function Nav({ currentPage, setPage, profile, onOpenProfileSettings, isAdmin = false, isLoggedIn = false }: NavProps) {
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  // عدد الإشعارات غير المقروءة — يحسبه Dashboard ويرسله بحدث NOTIF_COUNT_EVENT.
  // بعد تسجيل المستمع تطلب Nav العدد، فلا يضيع إرسال سبق تركيبها.
  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    const onCount = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      setNotifCount(typeof n === 'number' ? n : 0);
    };
    window.addEventListener(NOTIF_COUNT_EVENT, onCount);
    window.dispatchEvent(new Event(REQUEST_NOTIF_COUNT_EVENT));
    return () => window.removeEventListener(NOTIF_COUNT_EVENT, onCount);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      // Hide mobile nav when actively scrolling (down or up) beyond a small threshold
      if (Math.abs(currentScrollY - lastScrollY.current) > 5 && currentScrollY > 50) {
        setMobileNavVisible(false);
      }
      
      lastScrollY.current = currentScrollY;

      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      
      // Show mobile nav when scrolling stops
      scrollTimeout.current = setTimeout(() => {
        setMobileNavVisible(true);
      }, 350);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  return (
    <>
      <nav
        className="sticky top-0 z-[300] h-[72px] bg-[var(--bg)] border-b border-[var(--bd)] flex items-center justify-between px-4 sm:px-9"
        style={{ animation: 'navIn .35s var(--sp) both' }}
      >
        <div className="flex items-center gap-2 cursor-pointer no-underline" onClick={() => setPage('auth')}>
          <img src="/brand/mark.svg" alt="" aria-hidden="true" className="h-[28px] w-auto" />
          <span className="text-[length:var(--fs-md)] font-bold text-[var(--t1)]">وثّق</span>
        </div>

        <div className="hidden lg:flex gap-1 bg-[var(--s1)] p-1 rounded-[var(--r-sm)] border border-[var(--bd)]">
          {[
            ...(!isLoggedIn ? [{ id: 'auth', icon: 'ti-login', label: 'الدخول' }] : []),
            { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'لوحة التحكم' },
            { id: 'public', icon: 'ti-eye', label: 'الصفحة العامة' },
            ...(isAdmin ? [{ id: 'admin', icon: 'ti-shield-check', label: 'الأدمن' }] : [])
          ].map((item) => {
             const isActive = currentPage === item.id;
             return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id as PageType)}
                aria-current={isActive ? 'page' : undefined}
                className={`h-9 px-3 flex items-center gap-2 rounded-[var(--r-sm)] text-[length:var(--fs-sm)] font-bold cursor-pointer border-none transition-colors duration-150 ${
                  isActive ? 'bg-[var(--s2)] text-[var(--t1)]' : 'bg-transparent text-[var(--t2)] hover:text-[var(--t1)]'
                }`}
              >
                <i className={`ti ${item.icon} text-[16px]`}></i>
                <span>{item.label}</span>
              </button>
             )
          })}
        </div>

        <div className="flex items-center gap-2">
        {/* الجرس وقائمة «أدوات» — في اللوحة فقط؛ Dashboard تملك حالة فتحهما */}
        {isLoggedIn && currentPage === 'dashboard' && (
          <button
            type="button"
            aria-label="الإشعارات"
            onClick={() => window.dispatchEvent(new Event(OPEN_NOTIFICATIONS_EVENT))}
            className={`${BTN_GH_SM} relative hover:text-[var(--t1)]`}
          >
            <i className="ti ti-bell text-[20px]" />
            {notifCount > 0 && (
              <span className="absolute top-0 left-0 min-w-4 h-4 px-1 rounded-full bg-[var(--accent)] text-[var(--bg)] text-[length:var(--fs-xs)] font-bold leading-none flex items-center justify-center">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
        )}
        {isLoggedIn && currentPage === 'dashboard' && (
          <button
            type="button"
            aria-label="أدوات"
            onClick={() => window.dispatchEvent(new Event(OPEN_TOOLS_EVENT))}
            className={`${BTN_GH_SM} hover:text-[var(--t1)]`}
          >
            <i className="ti ti-tools text-[20px]" />
            <span className="hidden md:inline">أدوات</span>
          </button>
        )}
        <div
          className="flex items-center gap-2 h-11 px-2 rounded-[var(--r-sm)] cursor-pointer border border-transparent transition-colors duration-150 hover:bg-[var(--s2)]"
          onClick={onOpenProfileSettings}
        >
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-[var(--r-full)] flex items-center justify-center text-[length:var(--fs-xs)] font-bold text-[var(--t1)] bg-cover bg-center overflow-hidden ${profile.avatar ? '' : 'bg-[var(--s2)] border border-[var(--bd2)]'}`}
            style={profile.avatar ? { backgroundImage: `url(${profile.avatar})` } : {}}
          >
            {!profile.avatar && profile.name.substring(0, 2)}
          </div>
          <div className="hidden sm:block">
            <div className="text-[length:var(--fs-sm)] font-bold text-[var(--t1)] leading-tight">{profile.name}</div>
            <div className="text-[length:var(--fs-xs)] text-[var(--t3)]">{profile.role}</div>
          </div>
          <i className="ti ti-chevron-down text-[16px] text-[var(--t3)]"></i>
        </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className={`lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[var(--s1)] border-t border-[var(--bd)] flex items-center justify-around z-[300] px-2 transition-transform duration-250 ${!mobileNavVisible ? 'translate-y-full' : 'translate-y-0'}`}>
        {isLoggedIn ? (
          <>
            {/* الرئيسية */}
            <button type="button" onClick={() => setPage('dashboard')} className={bnavClass(currentPage === 'dashboard')}>
              <i className="ti ti-home text-[24px]" />
              <span className="text-[length:var(--fs-xs)] font-bold">الرئيسية</span>
            </button>

            {/* البنود */}
            <button
              type="button"
              onClick={() => {
                // على اللوحة: Dashboard تغلق أي شاشة مفتوحة ثم تمرّر إلى بداية قائمة الأقسام
                if (currentPage === 'dashboard') {
                  window.dispatchEvent(new Event(SHOW_SECTIONS_EVENT));
                  return;
                }
                setPage('dashboard');
                setTimeout(() => {
                  document.getElementById('sections-list')?.scrollIntoView({ behavior: 'smooth' });
                }, 200);
              }}
              className={bnavClass(false)}
            >
              <i className="ti ti-list-details text-[24px]" />
              <span className="text-[length:var(--fs-xs)] font-bold">البنود</span>
            </button>

            {/* الإعدادات */}
            <button type="button" onClick={onOpenProfileSettings} className={bnavClass(false)}>
              <i className="ti ti-settings-2 text-[24px]" />
              <span className="text-[length:var(--fs-xs)] font-bold">الإعدادات</span>
            </button>

            {/* ملفي */}
            <button type="button" onClick={() => setPage('public')} className={bnavClass(currentPage === 'public')}>
              <i className="ti ti-user-circle text-[24px]" />
              <span className="text-[length:var(--fs-xs)] font-bold">ملفي</span>
            </button>

            {/* الأدمن (إذا كان مشرفاً) */}
            {isAdmin && (
              <button type="button" onClick={() => setPage('admin')} className={bnavClass(currentPage === 'admin')}>
                <i className="ti ti-shield-check text-[24px]" />
                <span className="text-[length:var(--fs-xs)] font-bold">الأدمن</span>
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={() => setPage('auth')} className={bnavClass(false)}>
            <i className="ti ti-login text-[24px]" />
            <span className="text-[length:var(--fs-xs)] font-bold">الدخول</span>
          </button>
        )}
      </div>
    </>
  );
}

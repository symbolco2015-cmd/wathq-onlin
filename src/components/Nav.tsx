import React, { useEffect, useState, useRef } from 'react';
import type { PageType, UserProfile } from '../types';

interface NavProps {
  currentPage: PageType;
  setPage: (page: PageType) => void;
  onToast: (msg: string, icon?: string) => void;
  profile: UserProfile;
  onOpenProfileSettings: () => void;
  isAdmin?: boolean;
  isLoggedIn?: boolean;
}

export default function Nav({ currentPage, setPage, onToast, profile, onOpenProfileSettings, isAdmin = false, isLoggedIn = false }: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 4);
      
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
        className={`sticky top-0 z-[300] h-[72px] bg-[#060f0a]/85 backdrop-blur-[28px] border-b border-[var(--line)] flex items-center justify-between px-4 sm:px-9 transition-all duration-300 ${
          scrolled ? 'border-[var(--line2)] shadow-[0_4px_40px_rgba(0,0,0,.5),0_1px_0_rgba(201,162,39,.1)]' : ''
        }`}
        style={{ animation: 'navIn .7s var(--sp) both' }}
      >
        <div className="flex items-center gap-3.5 cursor-pointer no-underline" onClick={() => setPage('auth')}>
          <div className="relative overflow-hidden w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] flex items-center justify-center text-[22px] text-white shadow-[0_0_0_1px_rgba(82,196,120,.3),0_8px_24px_rgba(42,122,68,.5)] transition-all duration-400 hover:rotate-[-8deg] hover:scale-110 hover:shadow-[0_0_0_2px_rgba(82,196,120,.5),0_12px_30px_rgba(42,122,68,.6)] group">
             <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.2)_0%,transparent_60%)]" />
             <i className="ti ti-certificate relative z-10 group-hover:scale-110 transition-transform"></i>
          </div>
          <div className="hidden sm:block">
            <div className="text-[22px] font-black tracking-tight text-transparent bg-clip-text bg-[linear-gradient(135deg,var(--em8),var(--gold3))]">وثّق</div>
            <div className="text-[11px] text-[var(--text4)] tracking-wide mt-px">ملف الإنجاز الرقمي</div>
          </div>
        </div>

        <div className="hidden md:flex gap-0.5 bg-[var(--glass)] p-1 rounded-xl border border-[var(--line)]">
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
                onClick={() => setPage(item.id as PageType)}
                className={`group flex items-center gap-2 px-5 py-2 rounded-lg text-[13.5px] font-semibold cursor-pointer border-none font-[var(--font)] transition-all duration-300 relative overflow-hidden ${
                  item.id === 'admin'
                    ? isActive
                      ? 'bg-[linear-gradient(135deg,#7c3aed,#4f46e5)] text-white shadow-[0_4px_16px_rgba(124,58,237,.5)]'
                      : 'bg-transparent text-[#a78bfa] hover:text-white hover:bg-[rgba(124,58,237,.15)]'
                    : isActive
                      ? 'bg-[linear-gradient(135deg,var(--em4),var(--em6))] text-white shadow-[0_4px_16px_rgba(42,122,68,.5)]'
                      : 'bg-transparent text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--glass2)]'
                }`}
              >
                <i className={`ti ${item.icon} text-[18px] transition-transform duration-300 relative z-10 ${isActive ? 'scale-110' : 'group-hover:scale-125 group-hover:rotate-[-5deg]'}`}></i>
                <span className="relative z-10">{item.label}</span>
              </button>
             )
          })}
        </div>

        <div 
          className="flex items-center gap-2 sm:gap-3 py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl cursor-pointer border border-transparent transition-all duration-300 hover:bg-[var(--glass2)] hover:border-[var(--line2)]"
          onClick={onOpenProfileSettings}
        >
          <div className="relative flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white flex items-center justify-center text-[13px] sm:text-[14px] font-black shadow-[0_0_0_2px_rgba(82,196,120,.3),0_4px_14px_rgba(42,122,68,.4)] bg-cover bg-center overflow-hidden" 
               style={profile.avatar ? { backgroundImage: `url(${profile.avatar})` } : {}}>
            {!profile.avatar && (
              <div className="absolute -inset-1 rounded-full border-[1.5px] border-transparent bg-clip-padding" style={{
                background: 'linear-gradient(var(--surf0),var(--surf0)) padding-box, linear-gradient(135deg,var(--em7),var(--gold)) border-box',
                animation: 'spin 8s linear infinite'
              }}></div>
            )}
            {!profile.avatar && profile.name.substring(0, 2)}
          </div>
          <div className="hidden sm:block">
            <div className="text-[13.5px] font-bold text-[var(--text)]">{profile.name}</div>
            <div className="text-[11px] text-[var(--text4)]">{profile.role}</div>
          </div>
          <i className="ti ti-chevron-down text-[14px] text-[var(--text4)] sm:mr-0.5"></i>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 h-[64px] bg-[#060f0a]/90 backdrop-blur-[28px] border-t border-[var(--line)] flex items-center justify-around z-[300] px-2 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.4)] transition-transform duration-300 ${!mobileNavVisible ? 'translate-y-full' : 'translate-y-0'}`}>
        {[
          ...(!isLoggedIn ? [{ id: 'auth', icon: 'ti-login', label: 'الدخول' }] : []),
          { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'لوحة التحكم' },
          { id: 'public', icon: 'ti-eye', label: 'الرئيسية' },
          ...(isAdmin ? [{ id: 'admin', icon: 'ti-shield-check', label: 'الأدمن' }] : [])
        ].map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button 
              key={item.id}
              onClick={() => setPage(item.id as PageType)}
              className={`flex flex-col items-center justify-center w-full h-full relative transition-all duration-300 ${
                isActive
                  ? item.id === 'admin' ? 'text-[#a78bfa]' : 'text-[var(--em8)]'
                  : item.id === 'admin' ? 'text-[#a78bfa]/60 hover:text-[#a78bfa]' : 'text-[var(--text4)] hover:text-white'
              }`}
            >
              {isActive && (
                <div className={`absolute top-0 w-8 h-[3px] rounded-b-full shadow-[0_2px_8px_rgba(82,196,120,0.5)] ${
                  item.id === 'admin'
                    ? 'bg-gradient-to-r from-[#7c3aed] to-[#4f46e5]'
                    : 'bg-gradient-to-r from-[var(--em4)] to-[var(--em7)]'
                }`}></div>
              )}
              <i className={`ti ${item.icon} text-[24px] mb-1 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}></i>
              <span className={`text-[10.5px] font-bold ${isActive ? 'text-white' : ''}`}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </>
  );
}

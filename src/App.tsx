import React, { useState, useCallback, useEffect } from 'react';
import type { PageType, SectionData, UserProfile } from './types';
import { useAppStore } from './hooks/useAppStore';
import { useAdminStore } from './hooks/useAdminStore';
import { usePublicProfile } from './hooks/usePublicProfile';
import { supabase } from './supabaseClient';

import Background from './components/Background';
import Nav from './components/Nav';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Public from './components/Public';
import AdminDashboard from './components/Admin/AdminDashboard';
import { Modal, Toast } from './components/UI';
import { SECS } from './data';
import { calculateEvaluation } from './utils';

const SECS_REMOVED = true;

export default function App() {
  // Read ?share=USER_ID from URL — if present, show that user's public profile directly
  const shareUserId = new URLSearchParams(window.location.search).get('share');

  const [currentPage, setCurrentPage] = useState<PageType>(
    shareUserId ? 'public' : 'dashboard'
  );
  const [toastData, setToastData] = useState({ msg: '', icon: '✓', show: false });
  const { 
    state,
    user,
    loading,
    isAdmin,
    passwordRecovery,
    clearPasswordRecovery,
    addEv,
    delEv, 
    toggleStrat, 
    addSub, 
    delSub,
    updateNote, 
    addStrat, 
    updateProfile, 
    signOut,
    announcements,
    markAnnouncementAsRead
  } = useAppStore();

  const {
    users: adminUsers,
    stats: adminStats,
    loading: adminLoading,
    error: adminError,
    reload: adminReload,
    deleteUserPortfolio,
    resetUserPortfolio,
    exportCSV,
    getShareUrl,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
  } = useAdminStore(isAdmin);

  // Load shared profile (only when ?share= param is present)
  const { state: sharedState, loading: sharedLoading, error: sharedError } = usePublicProfile(
    shareUserId ?? null
  );

  // Redirect users dynamically based on auth status — but not when in shared-profile view
  useEffect(() => {
    if (shareUserId) return; // Don't redirect if viewing a shared profile
    if (passwordRecovery) {
      // Keep the user on the auth screen to set a new password, even though a
      // temporary recovery session makes them "logged in".
      setCurrentPage('auth');
      return;
    }
    if (!loading) {
      if (user) {
        if (currentPage === 'auth') {
          setCurrentPage('dashboard');
        }
      } else {
        if (currentPage === 'dashboard') {
          setCurrentPage('auth');
          showToast('انتهت جلستك، يرجى تسجيل الدخول مجدداً 🔒', '🔒');
        }
      }
    }
  }, [user, loading, currentPage, shareUserId, passwordRecovery]);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    icon: string;
    body: React.ReactNode;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    icon: 'ti-plus',
    body: null,
    onConfirm: () => {}
  });

  const showToast = useCallback((msg: string, icon = '✓') => {
    setToastData({ msg, icon, show: true });
    setTimeout(() => setToastData(prev => ({ ...prev, show: false })), 3200);
  }, []);

  const spawnParticles = useCallback((rect: DOMRect) => {
    const colors = ['var(--em7)', 'var(--gold)', 'var(--em8)', '#fff'];
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.cssText = `
        left: ${rect.left + Math.random() * rect.width}px;
        top: ${rect.top + Math.random() * rect.height}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        --px: ${(Math.random() - 0.5) * 80}px;
        animation-delay: ${Math.random() * 0.3}s;
        animation-duration: ${0.6 + Math.random() * 0.4}s;
        width: ${4 + Math.random() * 5}px;
        height: ${4 + Math.random() * 5}px;
      `;
      document.body.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    }
  }, []);

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const openAddEvModal = (sid: number, sub: string) => {
    let pendingType: 'pdf' | 'img' | 'doc' | 'vid' | null = null;
    let pendingName = '';
    let pendingUrl = '';
    
    const Body = () => {
      const [type, setType] = useState<'pdf' | 'img' | 'doc' | 'vid' | null>(null);
      const [uploading, setUploading] = useState(false);
      const [fileName, setFileName] = useState<string | null>(null);
      const [uploadSuccess, setUploadSuccess] = useState(false);
      const fileInputRef = React.useRef<HTMLInputElement>(null);

      pendingType = type;

      const handleAreaClick = () => {
        if (!type) {
          showToast('يرجى اختيار نوع الملف أولاً ⚠️', '⚠️');
          return;
        }
        fileInputRef.current?.click();
      };

      const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setUploading(true);
        setUploadSuccess(false);

        try {
          const fileExt = file.name.split('.').pop();
          const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
          const filePath = `${user?.id || 'guest'}/${uniqueName}`;

          let publicUrl = '';

          if (user && supabase) {
            // Real upload to Supabase Storage
            const { error } = await supabase.storage
              .from('evidence')
              .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
              });

            if (error) throw error;

            const { data: urlData } = supabase.storage
              .from('evidence')
              .getPublicUrl(filePath);

            publicUrl = urlData.publicUrl;
          } else {
            // Simulation for offline/guest mode
            await new Promise((resolve) => setTimeout(resolve, 1500));
            publicUrl = URL.createObjectURL(file); // Temporary blob URL for guest preview
          }

          pendingName = file.name;
          pendingUrl = publicUrl;
          setUploadSuccess(true);
          showToast('تم رفع الملف بنجاح ☁️', '🚀');
        } catch (err: any) {
          console.error("Upload error:", err);
          showToast(`فشل رفع الملف: ${err.message || 'حدث خطأ غير معروف'}`, '❌');
          setFileName(null);
        } finally {
          setUploading(false);
        }
      };

      const getAcceptAttribute = () => {
        if (type === 'pdf') return '.pdf';
        if (type === 'img') return 'image/*';
        if (type === 'vid') return 'video/*';
        if (type === 'doc') return '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
        return undefined;
      };

      return (
        <div>
          <p className="text-[13px] text-[var(--text3)] mb-4">أولاً: اختر نوع الملف:</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { id: 'pdf', icon: 'ti-file-type-pdf', label: 'PDF', color: '#f87171' },
              { id: 'img', icon: 'ti-photo', label: 'صورة', color: '#93c5fd' },
              { id: 'doc', icon: 'ti-file-text', label: 'مستند', color: '#c4b5fd' },
              { id: 'vid', icon: 'ti-video', label: 'فيديو', color: '#fcd34d' }
            ].map(item => (
              <button 
                key={item.id}
                type="button"
                className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border-[1.5px] cursor-pointer text-center font-[var(--font)] text-[14px] font-bold transition-all duration-300 hover:-translate-y-[4px] hover:shadow-[0_12px_30px_rgba(0,0,0,.4)] hover:scale-[1.02] group ${type === item.id ? 'bg-white/10 text-white' : 'border-[var(--line2)] bg-white/5 text-[var(--text2)]'}`}
                style={type === item.id ? { borderColor: item.color, color: item.color, backgroundColor: `${item.color}15` } : {}}
                onClick={() => setType(item.id as any)}
                disabled={uploading}
              >
                <i className={`ti ${item.icon} text-[34px] transition-transform duration-300 group-hover:scale-120`}></i>
                {item.label}
              </button>
            ))}
          </div>

          <p className="text-[13px] text-[var(--text3)] mb-4">ثانياً: ارفع الملف الخاص بالدليل:</p>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange}
            accept={getAcceptAttribute()}
          />

          <div 
            className={`border-[1.5px] border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all duration-250 relative overflow-hidden group ${uploadSuccess ? 'border-[var(--em8)]/50 bg-[var(--em7)]/5' : (type ? 'border-[var(--em7)]/25 hover:border-[var(--em7)]/40' : 'border-white/10 opacity-50 cursor-not-allowed')}`} 
            onClick={handleAreaClick}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(82,196,120,.05),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-250"></div>
            
            {uploading ? (
              <div className="flex flex-col items-center py-2">
                <i className="ti ti-loader animate-spin text-[40px] text-[var(--em8)] mb-3 block"></i>
                <p className="text-[14px] text-white font-bold animate-pulse">جاري رفع الملف سحابياً...</p>
                <span className="text-[11px] text-[var(--text4)] mt-1.5">{fileName}</span>
              </div>
            ) : uploadSuccess ? (
              <div className="flex flex-col items-center py-2">
                <i className="ti ti-cloud-check text-[42px] text-[var(--em8)] mb-2.5 block animate-bounce"></i>
                <p className="text-[14px] text-[var(--em8)] font-black">تم رفع الملف بنجاح! ☁️</p>
                <span className="text-[12px] text-white mt-2 block font-semibold truncate max-w-full px-4">{fileName}</span>
                <span className="text-[11.5px] text-[var(--text4)] mt-1.5 block">انقر لاستبدال الملف بملف آخر</span>
              </div>
            ) : (
              <div className="py-2">
                <i className="ti ti-cloud-upload text-[40px] text-[var(--em6)] mb-2.5 block transition-transform duration-400 group-hover:-translate-y-[6px] group-hover:scale-110"></i>
                <p className="text-[14px] text-[var(--text3)] font-semibold">{type ? 'انقر هنا لاختيار الملف من جهازك' : 'يرجى اختيار نوع الملف أولاً في الأعلى'}</p>
                <span className="text-[12px] text-[var(--text4)] mt-1 block">PNG · JPG · PDF · DOCX · MP4</span>
              </div>
            )}
          </div>

          {/* Custom name field */}
          {uploadSuccess && (
            <div className="mt-4">
              <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">
                <i className="ti ti-pencil text-[14px] text-[var(--em7)]"></i> اسم الدليل (يمكنك تعديله)
              </div>
              <input
                type="text"
                defaultValue={fileName || ''}
                onChange={e => { pendingName = e.target.value || fileName || ''; }}
                className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-xl text-[14px] font-[var(--font)] text-white outline-none transition-all duration-250 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40"
                placeholder="اسم الدليل الذي سيظهر في الملف"
              />
            </div>
          )}
        </div>
      );
    };

    setModalConfig({
      isOpen: true,
      title: 'إضافة دليل جديد',
      subtitle: sub.startsWith('strat:') ? `استراتيجية: ${sub.replace('strat:', '')}` : sub,
      icon: 'ti-paperclip',
      body: <Body />,
      onConfirm: () => {
        if (!pendingType) {
          showToast('الرجاء اختيار نوع الملف والرفع أولاً', '⚠️');
          return;
        }
        if (!pendingUrl) {
          showToast('الرجاء اختيار ورفع دليل حقيقي أولاً', '⚠️');
          return;
        }

        addEv(sid, sub, pendingType, pendingName, pendingUrl);
        showToast('تم إضافة الدليل بنجاح ✅', '✅');
        closeModal();
      }
    });
  };

  const openAddSubModal = (sid: number) => {
    let inputVal = '';
    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => { inputVal = e.target.value; };
    
    setModalConfig({
      isOpen: true,
      title: 'إضافة قسم فرعي',
      subtitle: '',
      icon: 'ti-folder-plus',
      body: (
        <div className="mb-5">
          <div className="text-[12px] font-bold text-[var(--text3)] mb-2.5 flex items-center gap-2 tracking-wide uppercase">
            <i className="ti ti-folder-plus text-[16px] text-[var(--em7)]"></i> اسم القسم الفرعي
          </div>
          <input 
            type="text" 
            autoFocus 
            className="w-full py-3.5 px-4 bg-white/5 border-[1.5px] border-[var(--line2)] rounded-xl text-[15px] font-[var(--font)] text-white outline-none transition-all duration-250 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_4px_rgba(42,122,68,.15)]" 
            placeholder="مثال: برامج الموهوبين" 
            onChange={handleInput} 
          />
        </div>
      ),
      onConfirm: () => {
        if (inputVal.trim()) {
          addSub(sid, inputVal.trim());
          showToast('تم إضافة القسم الفرعي ✓');
          closeModal();
        }
      }
    });
  };

  const openAddStratModal = () => {
    let inputVal = '';
    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => { inputVal = e.target.value; };
    
    setModalConfig({
      isOpen: true,
      title: 'إضافة استراتيجية',
      subtitle: '',
      icon: 'ti-bulb',
      body: (
        <div className="mb-5">
          <div className="text-[12px] font-bold text-[var(--text3)] mb-2.5 flex items-center gap-2 tracking-wide uppercase">
            <i className="ti ti-bulb text-[16px] text-[var(--em7)]"></i> اسم الاستراتيجية
          </div>
          <input 
            type="text" 
            autoFocus 
            className="w-full py-3.5 px-4 bg-white/5 border-[1.5px] border-[var(--line2)] rounded-xl text-[15px] font-[var(--font)] text-white outline-none transition-all duration-250 placeholder-[var(--text4)] focus:bg-[var(--em7)]/5 focus:border-[var(--em7)]/40 focus:shadow-[0_0_0_4px_rgba(42,122,68,.15)]" 
            placeholder="مثال: التعلم بالاستقصاء" 
            onChange={handleInput} 
          />
        </div>
      ),
      onConfirm: () => {
        if (inputVal.trim()) {
          addStrat(inputVal.trim());
          showToast('تم إضافة الاستراتيجية 💡', '💡');
          closeModal();
        }
      }
    });
  };

  const openProfileSettings = () => {
    let p = { ...state.profile };
    
    const Body = () => {
      const [localP, setLocalP] = useState(p);
      const [isProcessing, setIsProcessing] = useState(false);
      const [originalAvatar, setOriginalAvatar] = useState<string | null>(null);

      const handleUpdate = (field: string, value: any) => {
        const next = { ...localP, [field]: value };
        setLocalP(next);
        p = next;
      };

      const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
          if (ev.target?.result) {
            const dataUrl = ev.target.result as string;
            setOriginalAvatar(dataUrl);
            handleUpdate('avatar', dataUrl);
            
            setIsProcessing(true);
            try {
              const imgly = await import('@imgly/background-removal') as any;
              const removeBg = imgly.default || imgly.removeBackground;
              const blob = await removeBg(file);
              
              const img = new Image();
              img.src = URL.createObjectURL(blob);
              img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                  gradient.addColorStop(0, '#52c478'); // var(--em4)
                  gradient.addColorStop(1, '#1a4f2c'); // var(--em7) roughly
                  ctx.fillStyle = gradient;
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0);
                  
                  const finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
                  handleUpdate('avatar', finalDataUrl);
                  URL.revokeObjectURL(img.src);
                }
                setIsProcessing(false);
              };
            } catch (err) {
              console.error("BG removal failed", err);
              // Fallback to original
              setIsProcessing(false);
            }
          }
        };
        reader.readAsDataURL(file);
      };

      const handleUndo = () => {
        if (originalAvatar) {
          handleUpdate('avatar', originalAvatar);
          setOriginalAvatar(null);
        }
      };

      return (
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2 hide-scrollbar pb-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-[64px] h-[64px] rounded-full shrink-0 bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white flex items-center justify-center text-[22px] font-black shadow-[0_0_0_2px_rgba(82,196,120,.25),0_4px_14px_rgba(42,122,68,.4)] bg-cover bg-center overflow-hidden" style={localP.avatar ? { backgroundImage: `url(${localP.avatar})` } : {}}>
              {!localP.avatar && localP.name.substring(0, 2)}
            </div>
            <div className="flex flex-col items-start gap-2">
              <div className="flex flex-wrap gap-2">
                <label className={`py-2 px-4 rounded-xl border border-[var(--line2)] text-[13px] font-bold text-white transition-all ${isProcessing ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:bg-white/5'}`}>
                  <i className="ti ti-upload ml-2"></i>رفع صورة
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={isProcessing} />
                </label>
                {localP.avatar && (
                  <button className="py-2 px-4 rounded-xl border border-[#f87171]/30 text-[13px] font-bold text-[#f87171] cursor-pointer hover:bg-[#f87171]/10 transition-all bg-transparent" onClick={() => { handleUpdate('avatar', ''); setOriginalAvatar(null); }}>
                    حذف
                  </button>
                )}
                {originalAvatar && !isProcessing && (
                  <button className="py-2 px-4 rounded-xl border border-[var(--gold)]/30 text-[13px] font-bold text-[var(--gold)] cursor-pointer hover:bg-[var(--gold)]/10 transition-all bg-transparent" onClick={handleUndo}>
                    <i className="ti ti-arrow-back-up ml-1"></i>تراجع عن التفريغ
                  </button>
                )}
              </div>
              {isProcessing && (
                <div className="text-[12px] text-[var(--em8)] font-bold flex items-center gap-1.5 animate-pulse mt-1">
                  <i className="ti ti-loader animate-spin"></i> جاري معالجة الصورة وتفريغ الخلفية...
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">الاسم الكامل</div>
              <input type="text" value={localP.name} onChange={e => handleUpdate('name', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" />
            </div>
            <div>
              <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">المسمى الوظيفي</div>
              <input type="text" value={localP.role} onChange={e => handleUpdate('role', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">جهة العمل (المدرسة)</div>
              <input type="text" value={localP.school} onChange={e => handleUpdate('school', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" />
            </div>
            <div>
              <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">سنوات الخبرة</div>
              <input type="number" value={localP.yearsOfExperience} onChange={e => handleUpdate('yearsOfExperience', parseInt(e.target.value) || 0)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">رقم الجوال</div>
              <input type="text" value={localP.phone} onChange={e => handleUpdate('phone', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" placeholder="05XXXXXXXX" />
            </div>
            <div>
              <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">البريد الإلكتروني</div>
              <input type="email" value={localP.email} onChange={e => handleUpdate('email', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" placeholder="email@example.com" />
            </div>
          </div>
          <div className="text-[12.5px] font-bold text-[var(--em8)] mt-2 border-b border-[var(--line2)] pb-2 mb-1">حسابات التواصل الاجتماعي</div>
          <div>
            <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">حساب X (تويتر)</div>
            <input type="text" value={localP.twitter} onChange={e => handleUpdate('twitter', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" placeholder="https://x.com/..." />
          </div>
          <div>
            <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">حساب LinkedIn</div>
            <input type="text" value={localP.linkedin} onChange={e => handleUpdate('linkedin', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" placeholder="https://linkedin.com/in/..." />
          </div>
          <div>
            <div className="text-[12px] font-bold text-[var(--text3)] mb-2 flex items-center gap-2">قناة YouTube</div>
            <input type="text" value={localP.youtube} onChange={e => handleUpdate('youtube', e.target.value)} className="w-full py-3 px-4 bg-white/5 border border-[var(--line2)] rounded-lg text-white outline-none focus:border-[var(--em7)]/40" placeholder="https://youtube.com/@..." />
          </div>
          
          {user && (
            <div className="border-t border-red-500/20 pt-5 mt-4">
              <button 
                type="button"
                className="w-full py-3.5 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-[14px] font-bold text-red-400 cursor-pointer transition-all duration-300 flex items-center justify-center gap-2 border-none"
                onClick={async () => {
                  closeModal();
                  await signOut();
                  showToast('تم تسجيل الخروج بنجاح 👋', '👋');
                }}
              >
                <i className="ti ti-logout text-[18px]"></i>
                تسجيل الخروج من الحساب
              </button>
            </div>
          )}
        </div>
      );
    };

    setModalConfig({
      isOpen: true,
      title: 'إعدادات الحساب',
      subtitle: 'تحديث بيانات الملف الشخصي وحسابات التواصل',
      icon: 'ti-settings',
      body: <Body />,
      onConfirm: () => {
        updateProfile(p);
        showToast('تم تحديث الحساب بنجاح ✨', '✨');
        closeModal();
      }
    });
  };

  const openEvalModal = () => {
    const stats = calculateEvaluation(state, SECS);
    
    setModalConfig({
      isOpen: true,
      title: 'معايير التقييم والتوثيق',
      subtitle: 'يتم احتساب التقييم بناءً على مدى اكتمال ملف الإنجاز',
      icon: 'ti-chart-pie',
      body: (
        <div className="flex flex-col gap-5 pb-4">
          <div className="flex items-center gap-5 bg-black/20 p-5 rounded-2xl border border-[var(--line)] shadow-[inset_0_2px_10px_rgba(0,0,0,.2)]">
            <div className={`w-[80px] h-[80px] rounded-full shrink-0 flex items-center justify-center text-[34px] bg-white/5 border-[2px] ${stats.isVerified ? 'text-[var(--em8)] border-[var(--em7)]/40 shadow-[0_0_20px_rgba(82,196,120,.2)]' : 'text-gray-400 border-gray-600/40'}`}>
              <i className={`ti ${stats.levelIcon}`}></i>
            </div>
            <div>
              <div className="text-[13px] text-[var(--text4)] mb-1 uppercase tracking-wide">الحالة الحالية</div>
              <div className={`text-[22px] font-black ${stats.isVerified ? 'text-white' : 'text-gray-300'}`}>{stats.levelStr}</div>
              <div className="text-[14px] font-bold text-[var(--em7)] mt-1">{stats.totalScore} / 100 نقطة</div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="bg-white/5 p-4 rounded-xl border border-[var(--line2)] relative overflow-hidden">
              <div className="absolute top-0 bottom-0 right-0 w-[4px] bg-[#3b82f6]"></div>
              <div className="flex justify-between items-center mb-2">
                <div className="text-[14px] font-bold text-white flex items-center gap-2"><i className="ti ti-layout-grid text-[#3b82f6]"></i> اكتمال الأقسام</div>
                <div className="text-[13px] font-bold text-[#3b82f6]">{stats.secScore} / 50</div>
              </div>
              <div className="text-[12px] text-[var(--text4)]">تم تعبئة {stats.filledSecs} من أصل {SECS.length} أقسام مطلوبة.</div>
              <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#3b82f6] rounded-full" style={{width: `${(stats.secScore/50)*100}%`}}></div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-[var(--line2)] relative overflow-hidden">
              <div className="absolute top-0 bottom-0 right-0 w-[4px] bg-[#10b981]"></div>
              <div className="flex justify-between items-center mb-2">
                <div className="text-[14px] font-bold text-white flex items-center gap-2"><i className="ti ti-files text-[#10b981]"></i> عدد الأدلة والشواهد</div>
                <div className="text-[13px] font-bold text-[#10b981]">{stats.evScore} / 30</div>
              </div>
              <div className="text-[12px] text-[var(--text4)]">مجموع الأدلة المضافة: {stats.totalEvs} أدلة (تحتاج لـ 15 فأكثر للعلامة الكاملة).</div>
              <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#10b981] rounded-full" style={{width: `${(stats.evScore/30)*100}%`}}></div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-[var(--line2)] relative overflow-hidden">
              <div className="absolute top-0 bottom-0 right-0 w-[4px] bg-[#f59e0b]"></div>
              <div className="flex justify-between items-center mb-2">
                <div className="text-[14px] font-bold text-white flex items-center gap-2"><i className="ti ti-bulb text-[#f59e0b]"></i> استراتيجيات التدريس</div>
                <div className="text-[13px] font-bold text-[#f59e0b]">{stats.stratScore} / 20</div>
              </div>
              <div className="text-[12px] text-[var(--text4)]">تم تفعيل {state.strats.length} استراتيجيات (تحتاج لـ 4 للعلامة الكاملة).</div>
              <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#f59e0b] rounded-full" style={{width: `${(stats.stratScore/20)*100}%`}}></div>
              </div>
            </div>
          </div>
        </div>
      ),
      onConfirm: () => {
        closeModal();
      }
    });
  };

  const handleDeleteEv = (sid: number, sub: string, idx: number) => {
    setModalConfig({
      isOpen: true,
      title: 'تأكيد الحذف',
      subtitle: 'هل أنت متأكد من حذف هذا الدليل؟ لا يمكن التراجع عن هذا الإجراء.',
      icon: 'ti-trash',
      body: (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[32px] text-red-400">
            <i className="ti ti-trash"></i>
          </div>
          <p className="text-[14px] text-[var(--text3)] text-center">سيتم حذف الدليل نهائياً من ملفك ولا يمكن استرجاعه.</p>
        </div>
      ),
      onConfirm: () => {
        delEv(sid, sub, idx);
        showToast('تم حذف الدليل 🗑️', '🗑️');
        closeModal();
      }
    });
  };

  // Show loading screen for shared profile view
  if (shareUserId && sharedLoading) {
    return (
      <div className="min-h-screen bg-[#060f0a] flex flex-col items-center justify-center relative overflow-hidden">
        <Background />
        <div className="relative z-10 text-center flex flex-col items-center" style={{ animation: 'scaleIn .6s var(--sp) both' }}>
          <div className="w-[84px] h-[84px] rounded-[24px] bg-gradient-to-br from-[var(--em3)] to-[var(--em6)] text-[40px] text-white flex items-center justify-center shadow-[0_0_0_1px_rgba(82,196,120,.3),0_16px_48px_rgba(42,122,68,.5)] mb-6 animate-pulse">
            <i className="ti ti-eye animate-spin" style={{ animationDuration: '3s' }}></i>
          </div>
          <div className="text-[20px] font-black text-white mb-2 font-[var(--font)]">جاري تحميل ملف الإنجاز...</div>
          <div className="text-[13px] text-[var(--text4)] flex items-center gap-1.5 justify-center font-[var(--font2)]">
            <i className="ti ti-lock text-[16px] text-[var(--em8)] animate-pulse"></i>
            عرض عام — لا يتطلب تسجيل دخول
          </div>
        </div>
      </div>
    );
  }

  // Show error screen if shared profile not found
  if (shareUserId && !sharedLoading && (sharedError || !sharedState)) {
    return (
      <div className="min-h-screen bg-[#060f0a] flex flex-col items-center justify-center relative overflow-hidden">
        <Background />
        <div className="relative z-10 text-center flex flex-col items-center px-6" style={{ animation: 'scaleIn .6s var(--sp) both' }}>
          <div className="w-[84px] h-[84px] rounded-[24px] bg-gradient-to-br from-red-900/60 to-red-700/40 text-[40px] text-red-400 flex items-center justify-center shadow-[0_0_0_1px_rgba(239,68,68,.3),0_16px_48px_rgba(239,68,68,.2)] mb-6">
            <i className="ti ti-mood-sad"></i>
          </div>
          <div className="text-[20px] font-black text-white mb-2 font-[var(--font)]">لم يُعثر على الملف</div>
          <div className="text-[14px] text-[var(--text4)] max-w-sm">{sharedError || 'الرابط غير صحيح أو لم يعد متاحاً.'}</div>
          <a href="/" className="mt-8 py-3 px-8 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white text-[14px] font-bold no-underline hover:opacity-90 transition-opacity">
            <i className="ti ti-home ml-2"></i>العودة للرئيسية
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060f0a] flex flex-col items-center justify-center relative overflow-hidden">
        <Background />
        <div className="relative z-10 text-center flex flex-col items-center" style={{ animation: 'scaleIn .6s var(--sp) both' }}>
          <div className="w-[84px] h-[84px] rounded-[24px] bg-gradient-to-br from-[var(--em3)] to-[var(--em6)] text-[40px] text-white flex items-center justify-center shadow-[0_0_0_1px_rgba(82,196,120,.3),0_16px_48px_rgba(42,122,68,.5)] mb-6 animate-pulse">
            <i className="ti ti-certificate animate-spin" style={{ animationDuration: '6s' }}></i>
          </div>
          <div className="text-[20px] font-black text-white mb-2 font-[var(--font)]">جاري جلب بياناتك بأمان...</div>
          <div className="text-[13px] text-[var(--text4)] flex items-center gap-1.5 justify-center font-[var(--font2)]">
            <i className="ti ti-lock text-[16px] text-[var(--em8)] animate-pulse"></i>
            اتصال آمن بـ Supabase
          </div>
        </div>
      </div>
    );
  }

  // If viewing a shared profile via ?share= — render minimal layout with shared state
  if (shareUserId && sharedState) {
    return (
      <>
        <Background />
        {/* Minimal nav for shared view — no nav items, just logo */}
        <nav className="sticky top-0 z-[300] h-[72px] bg-[#060f0a]/85 backdrop-blur-[28px] border-b border-[var(--line)] flex items-center justify-between px-4 sm:px-9">
          <a href="/" className="flex items-center gap-3.5 no-underline">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] flex items-center justify-center text-[22px] text-white shadow-[0_0_0_1px_rgba(82,196,120,.3),0_8px_24px_rgba(42,122,68,.5)]">
              <i className="ti ti-certificate"></i>
            </div>
            <div className="hidden sm:block">
              <div className="text-[22px] font-black tracking-tight text-transparent bg-clip-text bg-[linear-gradient(135deg,var(--em8),var(--gold3))]">وثّق</div>
              <div className="text-[11px] text-[var(--text4)] tracking-wide mt-px">ملف الإنجاز الرقمي</div>
            </div>
          </a>
          <div className="flex items-center gap-2 py-1.5 px-3 rounded-xl bg-[var(--em7)]/10 border border-[var(--em7)]/20">
            <i className="ti ti-eye text-[var(--em8)] text-[16px]"></i>
            <span className="text-[13px] font-bold text-[var(--em8)] hidden sm:inline">عرض عام</span>
          </div>
        </nav>
        <main>
          <Public state={sharedState} sections={SECS} isSharedView />
        </main>
      </>
    );
  }

  return (
    <>
      <Background />
      {/* Hide the navigation bar on the login page — only show it after the user signs in */}
      {user && currentPage !== 'auth' && (
        <Nav currentPage={currentPage} setPage={setCurrentPage} onToast={showToast} profile={state.profile} onOpenProfileSettings={openProfileSettings} isAdmin={isAdmin} />
      )}

      <main className="md:pb-0 pb-[80px]">
        {currentPage === 'auth' && (
          <Auth
            onLoginSuccess={() => setCurrentPage('dashboard')}
            onToast={showToast}
            spawnParticles={spawnParticles}
            recovery={passwordRecovery}
            onRecoveryComplete={() => {
              clearPasswordRecovery();
              setCurrentPage('dashboard');
            }}
          />
        )}
        
        {currentPage === 'dashboard' && (
          <Dashboard 
            state={state} 
            sections={SECS} 
            onAddEvClick={openAddEvModal}
            onAddSubClick={openAddSubModal}
            onToggleStrat={toggleStrat}
            onUpdateNote={updateNote}
            onDeleteEv={handleDeleteEv}
            onAddStratClick={openAddStratModal}
            onOpenEvalClick={openEvalModal}
            onDelSub={delSub}
            announcements={announcements}
            onMarkAsRead={markAnnouncementAsRead}
          />
        )}
        
        {currentPage === 'public' && <Public state={state} sections={SECS} />}
        
        {currentPage === 'admin' && isAdmin && (
          <AdminDashboard
            users={adminUsers}
            stats={adminStats}
            loading={adminLoading}
            error={adminError}
            onReload={adminReload}
            onDeleteUser={deleteUserPortfolio}
            onResetUser={resetUserPortfolio}
            onExportCSV={exportCSV}
            onToast={showToast}
            getShareUrl={getShareUrl}
            onPublishAnnouncement={createAnnouncement}
            onUpdateAnnouncement={updateAnnouncement}
            onDeleteAnnouncement={deleteAnnouncement}
            announcements={announcements}
          />
        )}
      </main>
      
      <Modal {...modalConfig} onClose={closeModal}>{modalConfig.body}</Modal>
      <Toast {...toastData} />
    </>
  );
}


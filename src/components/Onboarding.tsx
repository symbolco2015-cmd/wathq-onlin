import { useState } from 'react';
import type { UserProfile } from '../types';

const UNSET_PLACEHOLDER = 'غير محدد';

interface OnboardingProps {
  profile: UserProfile;
  onComplete: (update: Partial<UserProfile>) => void;
}

export default function Onboarding({ profile, onComplete }: OnboardingProps) {
  const [name, setName] = useState(profile.name?.trim() && profile.name !== 'مستخدم جديد' && profile.name !== 'مستخدم' ? profile.name : '');
  const [role, setRole] = useState(profile.role?.trim() && profile.role !== UNSET_PLACEHOLDER ? profile.role : '');
  const [school, setSchool] = useState(profile.school?.trim() && profile.school !== UNSET_PLACEHOLDER ? profile.school : '');
  const [yearsOfExperience, setYearsOfExperience] = useState(profile.yearsOfExperience > 0 ? String(profile.yearsOfExperience) : '');
  const [touched, setTouched] = useState(false);

  const yearsValid = yearsOfExperience.trim() !== '' && !Number.isNaN(Number(yearsOfExperience)) && Number(yearsOfExperience) >= 0;
  const nameValid = name.trim().length > 0;
  const roleValid = role.trim().length > 0 && role.trim() !== UNSET_PLACEHOLDER;
  const schoolValid = school.trim().length > 0 && school.trim() !== UNSET_PLACEHOLDER;
  const isValid = nameValid && roleValid && schoolValid && yearsValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onComplete({
      name: name.trim(),
      role: role.trim(),
      school: school.trim(),
      yearsOfExperience: Number(yearsOfExperience),
    });
  };

  const fieldCls = (valid: boolean) =>
    `w-full py-3 px-4 bg-white/5 border rounded-lg text-white outline-none transition-colors ${
      touched && !valid ? 'border-red-500/60' : 'border-[var(--line2)] focus:border-[var(--em7)]/40'
    }`;

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-[700] flex items-center justify-center p-5"
      style={{ animation: 'fadeIn .2s both' }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[480px] bg-[#0b1810] border border-[var(--line2)] rounded-2xl p-7 shadow-[0_24px_64px_rgba(0,0,0,.5)]"
        style={{ animation: 'scaleIn .3s var(--sp) both' }}
      >
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] flex items-center justify-center text-[20px] text-white shrink-0">
            <i className="ti ti-user-check"></i>
          </div>
          <div>
            <div className="text-[18px] font-black text-white">أكمل ملفك الشخصي</div>
            <div className="text-[12px] text-[var(--text4)]">خطوة أخيرة قبل البدء — هذه البيانات إلزامية</div>
          </div>
        </div>
        <div className="text-[12.5px] text-[var(--text3)] leading-relaxed mb-5 border-b border-[var(--line2)] pb-4">
          نحتاج هذه البيانات لتصنيف ملفك بدقة ولن تتمكن من الوصول إلى لوحة التحكم قبل تعبئتها.
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="text-[12px] font-bold text-[var(--text3)] mb-2">الاسم الكامل</div>
            <input type="text" autoFocus value={name} onChange={e => setName(e.target.value)} className={fieldCls(nameValid)} placeholder="مثال: محمد أحمد العتيبي" />
            {touched && !nameValid && <div className="text-[11px] text-red-400 mt-1">هذا الحقل مطلوب</div>}
          </div>
          <div>
            <div className="text-[12px] font-bold text-[var(--text3)] mb-2">التخصص / المسمى الوظيفي</div>
            <input type="text" value={role} onChange={e => setRole(e.target.value)} className={fieldCls(roleValid)} placeholder="مثال: معلم رياضيات" />
            {touched && !roleValid && <div className="text-[11px] text-red-400 mt-1">هذا الحقل مطلوب</div>}
          </div>
          <div>
            <div className="text-[12px] font-bold text-[var(--text3)] mb-2">جهة العمل (المدرسة)</div>
            <input type="text" value={school} onChange={e => setSchool(e.target.value)} className={fieldCls(schoolValid)} placeholder="مثال: متوسطة الفيصل، جدة" />
            {touched && !schoolValid && <div className="text-[11px] text-red-400 mt-1">هذا الحقل مطلوب</div>}
          </div>
          <div>
            <div className="text-[12px] font-bold text-[var(--text3)] mb-2">سنوات الخبرة</div>
            <input type="number" min={0} value={yearsOfExperience} onChange={e => setYearsOfExperience(e.target.value)} className={fieldCls(yearsValid)} placeholder="مثال: 5" />
            {touched && !yearsValid && <div className="text-[11px] text-red-400 mt-1">أدخل عدد سنوات صحيح (0 أو أكثر)</div>}
          </div>
        </div>

        <button
          type="submit"
          className="w-full mt-6 py-3.5 rounded-xl bg-gradient-to-br from-[var(--em4)] to-[var(--em7)] text-white font-black text-[14.5px] cursor-pointer transition-opacity hover:opacity-90"
        >
          حفظ والمتابعة إلى لوحة التحكم
        </button>
      </form>
    </div>
  );
}

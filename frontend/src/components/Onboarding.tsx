import { useState } from 'react';
import type { UserProfile } from '../types';
import { BTN_PRI } from './SectionView';
import { FIELD, LABEL, HINT } from './formStyles';

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

  // حدّ الحقل ولون رسالته --danger عند الخطأ، فوق ألوان FIELD وHINT
  const fieldCls = (valid: boolean) =>
    `${FIELD} ${touched && !valid ? 'border-[var(--danger)]! focus:border-[var(--danger)]!' : ''}`;
  const ERROR = `${HINT} text-[var(--danger)]!`;

  return (
    // مصمتة: الإعداد الأول يحجب الواجهة كلها، فلا شيء خلفها يُرى
    <div className="fixed inset-0 z-[700] bg-[var(--bg)] overflow-y-auto flex items-start sm:items-center justify-center px-4 py-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[480px] bg-[var(--s1)] border border-[var(--bd2)] rounded-[var(--r-lg)] p-4 sm:p-6 motion-safe:animate-[splashFade_250ms_ease]"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-[var(--r-sm)] bg-[var(--s2)] flex items-center justify-center text-[24px] text-[var(--t2)] shrink-0">
            <i className="ti ti-user-check" aria-hidden="true"></i>
          </div>
          <div>
            <h1 className="text-[length:var(--fs-lg)] font-bold text-[var(--t1)]">أكمل ملفك الشخصي</h1>
            <div className="text-[length:var(--fs-xs)] text-[var(--t3)]">خطوة أخيرة قبل البدء — هذه البيانات إلزامية</div>
          </div>
        </div>
        <div className="text-[length:var(--fs-sm)] text-[var(--t2)] leading-[1.8] mb-4 border-b border-[var(--bd)] pb-4">
          نحتاج هذه البيانات لتصنيف ملفك بدقة ولن تتمكن من الوصول إلى لوحة التحكم قبل تعبئتها.
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="ob-name" className={LABEL}>الاسم الكامل</label>
            <input id="ob-name" type="text" autoFocus value={name} onChange={e => setName(e.target.value)} className={fieldCls(nameValid)} placeholder="مثال: محمد أحمد العتيبي" />
            {touched && !nameValid && <div className={ERROR}>هذا الحقل مطلوب</div>}
          </div>
          <div>
            <label htmlFor="ob-role" className={LABEL}>التخصص / المسمى الوظيفي</label>
            <input id="ob-role" type="text" value={role} onChange={e => setRole(e.target.value)} className={fieldCls(roleValid)} placeholder="مثال: معلم رياضيات" />
            {touched && !roleValid && <div className={ERROR}>هذا الحقل مطلوب</div>}
          </div>
          <div>
            <label htmlFor="ob-school" className={LABEL}>جهة العمل (المدرسة)</label>
            <input id="ob-school" type="text" value={school} onChange={e => setSchool(e.target.value)} className={fieldCls(schoolValid)} placeholder="مثال: متوسطة الفيصل، جدة" />
            {touched && !schoolValid && <div className={ERROR}>هذا الحقل مطلوب</div>}
          </div>
          <div>
            <label htmlFor="ob-years" className={LABEL}>سنوات الخبرة</label>
            <input id="ob-years" type="number" min={0} value={yearsOfExperience} onChange={e => setYearsOfExperience(e.target.value)} className={fieldCls(yearsValid)} placeholder="مثال: 5" />
            {touched && !yearsValid && <div className={ERROR}>أدخل عدد سنوات صحيح (0 أو أكثر)</div>}
          </div>
        </div>

        <button type="submit" className={`${BTN_PRI} w-full mt-6`}>
          حفظ والمتابعة إلى لوحة التحكم
        </button>
      </form>
    </div>
  );
}

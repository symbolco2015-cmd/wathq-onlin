// «الاستمرارية عبر العام الدراسي» في الصفحة العامة. غير موجودة في pub() بالنموذج،
// فشكلها من شبكة الأشهر .months في الأرشيف (docs/design/wathq-prototype.html)،
// ومؤشر كل شهر بشكل .dots i وألوان الحالة: نشط --accent، ومضى بلا توثيق --idle.
import type { ContinuityData } from '../types';

const MONTH_ABBR: Record<number, string> = {
  1: 'ينا', 2: 'فبر', 3: 'مار', 4: 'أبر', 5: 'ماي', 6: 'يون',
  7: 'يول', 8: 'أغس', 9: 'سبت', 10: 'أكت', 11: 'نوف', 12: 'ديس',
};
const MONTH_FULL: Record<number, string> = {
  1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو',
  7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر',
};

/** يبني 12 شهراً بالترتيب بدءاً من yearStartMonth للسنة الدراسية المرجعية —
 * نفس منطق academicStartYear في useMonthlyProgress.ts، معاد محلياً هنا لأن
 * تلك النسخة مرتبطة بحالة قابلة للتعديل خاصة بلوحة التحكم (recordEvidence/
 * removeEvidence) لا حاجة لها في العرض العام للقراءة فقط.
 * referenceDate: افتراضياً "اليوم" (مسار ?share= الحي، بلا أي تغيير)؛ في وضع
 * تقرير الحصاد الفصلي (?report=) يُمرَّر بداية الفترة نفسها بدل "اليوم"، حتى
 * لا تُبنى شبكة سنة دراسية غير متعلقة بالتقرير عند فتح رابط قديم لاحقاً. */
function buildAcademicMonths(yearStartMonth: number, referenceDate: Date = new Date()): { year: number; month: number }[] {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const startYear = currentMonth >= yearStartMonth ? currentYear : currentYear - 1;
  const startFlat = startYear * 12 + (yearStartMonth - 1);

  return Array.from({ length: 12 }, (_, i) => {
    const flat = startFlat + i;
    return { year: Math.floor(flat / 12), month: (flat % 12) + 1 };
  });
}

/** 12 خلية بترتيب السنة الدراسية، بثلاث حالات: نشط (توثيق فعلي)، مضى بلا
 * توثيق، ومستقبلي لم يحن بعد (حد متقطع بلا مؤشر) حتى لا يُقرأ كإخفاق.
 * referenceDate: انظر تعليق buildAcademicMonths — نفس المرجع يحدد الخلايا
 * "المستقبلية" بالنسبة لفترة التقرير، لا بالنسبة لتاريخ فتح الرابط. */
export default function PublicContinuity({ continuity, referenceDate = new Date() }: { continuity: ContinuityData; referenceDate?: Date }) {
  const months = buildAcademicMonths(continuity.yearStartMonth, referenceDate);
  const activeSet = new Set(continuity.activeMonths.map(m => `${m.year}-${m.month}`));
  const currentFlat = referenceDate.getFullYear() * 12 + (referenceDate.getMonth() + 1);

  let activeCount = 0;
  const cells = months.map(m => {
    const flat = m.year * 12 + m.month;
    const isFuture = flat > currentFlat;
    const isActive = !isFuture && activeSet.has(`${m.year}-${m.month}`);
    if (isActive) activeCount++;
    return { ...m, isFuture, isActive };
  });

  return (
    <section className="print-card" aria-labelledby="continuity-title">
      <div className="flex items-center gap-1.5 text-[length:var(--fs-xs)] font-bold text-[var(--brand-gold)] print:break-after-avoid">
        <i className="ti ti-calendar-stats text-[16px]"></i>
        الاستمرارية
      </div>
      <h2 id="continuity-title" className="mt-1 text-[length:var(--fs-lg)] font-bold text-[var(--t1)] print:break-after-avoid">الاستمرارية عبر العام الدراسي</h2>
      <div className="mt-3 grid grid-cols-6 lg:grid-cols-12 gap-2">
        {cells.map(c => (
          <div
            key={`${c.year}-${c.month}`}
            title={`${MONTH_FULL[c.month]} ${c.year} — ${c.isFuture ? 'لم يحن بعد' : c.isActive ? 'تم التوثيق' : 'بلا توثيق'}`}
            className={`flex flex-col items-center gap-2 py-3 px-1 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] ${
              c.isFuture
                ? 'border border-dashed border-[var(--bd)] text-[var(--t3)]'
                : `bg-[var(--s2)] print:bg-transparent print:border ${c.isActive ? 'text-[var(--t1)] font-bold' : 'text-[var(--t3)]'}`
            }`}
          >
            {MONTH_ABBR[c.month]}
            <span
              className={`w-[18px] h-1 rounded-[var(--r-full)] ${
                c.isFuture ? 'bg-transparent' : c.isActive ? 'bg-[var(--accent)]' : 'bg-[var(--idle)]'
              }`}
            ></span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[length:var(--fs-xs)] text-[var(--t3)]">
        نشط في <strong className="font-bold text-[var(--t1)]">{activeCount}</strong> من 12 شهراً
      </p>
    </section>
  );
}

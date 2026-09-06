import { SectionMeta } from './types';

// البيانات الثابتة للأقسام فقط — id/ttl/icon/isStrat/strats/isResultsSection.
// subs لم تعد تُكتب هنا يدوياً: المؤشرات الفرعية الحقيقية تُجلب من جدول
// section_indicators عبر useSections.ts وتُدمج مع هذه البيانات الثابتة لبناء
// SectionData الكامل (subs مشتقة من indicators هناك). لا تُقرأ SECS مباشرة
// خارج هذا الملف وuseSections.ts — بقية التطبيق يستهلك مخرجات useSections.
export const SECS: SectionMeta[] = [
  {id:1,ttl:'أداء الواجبات المهنية',icon:'ti-briefcase'},
  {id:2,ttl:'التفاعل مع المجتمع المحلي',icon:'ti-users'},
  {id:3,ttl:'التفاعل مع أولياء الأمور',icon:'ti-heart-handshake'},
  {id:4,ttl:'التنويع في استراتيجيات التدريس',icon:'ti-bulb',
   isStrat:true,strats:['الصف المقلوب','خرائط المفاهيم','العصف الذهني','التعلم القائم على المشروعات','التعلم التعاوني','التعلم المتمايز','التعلم باللعب','التعلم النشط']},
  {id:5,ttl:'تحسين نتائج المتعلمين',icon:'ti-trending-up',isResultsSection:true},
  {id:6,ttl:'إعداد خطة التعلم',icon:'ti-calendar-event'},
  {id:7,ttl:'توظيف تقنيات التعليم',icon:'ti-device-laptop'},
  {id:8,ttl:'تهيئة البيئة التعليمية',icon:'ti-home-heart'},
  {id:9,ttl:'الإدارة الصفية',icon:'ti-layout-list'},
  {id:10,ttl:'تحليل نتائج المتعلمين',icon:'ti-chart-dots',isResultsSection:true},
  {id:11,ttl:'تنوع أساليب التقويم',icon:'ti-clipboard-check'}
];

// مشتق من SECS بدل رقم خام مكرَّر في أي ملف مستهلك (EvidenceForm.tsx وغيره
// لاحقاً) — لو أُعيدت تسمية هذا البند أو حُذف، find() ترجع undefined فيفشل
// هذا السطر فوراً عند التحميل (خطأ ظاهر)، بدل انكسار صامت لرقم ثابت غير
// متزامن مع data.ts. لا يوجد بالمشروع نمط "SECTION_ID" مسمّى مسبقاً (أقسام
// isStrat/isResultsSection تُعرَّف بعلم boolean على SectionMeta لا برقم؛
// وحيثما احتاج الكود رقماً ثابتاً فعلياً — بند 5/10 في Dashboard.tsx — يُكتب
// حرفياً بلا ثابت مسمّى) — هذا الاشتقاق أكثر أماناً من كليهما.
export const LESSON_PLAN_SECTION_ID = SECS.find(s => s.ttl === 'إعداد خطة التعلم')!.id;

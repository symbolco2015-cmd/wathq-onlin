import { useEffect, useState, type CSSProperties } from 'react';
import SplashScreen from './SplashScreen';

// هيكل لوحة التحكم حسب skeleton() في wathq-prototype.html: يظهر بعد معرفة
// أن المستخدم مسجّل الدخول وبيانات اللوحة ما زالت تُحمَّل.

function Sk({ style }: { style?: CSSProperties }) {
  return (
    <div
      className="rounded-[var(--r-sm)] motion-safe:animate-[skShimmer_1.3s_linear_infinite]"
      style={{
        background: 'linear-gradient(90deg, var(--s2) 0%, #232b27 45%, var(--s2) 90%)',
        backgroundSize: '220% 100%',
        ...style,
      }}
    />
  );
}

const card: CSSProperties = { background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--r-md)' };

function Row() {
  return (
    <div className="flex items-center gap-3 mt-2" style={{ ...card, padding: '12px 14px' }}>
      <Sk style={{ width: 40, height: 40, flexShrink: 0 }} />
      <div className="flex-1 flex flex-col gap-[7px]">
        <Sk style={{ height: 12, width: '55%' }} />
        <Sk style={{ height: 6, width: '30%' }} />
      </div>
    </div>
  );
}

function Summary() {
  return (
    <div className="flex flex-col gap-[10px] p-4" style={card}>
      <Sk style={{ height: 12, width: '40%' }} />
      <Sk style={{ height: 28, width: '30%' }} />
      <Sk style={{ height: 6 }} />
    </div>
  );
}

export default function DashboardSkeleton() {
  // إن طال التحميل 12 ثانية يتحول الهيكل إلى «تعذّر الاتصال» (إعادة تحميل الصفحة)
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(timer);
  }, []);

  if (failed) return <SplashScreen failed />;

  return (
    <div aria-busy="true" className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <span className="sr-only" role="status">جارٍ التحميل</span>

      <div
        className="sticky top-0 z-[6] flex items-center gap-2 px-[14px] py-[11px] md:px-[26px] md:py-3 backdrop-blur-[8px]"
        style={{ background: 'rgba(11,15,13,.93)', borderBottom: '1px solid var(--bd)' }}
      >
        <Sk style={{ width: 28, height: 28 }} />
        <Sk style={{ width: 60, height: 14 }} />
        <div className="flex-1" />
        <Sk style={{ width: 40, height: 40 }} />
        <Sk style={{ width: 40, height: 40 }} />
      </div>

      {/* الجوال والتابلت: بطاقتا الملخص (عمودان من 640px) ثم 4 صفوف */}
      <div className="lg:hidden px-[14px] pt-[14px] pb-[90px]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Summary /><Summary />
          </div>
          <div>
            <Row /><Row /><Row /><Row />
          </div>
        </div>
      </div>

      {/* سطح المكتب: عمود صفوف مع عمود الملخص (الشهر، ثم الزر، ثم التراكمية) */}
      <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_300px] gap-[22px] items-start px-[26px] pt-[22px] pb-10">
        <div className="flex flex-col gap-3 min-w-0">
          <Row /><Row /><Row /><Row /><Row />
        </div>
        <div className="flex flex-col gap-3 sticky top-[78px]">
          <Summary />
          <Sk style={{ height: 46 }} />
          <Summary />
        </div>
      </div>
    </div>
  );
}

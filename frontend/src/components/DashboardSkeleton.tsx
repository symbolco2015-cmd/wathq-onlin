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

// ارتفاع صف القسم في Dashboard: عنوان fs-md ثم سطر صغير ثم شريط 6px
function Row() {
  return (
    <div className="flex items-center gap-3" style={{ ...card, padding: '12px 14px' }}>
      <Sk style={{ width: 40, height: 40, flexShrink: 0 }} />
      <div className="flex-1 flex flex-col">
        <Sk style={{ height: 18, width: '55%' }} />
        <Sk style={{ height: 12, width: '30%', marginTop: 6 }} />
        <Sk style={{ height: 6, marginTop: 12 }} />
      </div>
    </div>
  );
}

// سطر التحية «مرحباً، …» وتحته التاريخ
function Greeting() {
  return (
    <div className="mb-4 px-1 flex flex-col gap-1">
      <Sk style={{ height: 24, width: '45%' }} />
      <Sk style={{ height: 12, width: '25%' }} />
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

      {/* نفس ارتفاع Nav وحشوته وخلفيته */}
      <div className="sticky top-0 z-[6] h-[72px] flex items-center gap-2 px-4 sm:px-9 bg-[var(--bg)] border-b border-[var(--bd)]">
        <Sk style={{ width: 28, height: 28 }} />
        <Sk style={{ width: 32, height: 16 }} />
        <div className="flex-1" />
        <Sk style={{ width: 36, height: 36 }} />
        <Sk style={{ width: 36, height: 36 }} />
      </div>

      {/* الجوال والتابلت (حشوة main في Dashboard): التحية، بطاقتا الملخص (عمودان من 640px)، ثم 4 صفوف */}
      <div className="lg:hidden p-3 sm:p-5 md:py-9 md:px-8">
        <Greeting />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Summary /><Summary />
        </div>
        <div className="flex flex-col gap-2">
          <Row /><Row /><Row /><Row />
        </div>
      </div>

      {/* سطح المكتب: التحية وعمود الصفوف، مع عمود الملخص (الشهر، ثم الزر، ثم التراكمية، ثم الأقسام) */}
      <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_300px] gap-8 items-start px-8 pt-9 pb-10">
        <div className="min-w-0">
          <Greeting />
          <div className="flex flex-col gap-2">
            <Row /><Row /><Row /><Row /><Row />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Summary />
          <Sk style={{ height: 44 }} />
          <Summary />
          <div className="flex flex-col gap-3 p-3" style={card}>
            <Sk style={{ height: 14 }} /><Sk style={{ height: 14 }} /><Sk style={{ height: 14 }} />
            <Sk style={{ height: 14 }} /><Sk style={{ height: 14 }} /><Sk style={{ height: 14 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

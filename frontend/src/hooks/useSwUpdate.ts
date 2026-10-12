import { useEffect, useState } from 'react';

// يُلتقط وقت تحميل الوحدة، قبل أن يتسلّم الـ SW التحكم في أول تثبيت (clientsClaim).
// في أول تثبيت لا توجد نسخة أقدم، فلا يُعدّ controllerchange تحديثاً.
const hadController = typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
  && !!navigator.serviceWorker.controller;

// مرة واحدة في عمر الصفحة، حتى مع التركيب المزدوج في StrictMode
let updateSeen = false;

// المتصفح يفحص sw.js عند التنقل فقط، والتطبيق صفحة واحدة؛ نفحص عند العودة إلى
// الواجهة بحد أدنى 30 دقيقة بين فحصين. تحميل الصفحة نفسه فحص.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** true عندما تتسلّم نسخة جديدة من الـ Service Worker التحكم في هذه الصفحة. لا يعيد التحميل أبداً. */
export function useSwUpdate(): boolean {
  const [ready, setReady] = useState(updateSeen);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    let lastCheck = Date.now();

    const onControllerChange = () => {
      if (!hadController) return;
      updateSeen = true;
      setReady(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      sw.getRegistration()
        .then(reg => reg?.update())
        .catch(err => console.warn('[useSwUpdate] تعذّر فحص التحديث:', err));
    };

    sw.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return ready;
}

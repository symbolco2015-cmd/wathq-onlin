import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export interface SupportContacts {
  email: string;
  whatsapp: string;
}

// شاشة «تعذّر الاتصال» تظهر حين لا يصل التطبيق إلى الخادم، فلا يمكن جلب
// بيانات الدعم منه في تلك اللحظة. الترتيب: قيم ثابتة احتياطية، ثم آخر جلب
// ناجح محفوظ في localStorage، ثم جلب جديد من public_settings عند التحميل.
const FALLBACK: SupportContacts = { email: 'symbolco2015@gmail.com', whatsapp: '966569961179' };
const STORAGE_KEY = 'wathq.support';

const isEmail = (v: unknown): v is string => typeof v === 'string' && v.includes('@');
const isWhatsapp = (v: unknown): v is string => typeof v === 'string' && /^\d+$/.test(v);

function merge(base: SupportContacts, src: { email?: unknown; whatsapp?: unknown }): SupportContacts {
  return {
    email: isEmail(src.email) ? src.email : base.email,
    whatsapp: isWhatsapp(src.whatsapp) ? src.whatsapp : base.whatsapp,
  };
}

function readStored(): SupportContacts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return FALLBACK;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return FALLBACK;
    return merge(FALLBACK, parsed as { email?: unknown; whatsapp?: unknown });
  } catch {
    return FALLBACK;
  }
}

export function useSupportContacts(): SupportContacts {
  const [contacts, setContacts] = useState<SupportContacts>(readStored);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase
      .from('public_settings')
      .select('key, value')
      .in('key', ['support_email', 'support_whatsapp'])
      .then(
        ({ data, error }) => {
          if (error || !data) return;
          const byKey = new Map(data.map((row: { key: string; value: string }) => [row.key, row.value]));
          const next = merge(readStored(), {
            email: byKey.get('support_email'),
            whatsapp: byKey.get('support_whatsapp'),
          });
          // يُحفظ حتى لو فُكّ تركيب المكوّن، ليبقى متاحاً عند فشل لاحق
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
          if (!cancelled) setContacts(next);
        },
        () => {}
      );

    return () => {
      cancelled = true;
    };
  }, []);

  return contacts;
}

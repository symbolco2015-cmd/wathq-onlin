// Netlify Edge Function — injects per-teacher Open Graph tags into the
// homepage response when the request carries a ?share=USER_ID query param.
// Falls back to the static tags already baked into frontend/index.html on
// any failure path (missing param, invalid id, share disabled, user not
// found, network error, timeout, malformed response) — those static tags
// are always a safe, working default, so no failure here may break the page.
import type { Context } from '@netlify/edge-functions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FETCH_TIMEOUT_MS = 2500;
// Onboarding writes this exact string into profile.role/school when a
// teacher hasn't filled them in yet (see UNSET_PLACEHOLDER in
// frontend/src/utils.ts and frontend/src/components/Onboarding.tsx) — a
// share link can point at a profile that still has it, so it must be
// treated the same as an empty role, never shown verbatim.
const UNSET_ROLE_PLACEHOLDER = 'غير محدد';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Replaces only the content="" value of the specific <meta property="X" ...>
// tag identified by `property` — anchored to that exact property attribute,
// never a blind/global replace that could corrupt an unrelated tag.
function replaceMetaContent(html: string, property: string, content: string): string {
  const pattern = new RegExp(
    `(<meta\\s+property="${property}"\\s+content=")[^"]*("\\s*/?>)`,
    'i'
  );
  return html.replace(pattern, `$1${content}$2`);
}

export default async (request: Request, context: Context): Promise<Response> => {
  const url = new URL(request.url);
  const shareId = url.searchParams.get('share');

  // No share link on this request — nothing to do.
  if (!shareId) {
    return context.next();
  }

  // Reject anything not shaped like a UUID before any network call.
  if (!UUID_RE.test(shareId)) {
    return context.next();
  }

  // Fetch the original page first — it doubles as the fallback for every
  // failure branch below, and is itself the final safe default.
  const response = await context.next();

  const supabaseUrl = Deno.env.get('OG_SUPABASE_URL');
  const anonKey = Deno.env.get('OG_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return response;
  }

  // AbortController + setTimeout instead of AbortSignal.timeout(): the
  // former has been part of the platform since Deno's first release, so
  // there's no dependency on a newer convenience API whose availability in
  // Netlify's pinned Edge Functions runtime can't be confirmed from here.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let profile: { name?: unknown; role?: unknown } | null = null;
  try {
    const supaRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_shared_portfolio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ target_id: shareId }),
      signal: controller.signal,
    });

    if (!supaRes.ok) {
      return response;
    }

    const data = await supaRes.json();
    profile = data?.profile ?? null;
  } catch {
    // Network error, timeout, or malformed JSON — original response stands.
    return response;
  } finally {
    clearTimeout(timeoutId);
  }

  // share_enabled = false, or no portfolio for this id — get_shared_portfolio
  // returns an empty row for both cases (see supabase_share_enabled_setup.sql).
  // Either way: no profile data means the generic static tags stay, no exceptions.
  const rawName = typeof profile?.name === 'string' ? profile.name.trim() : '';
  if (!rawName) {
    return response;
  }

  const name = escapeHtml(rawName);
  const rawRole = typeof profile?.role === 'string' ? profile.role.trim() : '';
  const role = rawRole && rawRole !== UNSET_ROLE_PLACEHOLDER ? escapeHtml(rawRole) : '';

  const title = `${name} — ملف الإنجاز الرقمي`;
  const description = role
    ? `${role} · وثّق — منصة توثيق الإنجاز المهني للمعلم السعودي`
    : 'وثّق — منصة توثيق الإنجاز المهني للمعلم السعودي';
  // shareId already passed UUID_RE above (hex digits and hyphens only),
  // so it carries no HTML-significant characters and needs no escaping.
  const ogUrl = `https://wathq.online/?share=${shareId}`;

  let html = await response.text();
  html = replaceMetaContent(html, 'og:title', title);
  html = replaceMetaContent(html, 'og:description', description);
  html = replaceMetaContent(html, 'og:url', ogUrl);
  html = replaceMetaContent(html, 'twitter:title', title);
  html = replaceMetaContent(html, 'twitter:description', description);

  // Passing `response` as the second Response() argument copies its
  // status/statusText/headers as-is — Content-Type and every security
  // header from frontend/public/_headers travel with it unchanged. Only
  // the body is replaced.
  return new Response(html, response);
};

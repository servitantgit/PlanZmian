/* ================================================================
   PLAN ZMIAN — admin auth for Pages Functions

   SPEC: docs/ADMIN_BACKEND_SPEC.md §5
   - Authorization: Bearer <Google access token>
   - tokeninfo → aud/azp == GOOGLE_CLIENT_ID, email verified, in ADMIN_EMAILS
   - short in-memory cache (≤60s) for successful checks only
   ================================================================ */

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const TOKENINFO_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

/** @type {Map<string, { email: string, exp: number }>} */
const tokenCache = new Map();

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function parseAdminEmails(env) {
  const raw = (env && env.ADMIN_EMAILS) || '';
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<{ email: string } | Response>}
 *   Success object or a Response to return immediately.
 */
export async function requireAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(\S+)/i.exec(auth);
  if (!m) return jsonError(401, 'no_token');

  const token = m[1];
  const clientId = env && env.GOOGLE_CLIENT_ID;
  if (!clientId || typeof clientId !== 'string') {
    console.warn('[auth] GOOGLE_CLIENT_ID not configured');
    return jsonError(503, 'unavailable');
  }

  const adminEmails = parseAdminEmails(env);
  if (!adminEmails.length) {
    console.warn('[auth] ADMIN_EMAILS not configured');
    return jsonError(503, 'unavailable');
  }

  const cacheKey = await sha256Hex(token);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) {
    if (!adminEmails.includes(cached.email)) return jsonError(403, 'not_admin');
    return { email: cached.email };
  }

  let info;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TOKENINFO_TIMEOUT_MS);
    const res = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return jsonError(401, 'invalid_token');
    info = await res.json();
  } catch (err) {
    console.warn('[auth] tokeninfo failed');
    return jsonError(401, 'invalid_token');
  }

  const aud = info.aud || info.azp;
  if (aud !== clientId) return jsonError(403, 'wrong_audience');

  const expiresIn = Number(info.expires_in);
  if (!(expiresIn > 0)) return jsonError(401, 'invalid_token');

  if (!info.email) return jsonError(403, 'email_scope_required');
  if (String(info.email_verified) !== 'true') return jsonError(403, 'not_admin');

  const email = String(info.email).toLowerCase();
  if (!adminEmails.includes(email)) return jsonError(403, 'not_admin');

  tokenCache.set(cacheKey, { email, exp: Date.now() + Math.min(CACHE_TTL_MS, expiresIn * 1000) });

  // Opportunistic prune
  if (tokenCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of tokenCache) {
      if (v.exp <= now) tokenCache.delete(k);
    }
  }

  return { email };
}

export { jsonError };

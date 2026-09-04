// Minimal Supabase client: anonymous auth + RPC calls, no library.
// The session (access/refresh token) lives in localStorage; the user is an
// anonymous Supabase Auth user that can later be linked to an e-mail address.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const LS_SESSION = 'snackmageddon.session';
let session = null;

function loadSession() {
  if (session) return session;
  try { session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null'); } catch { session = null; }
  return session;
}
function saveSession(s) {
  session = s;
  try { if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s)); else localStorage.removeItem(LS_SESSION); } catch { /* ignore */ }
}

async function authFetch(path, method, body, token) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.error || data.message || `auth ${res.status}`);
  return data;
}
async function authRequest(path, body) {
  const data = await authFetch(path, 'POST', body);
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000, user_id: data.user?.id };
}
function jwtSub(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch { return null; }
}
let userCache = null;
let pendingToken = null;

export const online = {
  available() { return !!(SUPABASE_URL && SUPABASE_KEY); },
  userId() { return loadSession()?.user_id || null; },

  // Returns a valid access token, signing in anonymously the first time and
  // refreshing when needed.
  async token() {
    const s = loadSession();
    if (s && s.expires_at - Date.now() > 60000) return s.access_token;
    // several callers at start-up must share one sign-in, not create one account each
    if (!pendingToken) pendingToken = this.freshToken().finally(() => { pendingToken = null; });
    return pendingToken;
  },
  async freshToken() {
    let s = loadSession();
    if (s?.refresh_token) {
      try { s = await authRequest('token?grant_type=refresh_token', { refresh_token: s.refresh_token }); saveSession(s); return s.access_token; }
      catch { saveSession(null); }
    }
    s = await authRequest('signup', {}); // anonymous sign-in (must be enabled in the project's auth settings)
    if (!s.user_id) throw new Error('anonymous sign-in is disabled');
    saveSession(s);
    return s.access_token;
  },

  async rpc(name, args = {}) {
    const token = await this.token();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error((data && (data.message || data.hint || data.error)) || `rpc ${name} ${res.status}`);
    return data;
  },

  signOut() { saveSession(null); userCache = null; },

  // ---------- e-mail linking ----------
  // The anonymous account gets an e-mail address (Supabase sends a confirmation
  // link). Once confirmed the account is permanent and can be signed into on
  // any device with a login link to the same address.
  async user(fresh = false) {
    if (userCache && !fresh) return userCache;
    const token = await this.token();
    const u = await authFetch('user', 'GET', undefined, token);
    userCache = { id: u.id, email: u.email || null, pendingEmail: u.new_email || null, anonymous: u.is_anonymous !== false && !u.email };
    return userCache;
  },
  async linkEmail(email, redirectTo) {
    const token = await this.token();
    await authFetch(`user?redirect_to=${encodeURIComponent(redirectTo)}`, 'PUT', { email }, token);
    userCache = null;
  },
  // Login link for an existing account. Never creates a user, so a typo cannot start a new account.
  async sendLoginLink(email, redirectTo) {
    await authFetch(`otp?redirect_to=${encodeURIComponent(redirectTo)}`, 'POST', { email, create_user: false });
  },
  // Supabase sends the browser back with the session in the URL fragment
  // (#access_token=…&type=magiclink|email_change). Store it and clean the URL.
  // Returns the link type, 'error' with a message, or null when there was nothing.
  handleRedirect() {
    const h = location.hash.startsWith('#') ? location.hash.slice(1) : '';
    if (!h) return null;
    const q = new URLSearchParams(h);
    if (!q.get('access_token') && !q.get('error')) return null;
    history.replaceState(null, '', location.pathname + location.search);
    if (q.get('error')) return { type: 'error', message: q.get('error_description') || q.get('error') };
    const access = q.get('access_token');
    saveSession({ access_token: access, refresh_token: q.get('refresh_token'), expires_at: Date.now() + (+q.get('expires_in') || 3600) * 1000, user_id: jwtSub(access) });
    userCache = null;
    return { type: q.get('type') || 'unknown' };
  },
  // userId() may be unknown right after a redirect (no JWT payload); ask the server once
  async ensureUserId() {
    const s = loadSession();
    if (s && !s.user_id) { const u = await this.user(true); s.user_id = u.id; saveSession(s); }
    return loadSession()?.user_id || null;
  },
};

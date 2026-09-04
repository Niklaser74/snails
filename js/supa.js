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

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.error || `auth ${res.status}`);
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000, user_id: data.user?.id };
}

export const online = {
  available() { return !!(SUPABASE_URL && SUPABASE_KEY); },
  userId() { return loadSession()?.user_id || null; },

  // Returns a valid access token, signing in anonymously the first time and
  // refreshing when needed.
  async token() {
    let s = loadSession();
    if (s && s.expires_at - Date.now() > 60000) return s.access_token;
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

  signOut() { saveSession(null); },
};

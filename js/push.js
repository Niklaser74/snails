// Web Push for Snigelpost: subscribe this browser and ask the server to
// notify the opponent after a turn.
import { VAPID_PUBLIC_KEY, SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { online } from './supa.js';

function keyBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const push = {
  supported() {
    return !!VAPID_PUBLIC_KEY && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },
  // iOS only allows push for apps installed on the home screen
  needsInstall() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    return ios && !standalone;
  },
  permission() { return typeof Notification === 'undefined' ? 'denied' : Notification.permission; },
  async current() {
    try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; }
  },
  async subscribe(lang) {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    await online.rpc('snails_save_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_lang: lang });
    return sub;
  },
  // Ask the server to notify the other player. Fire and forget.
  async notify(matchId, event) {
    try {
      const token = await online.token();
      await fetch(`${SUPABASE_URL}/functions/v1/notify-turn`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, event }),
        keepalive: true,
      });
    } catch { /* notifications are best effort */ }
  },
};

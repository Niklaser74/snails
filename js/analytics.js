// Privacy-friendly usage counter backed by a Supabase table.
//
// What is stored: an anonymous random client id (localStorage), a per-page-load
// session id, the event name, a few numbers about the match, app version and
// UI language. No names, no IP addresses in the table, no cookies.
//
// Disabled on localhost, with ?noanalytics, and when the browser sends
// Do Not Track or Global Privacy Control. Events are queued in localStorage
// and sent in batches, so offline play is counted when the app is back online.
import { SUPABASE_URL, SUPABASE_KEY, APP_VERSION } from './config.js';

const LS_ID = 'snackmageddon.cid';
const LS_QUEUE = 'snackmageddon.queue';
const MAX_QUEUE = 200;

let enabled = null;
let clientId = null;
let sessionId = null;
let queue = [];
let flushing = false;
let lang = 'sv';

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export function analyticsEnabled() {
  if (enabled !== null) return enabled;
  enabled = true;
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) enabled = false;
    else if (typeof location === 'undefined') enabled = false;
    else if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') enabled = false;
    else if (new URLSearchParams(location.search).has('noanalytics')) enabled = false;
    else if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) enabled = false;
  } catch { enabled = false; }
  return enabled;
}

export function initAnalytics(uiLang) {
  lang = uiLang;
  if (!analyticsEnabled()) return;
  try {
    clientId = localStorage.getItem(LS_ID);
    if (!clientId) { clientId = uuid(); localStorage.setItem(LS_ID, clientId); }
    queue = JSON.parse(localStorage.getItem(LS_QUEUE) || '[]');
  } catch { clientId = clientId || uuid(); queue = []; }
  sessionId = uuid();
  addEventListener('online', flush);
  addEventListener('pagehide', () => flush(true));
  flush();
}

export function setAnalyticsLang(l) { lang = l; }

// track('match_end', { turns: 12, winner: 'human' })
export function track(event, props = {}) {
  if (!analyticsEnabled() || !sessionId) return;
  queue.push({
    event,
    props,
    client_id: clientId,
    session_id: sessionId,
    app_version: APP_VERSION,
    lang,
    created_at: new Date().toISOString(),
  });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  persist();
  flush();
}

function persist() {
  try { localStorage.setItem(LS_QUEUE, JSON.stringify(queue)); } catch { /* full or blocked: events stay in memory */ }
}

async function flush(unloading = false) {
  if (!analyticsEnabled() || flushing || queue.length === 0) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const batch = queue.splice(0, queue.length);
  persist();
  flushing = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/snails_events`, {
      method: 'POST',
      keepalive: unloading,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok && res.status !== 400 && res.status !== 401 && res.status !== 403) throw new Error(String(res.status));
    // 4xx: the server rejected the rows (schema or policy), dropping them is the right call
  } catch {
    queue.unshift(...batch); // network trouble: try again later
    persist();
  } finally {
    flushing = false;
  }
}

// exposed for tests
export const _internal = { get queue() { return queue; }, reset() { enabled = null; queue = []; sessionId = null; } };

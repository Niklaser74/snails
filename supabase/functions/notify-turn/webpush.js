// Web Push without dependencies: VAPID (RFC 8292) and payload encryption
// (RFC 8291, aes128gcm). Plain WebCrypto, so it runs in Deno (edge function)
// and in Node 22 (tests) unchanged.

const enc = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt, ikm, info, bits) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits));
}

// VAPID Authorization header for one push service origin.
// vapid = { publicKey: base64url raw 65 bytes, jwk: private key as JWK }
export async function vapidAuthorization(endpoint, vapid, subject, ttlSeconds = 12 * 3600) {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + ttlSeconds, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

// Encrypt a payload for a subscription (RFC 8291). Returns the request body.
export async function encryptPayload(subscription, payloadText) {
  const userPub = b64urlDecode(subscription.keys.p256dh);
  const authSecret = b64urlDecode(subscription.keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const userKey = await crypto.subtle.importKey('raw', userPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: userKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), userPub, localPub), 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96);
  const plain = concat(enc.encode(payloadText), new Uint8Array([2])); // single record, delimiter 0x02
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([localPub.length]), localPub, cipher);
}

// Send one notification. Resolves to the HTTP status (201 = accepted;
// 404/410 = subscription is gone and should be deleted).
export async function sendPush(subscription, payload, vapid, subject, fetchImpl = fetch) {
  const body = await encryptPayload(subscription, JSON.stringify(payload));
  const res = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });
  return res.status;
}

// --- test helper: decrypt what encryptPayload produced (the browser's side) ---
export async function decryptPayload(body, userKeyPair, authSecret) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const localPub = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const userPub = new Uint8Array(await crypto.subtle.exportKey('raw', userKeyPair.publicKey));
  const localKey = await crypto.subtle.importKey('raw', localPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: localKey }, userKeyPair.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), userPub, localPub), 256);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));
  return new TextDecoder().decode(plain.slice(0, plain.length - 1));
}

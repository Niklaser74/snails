// Stripe webhook signature check (Stripe-Signature: t=…,v1=…). Plain WebCrypto
// so the same code runs in Deno and in the Node tests.
const enc = new TextEncoder();
function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
export async function signPayload(secret, timestamp, payload) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${payload}`)));
}
// Returns true when one of the v1 signatures matches and the timestamp is fresh.
export async function verifyStripeSignature(header, payload, secret, now = Date.now() / 1000, tolerance = 300) {
  if (!header) return false;
  const parts = Object.create(null);
  for (const p of header.split(',')) { const [k, v] = p.split('='); if (!parts[k]) parts[k] = []; parts[k].push(v); }
  const t = Number(parts.t?.[0]);
  if (!t || Math.abs(now - t) > tolerance) return false;
  const expected = await signPayload(secret, t, payload);
  let ok = false;
  for (const sig of parts.v1 || []) {
    if (sig.length !== expected.length) continue;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff === 0) ok = true;
  }
  return ok;
}

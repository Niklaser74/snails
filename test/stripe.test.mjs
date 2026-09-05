// The Stripe webhook signature check, same code as the edge function.
import assert from 'node:assert/strict';
import { signPayload, verifyStripeSignature } from '../supabase/functions/stripe-webhook/verify.js';

const secret = 'whsec_test_secret';
const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid' } } });
const now = 1_800_000_000;
const sig = await signPayload(secret, now, payload);
assert.match(sig, /^[0-9a-f]{64}$/);
assert.equal(await verifyStripeSignature(`t=${now},v1=${sig}`, payload, secret, now), true, 'valid signature');
assert.equal(await verifyStripeSignature(`t=${now},v1=${sig},v1=deadbeef`, payload, secret, now), true, 'several v1 entries');
assert.equal(await verifyStripeSignature(`t=${now},v1=${sig}`, payload + ' ', secret, now), false, 'tampered payload');
assert.equal(await verifyStripeSignature(`t=${now},v1=${sig}`, payload, 'other', now), false, 'wrong secret');
assert.equal(await verifyStripeSignature(`t=${now},v1=${sig}`, payload, secret, now + 600), false, 'stale timestamp');
assert.equal(await verifyStripeSignature(null, payload, secret, now), false, 'missing header');
assert.equal(await verifyStripeSignature(`t=${now},v0=${sig}`, payload, secret, now), false, 'no v1');
console.log('ok   stripe webhook signature check');

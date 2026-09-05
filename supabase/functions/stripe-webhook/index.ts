// Stripe webhook: a paid Checkout session grants the bought cosmetic.
// No JWT here (Stripe calls it), the Stripe-Signature header is the auth.
import { verifyStripeSignature } from './verify.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const ITEMS = ['gold', 'tophat'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (!WEBHOOK_SECRET) return new Response('webhook secret not configured', { status: 503 });
  const payload = await req.text();
  if (!(await verifyStripeSignature(req.headers.get('stripe-signature'), payload, WEBHOOK_SECRET))) return new Response('bad signature', { status: 400 });
  const event = JSON.parse(payload);
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return new Response('ignored', { status: 200 });
  const s = event.data?.object || {};
  if (s.payment_status !== 'paid') return new Response('not paid', { status: 200 });
  const user = s.client_reference_id, item = s.metadata?.item;
  if (!user || !ITEMS.includes(item)) return new Response('missing user or item', { status: 400 });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/snails_grant_purchase`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user: user, p_item: item, p_session: s.id, p_amount: s.amount_total ?? null, p_currency: s.currency ?? null }),
  });
  if (!res.ok) return new Response('grant failed: ' + (await res.text()), { status: 500 });
  return new Response('ok', { status: 200 });
});

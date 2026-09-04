// In-memory stand-in for the Supabase endpoints the game uses, with the same
// rules as supabase/migrations/*.sql. Installed on a Playwright page with
// page.route so browser tests never touch the network.
export function createFakeSupabase() {
  const users = new Map(); // token -> user id
  const matches = new Map();
  const turns = new Map(); // match id -> [turns]
  const events = [];
  const pushes = []; // saved subscriptions
  const notifies = []; // calls to the notify-turn function
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const err = (message, status = 400) => ({ status, body: { message } });
  const view = (m, uid) => ({ ...m, turns: undefined, my_team: m.host === uid ? 0 : m.guest === uid ? 1 : null });

  const rpc = {
    snails_create_match(uid, a) {
      const m = { id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), rules_version: a.p_rules_version, seed: a.p_seed, config: a.p_config, names: { 0: a.p_name || 'Värd' }, host: uid, guest: null, status: 'open', turn_team: 0, turn_count: 0, tick_count: 0, winner: null, last_hash: null };
      matches.set(m.id, m); turns.set(m.id, []);
      return view(m, uid);
    },
    snails_join_match(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      if (m.host === uid || m.guest === uid) return view(m, uid);
      if (m.guest) throw err('match is full');
      m.guest = uid; m.status = 'playing'; m.names = { ...m.names, 1: a.p_name || 'Gäst' }; m.updated_at = new Date().toISOString();
      return view(m, uid);
    },
    snails_get_match(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      if (m.status !== 'open' && m.host !== uid && m.guest !== uid) throw err('not your match');
      return { ...view(m, uid), turns: turns.get(m.id).map((t) => ({ ...t })) };
    },
    snails_my_matches(uid) {
      return [...matches.values()].filter((m) => m.host === uid || m.guest === uid).map((m) => view(m, uid));
    },
    snails_submit_turn(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      const my = m.host === uid ? 0 : m.guest === uid ? 1 : null;
      if (my == null) throw err('not your match');
      if (m.status === 'finished') throw err('match is finished');
      if (m.status === 'open' && !(my === 0 && a.p_turn_no === 1)) throw err('waiting for an opponent');
      if (m.turn_team !== my) throw err('not your turn');
      if (a.p_turn_no !== m.turn_count + 1) throw err('turn out of order');
      if (a.p_start_tick !== m.tick_count) throw err('wrong start tick');
      if (a.p_end_tick <= a.p_start_tick) throw err('bad tick range');
      turns.get(m.id).push({ turn_no: a.p_turn_no, team: my, start_tick: a.p_start_tick, end_tick: a.p_end_tick, inputs: a.p_inputs, state_hash: a.p_state_hash });
      m.turn_count = a.p_turn_no; m.tick_count = a.p_end_tick; m.turn_team = 1 - my; m.last_hash = a.p_state_hash;
      if (a.p_finished) { m.status = 'finished'; m.winner = a.p_winner; }
      m.updated_at = new Date().toISOString();
      return view(m, uid);
    },
    snails_save_push(uid, a) { pushes.push({ uid, endpoint: a.p_endpoint, lang: a.p_lang }); return null; },
    snails_remove_push(uid, a) { const i = pushes.findIndex((p) => p.endpoint === a.p_endpoint && p.uid === uid); if (i >= 0) pushes.splice(i, 1); return null; },
    snails_delete_match(uid, a) { const m = matches.get(a.p_match); if (m && (m.host === uid || m.guest === uid)) { matches.delete(m.id); turns.delete(m.id); } return null; },
  };

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    try {
      if (url.pathname.startsWith('/auth/v1/')) {
        const id = uuid();
        users.set('tok-' + id, id);
        return json(200, { access_token: 'tok-' + id, refresh_token: 'ref-' + id, expires_in: 3600, user: { id } });
      }
      if (url.pathname === '/rest/v1/snails_events') { events.push(...JSON.parse(req.postData() || '[]')); return json(201, []); }
      if (url.pathname === '/functions/v1/notify-turn') {
        const token = (req.headers()['authorization'] || '').replace('Bearer ', '');
        if (!users.get(token)) return json(401, { error: 'not signed in' });
        notifies.push({ uid: users.get(token), ...JSON.parse(req.postData() || '{}') });
        return json(200, { sent: 1 });
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').pop();
        const token = (req.headers()['authorization'] || '').replace('Bearer ', '');
        const uid = users.get(token);
        if (!uid) return json(401, { message: 'not signed in' });
        if (!rpc[name]) return json(404, { message: 'no such function ' + name });
        const args = JSON.parse(req.postData() || '{}');
        return json(200, rpc[name](uid, args));
      }
      return json(404, { message: 'unhandled ' + url.pathname });
    } catch (e) {
      if (e.status) return json(e.status, e.body);
      return json(500, { message: String(e.message || e) });
    }
  }

  return { handle, matches, turns, events, pushes, notifies, install: (page) => page.route('**/*.supabase.co/**', handle) };
}

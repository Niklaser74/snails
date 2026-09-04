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

  const series = new Map();
  const seriesView = (sid, uid) => {
    const s = series.get(sid); if (!s) return null;
    const me = s.host === uid;
    return { id: s.id, best_of: s.best_of, match_no: s.match_no, status: s.status, current_match: s.current_match,
      won_by_me: !!s.winner_user && s.winner_user === uid, wins_me: me ? s.wins_host : s.wins_guest, wins_them: me ? s.wins_guest : s.wins_host };
  };
  const mview = (m, uid) => ({ ...view(m, uid), match_no: m.match_no || 1, series: m.series_id ? seriesView(m.series_id, uid) : null });
  const newMatch = (fields) => { const m = { id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), turn_team: 0, turn_count: 0, tick_count: 0, winner: null, last_hash: null, guest: null, status: 'open', match_no: 1, series_id: null, ...fields }; matches.set(m.id, m); turns.set(m.id, []); return m; };
  const nextMatch = (s, prev) => {
    const n = newMatch({ rules_version: prev.rules_version, seed: 4321 + s.match_no, config: prev.config, names: { 0: prev.names[1], 1: prev.names[0] }, host: prev.guest, guest: prev.host, status: 'playing', series_id: s.id, match_no: s.match_no + 1 });
    s.match_no = n.match_no; s.current_match = n.id; s.updated_at = new Date().toISOString();
    return n;
  };
  const afterFinish = (m) => {
    const s = series.get(m.series_id); if (!s || s.status === 'finished' || s.current_match !== m.id) return;
    if (m.winner != null) { const w = m.winner === 0 ? m.host : m.guest; if (w === s.host) s.wins_host++; else s.wins_guest++; }
    const needed = Math.floor(s.best_of / 2) + 1;
    if (s.wins_host >= needed || s.wins_guest >= needed || (m.winner == null && s.best_of === 1)) {
      s.status = 'finished'; s.winner_user = s.wins_host >= needed ? s.host : s.wins_guest >= needed ? s.guest : null;
    } else nextMatch(s, m);
    s.updated_at = new Date().toISOString();
  };
  const myTeam = (m, uid) => (m.host === uid ? 0 : m.guest === uid ? 1 : null);

  const rpc = {
    snails_create_match(uid, a) {
      const s = { id: uuid(), host: uid, guest: null, names: { 0: a.p_name || 'Värd' }, best_of: a.p_best_of ?? 3, wins_host: 0, wins_guest: 0, match_no: 1, current_match: null, status: 'open', winner_user: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      series.set(s.id, s);
      const m = newMatch({ rules_version: a.p_rules_version, seed: a.p_seed, config: a.p_config, names: { ...s.names }, host: uid, series_id: s.id });
      s.current_match = m.id;
      return mview(m, uid);
    },
    snails_join_match(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      if (m.host === uid || m.guest === uid) return mview(m, uid);
      if (m.guest) throw err('match is full');
      const nm = a.p_name || 'Gäst';
      m.guest = uid; m.status = 'playing'; m.names = { ...m.names, 1: nm }; m.updated_at = new Date().toISOString();
      const s = series.get(m.series_id); if (s && !s.guest) { s.guest = uid; s.status = 'playing'; s.names = { ...s.names, 1: nm }; }
      return mview(m, uid);
    },
    snails_get_match(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      if (m.status !== 'open' && m.host !== uid && m.guest !== uid) throw err('not your match');
      return { ...mview(m, uid), turns: turns.get(m.id).map((t) => ({ ...t })) };
    },
    snails_my_matches(uid) {
      return [...matches.values()].filter((m) => (m.host === uid || m.guest === uid) && (!m.series_id || series.get(m.series_id)?.current_match === m.id)).map((m) => mview(m, uid));
    },
    snails_submit_turn(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      const my = myTeam(m, uid);
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
      if (a.p_finished) afterFinish(m);
      return mview(m, uid);
    },
    snails_resign(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      const my = myTeam(m, uid); if (my == null) throw err('not your match');
      if (m.status === 'finished') return mview(m, uid);
      if (m.status === 'open') { series.delete(m.series_id); matches.delete(m.id); turns.delete(m.id); return null; }
      m.status = 'finished'; m.winner = 1 - my; m.updated_at = new Date().toISOString();
      afterFinish(m);
      return mview(m, uid);
    },
    snails_claim_timeout(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      const my = myTeam(m, uid); if (my == null) throw err('not your match');
      if (m.status !== 'playing') throw err('match is not in play');
      if (m.turn_team === my) throw err('it is your turn');
      if (Date.now() - new Date(m.updated_at).getTime() < 14 * 86400000) throw err('opponent still has time');
      m.status = 'finished'; m.winner = my; m.updated_at = new Date().toISOString();
      afterFinish(m);
      return mview(m, uid);
    },
    snails_rematch(uid, a) {
      const m = matches.get(a.p_match); if (!m) throw err('no such match');
      const my = myTeam(m, uid); if (my == null) throw err('not your match');
      const s = m.series_id ? series.get(m.series_id) : null;
      if (s && s.status !== 'finished') return mview(matches.get(s.current_match), uid);
      if (!s && m.status !== 'finished') throw err('match is not finished');
      const other = my === 0 ? m.guest : m.host; if (!other) throw err('no opponent');
      const names = { 0: m.names[my], 1: m.names[1 - my] };
      const ns = { id: uuid(), host: uid, guest: other, names, best_of: s ? s.best_of : 1, wins_host: 0, wins_guest: 0, match_no: 1, current_match: null, status: 'playing', winner_user: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      series.set(ns.id, ns);
      const n = newMatch({ rules_version: a.p_rules_version, seed: 4321, config: m.config, names, host: uid, guest: other, status: 'playing', series_id: ns.id });
      ns.current_match = n.id;
      return mview(n, uid);
    },
    snails_extend_series(uid, a) {
      const m = matches.get(a.p_match); if (!m || !m.series_id) throw err('no such match');
      if (myTeam(m, uid) == null) throw err('not your match');
      const s = series.get(m.series_id);
      if (s.status !== 'finished') throw err('series is not finished');
      if (s.best_of >= a.p_best_of) throw err('series is already that long');
      const needed = Math.floor(a.p_best_of / 2) + 1;
      if (s.wins_host >= needed || s.wins_guest >= needed) throw err('series would already be decided');
      s.best_of = a.p_best_of; s.status = 'playing'; s.winner_user = null;
      const n = nextMatch(s, matches.get(s.current_match));
      return mview(n, uid);
    },
    snails_delete_match(uid, a) {
      const m = matches.get(a.p_match); if (!m || (m.host !== uid && m.guest !== uid)) return null;
      if (m.series_id) { for (const [id, x] of matches) if (x.series_id === m.series_id) { matches.delete(id); turns.delete(id); } series.delete(m.series_id); }
      else { matches.delete(m.id); turns.delete(m.id); }
      return null;
    },
    snails_save_push(uid, a) { pushes.push({ uid, endpoint: a.p_endpoint, lang: a.p_lang }); return null; },
    snails_remove_push(uid, a) { const i = pushes.findIndex((p) => p.endpoint === a.p_endpoint && p.uid === uid); if (i >= 0) pushes.splice(i, 1); return null; },
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

  return { handle, matches, turns, series, events, pushes, notifies, install: (page) => page.route('**/*.supabase.co/**', handle) };
}

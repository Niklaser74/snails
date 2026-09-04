// Snigelpost: asynchronous matches on top of the deterministic simulation.
// A match on the server is a seed plus one row of recorded inputs per turn.
// Opening a match replays every turn (instantly, or visibly for the opponent's
// last turn), then this device plays its own turn live and uploads the inputs.
import { online } from './supa.js';
import { Game, RULES_VERSION } from './game.js';
import { TEAM_COLORS } from './snails.js';

export const snigelpost = {
  available() { return online.available(); },

  async create(snailsPerTeam, name) {
    return online.rpc('snails_create_match', {
      p_seed: (Math.random() * 2147483647) | 0,
      p_config: { snailsPerTeam },
      p_name: name,
      p_rules_version: RULES_VERSION,
    });
  },
  async join(id, name) { return online.rpc('snails_join_match', { p_match: id, p_name: name }); },
  async get(id) { return online.rpc('snails_get_match', { p_match: id }); },
  async list() { return online.rpc('snails_my_matches'); },
  async remove(id) { return online.rpc('snails_delete_match', { p_match: id }); },

  async submit(match, game, startTick, finished, winnerTeam) {
    return online.rpc('snails_submit_turn', {
      p_match: match.id,
      p_turn_no: match.turn_count + 1,
      p_start_tick: startTick,
      p_end_tick: game.tickCount,
      p_inputs: game.inputsSince(startTick),
      p_state_hash: game.stateHash(),
      p_finished: !!finished,
      p_winner: finished && winnerTeam != null ? winnerTeam : null,
    });
  },

  inviteLink(id) {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('match', id);
    return u.toString();
  },

  // Team setup shared by every device in the match. Style is a local choice.
  config(match, style) {
    return {
      seed: match.seed,
      snailsPerTeam: match.config.snailsPerTeam || 3,
      style,
      teams: [
        { name: match.names?.['0'] || 'Värd', color: TEAM_COLORS[0].hex, ai: false },
        { name: match.names?.['1'] || '…', color: TEAM_COLORS[1].hex, ai: false },
      ],
    };
  },

  // Build the Game for a match as seen from this device. Returns the game plus
  // the tick where the opponent's latest turn starts (for a visible replay).
  buildGame(canvas, match, hooks, style) {
    if (match.rules_version !== RULES_VERSION) throw new Error('rules');
    const cfg = this.config(match, style);
    const myTeam = match.my_team;
    const turns = match.turns || [];
    const inputs = turns.flatMap((t) => t.inputs);
    const opts = { localTeams: myTeam == null ? [] : [myTeam] };
    if (turns.length) {
      opts.replay = { rulesVersion: RULES_VERSION, seed: match.seed, teams: cfg.teams, snailsPerTeam: cfg.snailsPerTeam, inputs };
      opts.liveAfter = match.tick_count;
    }
    const game = new Game(canvas, cfg, hooks, opts);
    const last = turns[turns.length - 1];
    const replayFrom = last && last.team !== myTeam ? last.start_tick : match.tick_count;
    return { game, myTeam, replayFrom, expectedHash: match.last_hash };
  },
};

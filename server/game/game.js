// Game state machine: applyAction(state, action, ctx) → { ok, state, events } | { ok: false, error }.
// Pure: no I/O, no implicit clock or randomness (both come from `ctx`), input state is never mutated.

import {
  MAX_PLAYERS,
  MAX_TIMER_SECONDS,
  MODES,
  PHASES,
  ROLES,
  WINNERS,
  isMode,
  own,
  teamOf,
} from './constants.js';
import { nameKey, normalizeName } from './names.js';
import { assignRoles, effectiveMafiaCount, maxMafiaCount, validateSetup } from './roles.js';
import { nightRequestsNeeded, tallyVote } from './day.js';
import { resolveNight } from './night.js';
import { checkWinner, computeScores } from './victory.js';
import { cryptoRng } from './rng.js';

// Ids start with a letter or digit, so keys such as __proto__ can never be used.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const LOG_LIMIT = 5000;
const IN_GAME = [PHASES.DAWN, PHASES.DAY, PHASES.NIGHT];

const isId = (value) => typeof value === 'string' && ID_PATTERN.test(value);
const emptyDay = () => ({ accusations: [], vote: null, nightRequests: [] });
const emptyNight = () => ({ ballots: {}, abilities: {} });

function newPlayer(id, name) {
  return {
    id,
    name,
    role: null,
    alive: true,
    eliminatedRound: null,
    eliminatedPhase: null,
    eliminatedBy: null, // 'vote' | 'night' | 'narrator'
  };
}

function resetProgress(state) {
  state.day = emptyDay();
  state.night = emptyNight();
  state.lastNight = null;
  state.doctorLastTargetId = null;
  state.seerResults = [];
  state.history = [];
  state.timer = null;
  state.winner = null;
  state.scores = null;
}

export function createGame({ mode = MODES.ORIGINAL } = {}) {
  if (!isMode(mode)) throw new TypeError(`Unknown mode: ${mode}`);
  const state = {
    mode,
    phase: PHASES.LOBBY,
    round: 0, // a round is one Day + Night cycle; dawn belongs to round 1
    gameNumber: 1, // increases with each rematch in the same room
    config: { mafiaCount: null, showVotes: true, showScore: true },
    players: [],
    initial: null, // { playerCount, mafiaCount, honestCount } when the game starts
    scoreboard: {}, // cumulative points across games in this room
    log: [],
    nextSeq: 1,
    nextId: 1,
  };
  resetProgress(state);
  return state;
}

// ---------------------------------------------------------------------------
// Entry point

export function applyAction(state, action, ctx = {}) {
  if (!action || typeof action !== 'object') return fail('INVALID_PAYLOAD');
  const handler = typeof action.type === 'string' && Object.hasOwn(HANDLERS, action.type)
    ? HANDLERS[action.type]
    : null;
  if (!handler) return fail('UNKNOWN_ACTION');

  const next = structuredClone(state);
  let me = null;
  if (handler.actor === 'narrator') {
    if (action.actor?.kind !== 'narrator') return fail('NOT_NARRATOR');
  } else if (handler.actor === 'player') {
    if (action.actor?.kind !== 'player') return fail('NOT_PLAYER');
    me = next.players.find((p) => p.id === action.actor.id);
    if (!me) return fail('UNKNOWN_PLAYER');
  }

  const events = [];
  const env = {
    rng: ctx.rng ?? cryptoRng,
    now: Number.isFinite(ctx.now) ? ctx.now : 0,
    emit(type, data = {}) {
      const entry = {
        seq: next.nextSeq++,
        game: next.gameNumber,
        round: next.round,
        phase: next.phase,
        type,
        data,
        at: env.now,
      };
      next.log.push(entry);
      if (next.log.length > LOG_LIMIT) next.log.shift();
      events.push(entry);
    },
  };

  const error = handler.run(next, action, env, me);
  if (error) return fail(error);
  return { ok: true, state: next, events };
}

function fail(error) {
  return { ok: false, error };
}

const narrator = (run) => ({ actor: 'narrator', run });
const player = (run) => ({ actor: 'player', run });
const joining = (run) => ({ actor: 'joining', run });

// ---------------------------------------------------------------------------
// Shared helpers

const findPlayer = (state, id) => (isId(id) ? state.players.find((p) => p.id === id) ?? null : null);
const aliveCount = (state) => state.players.filter((p) => p.alive).length;

function aliveNightRequests(state) {
  return state.day.nightRequests.filter((id) => findPlayer(state, id)?.alive);
}

function removeFromLobby(state, playerId) {
  state.players = state.players.filter((p) => p.id !== playerId);
  delete state.scoreboard[playerId];
}

function eliminate(state, target, cause, env) {
  target.alive = false;
  target.eliminatedRound = state.round;
  target.eliminatedPhase = state.phase;
  target.eliminatedBy = cause;

  const { day, night } = state;
  day.accusations = day.accusations.filter((a) => a.accuserId !== target.id && a.targetId !== target.id);
  day.nightRequests = day.nightRequests.filter((id) => id !== target.id);
  if (day.vote) {
    if (day.vote.accusedId === target.id) {
      env.emit('vote_cancelled', { voteId: day.vote.id, reason: 'accused_removed' });
      day.vote = null;
    } else if (day.vote.status === 'open') {
      delete day.vote.ballots[target.id];
    }
  }
  delete night.ballots[target.id];
  delete night.abilities[target.id];

  env.emit('player_eliminated', { playerId: target.id, cause });
}

/** Ends the game if a team has won. Returns true when it did. */
function endIfWinner(state, env) {
  const winner = checkWinner(state.players);
  if (!winner) return false;
  endGame(state, winner, 'victory', env);
  return true;
}

function endGame(state, winner, reason, env) {
  state.phase = PHASES.ENDED;
  state.winner = winner;
  state.timer = null;
  state.day.vote = null;
  state.scores = computeScores(state, winner);
  for (const [id, points] of Object.entries(state.scores)) {
    state.scoreboard[id] = (own(state.scoreboard, id) ?? 0) + points;
  }
  env.emit('game_ended', {
    winner,
    reason,
    scores: { ...state.scores },
    roles: Object.fromEntries(state.players.map((p) => [p.id, p.role])),
  });
}

function startDay(state, env, from) {
  state.phase = PHASES.DAY;
  state.day = emptyDay();
  state.night = emptyNight();
  state.timer = null;
  env.emit('phase_changed', { from, to: PHASES.DAY });
}

function closeNight(state, env) {
  const outcome = resolveNight(state);
  const doctor = state.mode === MODES.CLASSIC
    ? state.players.find((p) => p.alive && p.role === ROLES.DOCTOR)
    : null;
  state.doctorLastTargetId = doctor ? own(state.night.abilities, doctor.id) ?? null : null;
  state.lastNight = { round: state.round, ...outcome };
  state.history.push({ round: state.round, phase: PHASES.NIGHT, type: 'night', ...outcome });
  env.emit('night_resolved', {
    ...outcome,
    ballots: { ...state.night.ballots },
    abilities: { ...state.night.abilities },
  });

  if (outcome.victimId) {
    eliminate(state, findPlayer(state, outcome.victimId), 'night', env);
    if (endIfWinner(state, env)) return;
  }
  state.round += 1;
  startDay(state, env, PHASES.NIGHT);
}

// ---------------------------------------------------------------------------
// Action handlers. Each returns an error code, or nothing on success.

const HANDLERS = {
  // --- Lobby -----------------------------------------------------------------

  'player:join': joining((s, a, env) => {
    if (a.actor?.kind !== 'player' || !isId(a.actor.id)) return 'INVALID_PAYLOAD';
    if (s.phase !== PHASES.LOBBY) return 'GAME_IN_PROGRESS';
    const id = a.actor.id;
    if (s.players.some((p) => p.id === id)) return 'ALREADY_JOINED';
    if (s.players.length >= MAX_PLAYERS) return 'ROOM_FULL';
    const name = normalizeName(a.name);
    if (!name) return 'NAME_INVALID';
    if (s.players.some((p) => nameKey(p.name) === nameKey(name))) return 'NAME_TAKEN';
    s.players.push(newPlayer(id, name));
    if (!Object.hasOwn(s.scoreboard, id)) s.scoreboard[id] = 0;
    env.emit('player_joined', { playerId: id, name });
  }),

  'player:leave': player((s, a, env, me) => {
    if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
    removeFromLobby(s, me.id);
    env.emit('player_left', { playerId: me.id });
  }),

  // Lobby: kick. During the game: retire, which counts as an elimination (R12).
  'player:remove': narrator((s, a, env) => {
    const target = findPlayer(s, a.playerId);
    if (!target) return 'UNKNOWN_PLAYER';
    if (s.phase === PHASES.LOBBY) {
      removeFromLobby(s, target.id);
      env.emit('player_kicked', { playerId: target.id });
      return;
    }
    if (!IN_GAME.includes(s.phase)) return 'WRONG_PHASE';
    if (!target.alive) return 'PLAYER_DEAD';
    s.history.push({ round: s.round, phase: s.phase, type: 'retired', playerId: target.id });
    eliminate(s, target, 'narrator', env);
    endIfWinner(s, env);
  }),

  'game:configure': narrator((s, a, env) => {
    const changes = {};
    if (a.mode !== undefined) {
      if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
      if (!isMode(a.mode)) return 'INVALID_MODE';
      changes.mode = a.mode;
    }
    if (a.mafiaCount !== undefined) {
      if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
      const valid = a.mafiaCount === null
        || (Number.isInteger(a.mafiaCount) && a.mafiaCount >= 1 && a.mafiaCount <= maxMafiaCount(MAX_PLAYERS));
      if (!valid) return 'INVALID_MAFIA_COUNT';
      changes.mafiaCount = a.mafiaCount;
    }
    for (const key of ['showVotes', 'showScore']) {
      if (a[key] === undefined) continue;
      if (typeof a[key] !== 'boolean') return 'INVALID_PAYLOAD';
      changes[key] = a[key];
    }
    if (Object.keys(changes).length === 0) return 'INVALID_PAYLOAD';

    const { mode, ...config } = changes;
    if (mode) s.mode = mode;
    Object.assign(s.config, config);
    env.emit('config_changed', changes);
  }),

  'game:start': narrator((s, a, env) => {
    if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
    const playerCount = s.players.length;
    const mafiaCount = effectiveMafiaCount(s.config, playerCount);
    const error = validateSetup({ playerCount, mafiaCount, mode: s.mode });
    if (error) return error;

    const roles = assignRoles(s.players.map((p) => p.id), { mafiaCount, mode: s.mode }, env.rng);
    s.players = s.players.map((p) => ({ ...newPlayer(p.id, p.name), role: roles[p.id] }));
    s.initial = { playerCount, mafiaCount, honestCount: playerCount - mafiaCount };
    resetProgress(s);
    s.phase = PHASES.DAWN;
    s.round = 1;
    env.emit('game_started', { mode: s.mode, mafiaCount, roles });
  }),

  // --- Phases ------------------------------------------------------------------

  'phase:advance': narrator((s, a, env) => {
    const from = s.phase;
    const to = a.to;
    if (from === PHASES.DAWN && to === PHASES.DAY) {
      startDay(s, env, from);
      return;
    }
    if (from === PHASES.DAY && to === PHASES.NIGHT) {
      if (s.day.vote) return 'VOTE_IN_PROGRESS';
      if (s.mode === MODES.ORIGINAL && aliveNightRequests(s).length < nightRequestsNeeded(aliveCount(s))) {
        return 'NIGHT_NOT_REQUESTED';
      }
      s.phase = PHASES.NIGHT;
      s.day = emptyDay();
      s.night = emptyNight();
      s.timer = null;
      env.emit('phase_changed', { from, to });
      return;
    }
    if (from === PHASES.NIGHT && to === PHASES.DAY) {
      closeNight(s, env);
      return;
    }
    return 'INVALID_TRANSITION';
  }),

  'timer:set': narrator((s, a, env) => {
    if (!IN_GAME.includes(s.phase)) return 'WRONG_PHASE';
    const { seconds } = a;
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_TIMER_SECONDS) return 'INVALID_PAYLOAD';
    s.timer = seconds === 0 ? null : { seconds, endsAt: env.now + seconds * 1000 };
    env.emit('timer_set', { seconds });
  }),

  'game:end': narrator((s, a, env) => {
    if (!IN_GAME.includes(s.phase)) return 'WRONG_PHASE';
    endGame(s, WINNERS.NONE, 'narrator', env);
  }),

  // "New game with the same players": back to the lobby, scores accumulate (R9).
  'game:rematch': narrator((s, a, env) => {
    if (s.phase !== PHASES.ENDED) return 'WRONG_PHASE';
    s.players = s.players.map((p) => newPlayer(p.id, p.name));
    s.phase = PHASES.LOBBY;
    s.round = 0;
    s.gameNumber += 1;
    s.initial = null;
    s.log = [];
    resetProgress(s);
    env.emit('rematch_created', { gameNumber: s.gameNumber });
  }),

  // --- Day -------------------------------------------------------------------------

  'day:accuse': player((s, a, env, me) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    if (!me.alive) return 'PLAYER_DEAD';
    const target = findPlayer(s, a.targetId);
    if (!target || !target.alive || target.id === me.id) return 'TARGET_INVALID';
    const previous = s.day.accusations.find((x) => x.accuserId === me.id);
    if (previous?.targetId === target.id) return; // already pending
    // Each player keeps at most one pending accusation: a new one replaces it.
    s.day.accusations = s.day.accusations.filter((x) => x.accuserId !== me.id);
    const accusation = { id: `a${s.nextId++}`, accuserId: me.id, targetId: target.id, round: s.round };
    s.day.accusations.push(accusation);
    env.emit('accusation_made', { ...accusation });
  }),

  'day:dismissAccusation': narrator((s, a, env) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    const accusation = s.day.accusations.find((x) => x.id === a.accusationId);
    if (!accusation) return 'UNKNOWN_ACCUSATION';
    s.day.accusations = s.day.accusations.filter((x) => x.id !== accusation.id);
    env.emit('accusation_dismissed', { accusationId: accusation.id });
  }),

  'day:openVote': narrator((s, a, env) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    if (s.day.vote) return 'VOTE_IN_PROGRESS';
    const accusation = s.day.accusations.find((x) => x.id === a.accusationId);
    if (!accusation) return 'UNKNOWN_ACCUSATION';
    s.day.accusations = s.day.accusations.filter((x) => x.id !== accusation.id);
    s.day.vote = {
      id: `v${s.nextId++}`,
      accusedId: accusation.targetId,
      accuserId: accusation.accuserId,
      ballots: {},
      status: 'open',
      result: null,
    };
    env.emit('vote_opened', {
      voteId: s.day.vote.id,
      accusedId: accusation.targetId,
      accuserId: accusation.accuserId,
    });
  }),

  // guilty: true | false, or null to withdraw the ballot while the vote is open.
  'day:vote': player((s, a, env, me) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    const { vote } = s.day;
    if (!vote) return 'NO_ACTIVE_VOTE';
    if (vote.status !== 'open') return 'VOTE_CLOSED';
    if (!me.alive) return 'PLAYER_DEAD';
    if (me.id === vote.accusedId) return 'CANNOT_VOTE';
    if (a.guilty === null) delete vote.ballots[me.id];
    else if (typeof a.guilty === 'boolean') vote.ballots[me.id] = a.guilty;
    else return 'INVALID_PAYLOAD';
    env.emit('vote_cast', { voteId: vote.id, playerId: me.id, guilty: a.guilty });
  }),

  'day:closeVote': narrator((s, a, env) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    const { vote } = s.day;
    if (!vote) return 'NO_ACTIVE_VOTE';
    if (vote.status !== 'open') return 'VOTE_CLOSED';
    vote.status = 'closed';
    vote.result = tallyVote(vote, s.players);
    env.emit('vote_closed', { voteId: vote.id, accusedId: vote.accusedId, result: vote.result });
  }),

  // accept: true applies the result; false annuls the vote (no effect, logged).
  'day:confirm': narrator((s, a, env) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    const { vote } = s.day;
    if (!vote) return 'NO_ACTIVE_VOTE';
    if (vote.status !== 'closed') return 'VOTE_NOT_CLOSED';
    if (typeof a.accept !== 'boolean') return 'INVALID_PAYLOAD';
    s.day.vote = null;
    if (!a.accept) {
      env.emit('vote_cancelled', { voteId: vote.id, reason: 'narrator' });
      return;
    }
    const { result } = vote;
    s.history.push({
      round: s.round,
      phase: PHASES.DAY,
      type: 'vote',
      accusedId: vote.accusedId,
      accuserId: vote.accuserId,
      passed: result.passed,
      guiltyCount: result.guiltyCount,
      eligibleCount: result.eligibleCount,
      required: result.required,
    });
    env.emit('vote_confirmed', { voteId: vote.id, accusedId: vote.accusedId, passed: result.passed });
    if (result.passed) {
      eliminate(s, findPlayer(s, vote.accusedId), 'vote', env);
      endIfWinner(s, env);
    }
  }),

  // Original mode: the night is called by a majority of the living (R4).
  'night:request': player((s, a, env, me) => {
    if (s.mode !== MODES.ORIGINAL) return 'NOT_IN_MODE';
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    if (!me.alive) return 'PLAYER_DEAD';
    if (typeof a.wanted !== 'boolean') return 'INVALID_PAYLOAD';
    const requested = s.day.nightRequests.includes(me.id);
    if (a.wanted === requested) return; // nothing changes
    s.day.nightRequests = a.wanted
      ? [...s.day.nightRequests, me.id]
      : s.day.nightRequests.filter((id) => id !== me.id);
    env.emit('night_requested', {
      playerId: me.id,
      wanted: a.wanted,
      count: aliveNightRequests(s).length,
      needed: nightRequestsNeeded(aliveCount(s)),
    });
  }),

  // --- Night -----------------------------------------------------------------------

  // Mafiosi pick a victim; everyone else submits "Honesto" (targetId: null) (R5).
  'night:submit': player((s, a, env, me) => {
    if (s.phase !== PHASES.NIGHT) return 'WRONG_PHASE';
    if (!me.alive) return 'PLAYER_DEAD';
    if (me.role === ROLES.SEER || me.role === ROLES.DOCTOR) return 'USE_ABILITY';
    if (me.role === ROLES.MAFIA) {
      if (a.targetId === null || a.targetId === undefined) return 'MAFIA_MUST_CHOOSE';
      const target = findPlayer(s, a.targetId);
      if (!target || !target.alive || target.id === me.id || target.role === ROLES.MAFIA) {
        return 'TARGET_INVALID';
      }
      s.night.ballots[me.id] = target.id;
    } else {
      if (a.targetId !== null) return 'HONEST_CANNOT_CHOOSE';
      s.night.ballots[me.id] = null;
    }
    env.emit('night_ballot', { playerId: me.id, targetId: s.night.ballots[me.id] });
  }),

  // Classic variant only: seer checks a player, doctor protects one (V3, V4).
  'night:ability': player((s, a, env, me) => {
    if (s.mode !== MODES.CLASSIC) return 'ABILITY_NOT_AVAILABLE';
    if (me.role !== ROLES.SEER && me.role !== ROLES.DOCTOR) return 'ABILITY_NOT_AVAILABLE';
    if (s.phase !== PHASES.NIGHT) return 'WRONG_PHASE';
    if (!me.alive) return 'PLAYER_DEAD';
    const target = findPlayer(s, a.targetId);
    if (!target || !target.alive) return 'TARGET_INVALID';

    if (me.role === ROLES.SEER) {
      if (Object.hasOwn(s.night.abilities, me.id)) return 'ABILITY_USED';
      if (target.id === me.id) return 'TARGET_INVALID';
      s.night.abilities[me.id] = target.id;
      const result = { round: s.round, targetId: target.id, team: teamOf(target.role) };
      s.seerResults.push(result);
      env.emit('seer_checked', { playerId: me.id, ...result });
      return;
    }

    if (target.id === s.doctorLastTargetId) return 'DOCTOR_REPEAT';
    s.night.abilities[me.id] = target.id;
    env.emit('doctor_protected', { playerId: me.id, targetId: target.id });
  }),
};

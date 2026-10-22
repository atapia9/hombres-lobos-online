// Game state machine: applyAction(state, action, ctx) → { ok, state, events } | { ok: false, error }.
// Pure: no I/O, no implicit clock or randomness (both come from `ctx`), input state is never mutated.

import {
  CAUSES,
  MAX_PLAYERS,
  MAX_TIMER_SECONDS,
  NIGHT_STEPS,
  PHASES,
  WINNERS,
} from './constants.js';
import { nameKey, normalizeName } from './names.js';
import { assignRoles, composition, defaultRoleSwitches, validateSetup } from './setup.js';
import { OPTIONAL_ROLES } from './roles/index.js';
import { alphaChoose, convertPlayer } from './roles/alpha.js';
import { triggersShot, validateShot } from './roles/hunter.js';
import { protect } from './roles/protector.js';
import { seerCheck } from './roles/seer.js';
import { brew, spendPotions } from './roles/witch.js';
import { wolfVote } from './roles/wolf.js';
import { candidatesFrom, emptyDay, tallyVote } from './day.js';
import { advanceNight, effectiveVictimId, emptyNight, resolveNight, stepActorIds } from './night.js';
import { checkWinner } from './victory.js';
import { cryptoRng } from './rng.js';

// Ids start with a letter or digit, so keys such as __proto__ can never be used.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const LOG_LIMIT = 5000;
const IN_GAME = [PHASES.START, PHASES.NIGHT, PHASES.DAWN, PHASES.DAY];

const isId = (value) => typeof value === 'string' && ID_PATTERN.test(value);

function newPlayer(id, name) {
  return {
    id,
    name,
    role: null,
    originalRole: null, // set when the alpha converts this player
    convertedRound: null,
    alive: true,
    eliminatedRound: null,
    eliminatedPhase: null,
    eliminatedBy: null, // a CAUSES value
  };
}

function resetProgress(state) {
  state.day = emptyDay();
  state.night = emptyNight();
  state.lastNight = null;
  state.protectorLastTargetId = null;
  state.seerResults = [];
  state.spyReports = [];
  state.witchPotions = { healUsed: false, poisonUsed: false };
  state.alphaUsed = false;
  state.pendingShot = null; // { hunterId, phase }
  state.history = [];
  state.timer = null;
  state.winner = null;
}

export function defaultConfig() {
  return {
    wolfCount: null, // plain wolves; null = recommended
    roles: defaultRoleSwitches(),
    revealDeadRoles: false, // D-12
    mayorBreaksTies: false, // D-6
    showVotes: true, // who voted whom is shown once a vote closes
  };
}

export function createGame() {
  const state = {
    phase: PHASES.LOBBY,
    round: 0, // round N = night N + dawn N + day N
    gameNumber: 1, // increases with each rematch in the same room
    config: defaultConfig(),
    players: [],
    initial: null, // { playerCount, counts, wolfTotal, villageTotal, roles }
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

export const findPlayer = (state, id) => (isId(id) ? state.players.find((p) => p.id === id) ?? null : null);

function removeFromLobby(state, playerId) {
  state.players = state.players.filter((p) => p.id !== playerId);
}

/** Removes a player from the game and cleans every pending reference to them. */
function eliminate(state, target, cause, env) {
  target.alive = false;
  target.eliminatedRound = state.round;
  target.eliminatedPhase = state.phase;
  target.eliminatedBy = cause;

  const { day, night } = state;
  day.accusations = day.accusations.filter((a) => a.accuserId !== target.id && a.targetId !== target.id);
  if (day.vote?.status === 'open') {
    delete day.vote.ballots[target.id];
    day.vote.candidateIds = day.vote.candidateIds.filter((id) => id !== target.id);
    for (const [voterId, pick] of Object.entries(day.vote.ballots)) {
      if (pick === target.id) delete day.vote.ballots[voterId];
    }
    if (day.vote.candidateIds.length === 0) {
      env.emit('vote_cancelled', { voteId: day.vote.id, reason: 'no_candidates' });
      day.vote = null;
    }
  }
  delete night.wolfBallots[target.id];
  for (const [wolfId, pick] of Object.entries(night.wolfBallots)) {
    if (pick === target.id) delete night.wolfBallots[wolfId];
  }

  env.emit('player_eliminated', { playerId: target.id, cause, role: target.role });
  if (triggersShot(target, cause)) {
    state.pendingShot = { hunterId: target.id, phase: state.phase };
    env.emit('hunter_pending', { hunterId: target.id });
  }
}

/** Ends the game if a team has won. Waits while a hunter still has to shoot (D-9). */
function endIfWinner(state, env) {
  if (state.pendingShot) return false;
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
  state.pendingShot = null;
  env.emit('game_ended', {
    winner,
    reason,
    roles: Object.fromEntries(state.players.map((p) => [p.id, p.role])),
  });
}

function changePhase(state, to, env) {
  const from = state.phase;
  state.phase = to;
  state.timer = null;
  env.emit('phase_changed', { from, to });
}

function startNight(state, env) {
  state.day = emptyDay();
  state.night = emptyNight();
  changePhase(state, PHASES.NIGHT, env);
  advanceNight(state, env);
}

function closeNight(state, env) {
  const outcome = resolveNight(state);
  const { night } = state;

  spendPotions(state);
  state.protectorLastTargetId = night.protectorTargetId;
  if (outcome.convertedId) convertPlayer(state, findPlayer(state, outcome.convertedId), env);

  state.lastNight = { round: state.round, deathIds: outcome.deaths.map((d) => d.playerId) };
  state.history.push({ round: state.round, phase: PHASES.NIGHT, type: 'night', ...outcome });
  env.emit('night_resolved', { ...outcome, wolfBallots: { ...night.wolfBallots } });

  for (const { playerId, cause } of outcome.deaths) {
    eliminate(state, findPlayer(state, playerId), cause, env);
  }
  state.night = emptyNight();
  changePhase(state, PHASES.DAWN, env);
  endIfWinner(state, env);
}

// ---------------------------------------------------------------------------
// Night actions per step (each role module validates its own payload)

const NIGHT_ACTIONS = {
  [NIGHT_STEPS.SEER]: (s, me, a, env) => seerCheck(s, me, a, env, findPlayer),
  [NIGHT_STEPS.PROTECTOR]: (s, me, a, env) => protect(s, me, a, env, findPlayer),
  [NIGHT_STEPS.WOLVES]: (s, me, a, env) => wolfVote(s, me, a, env, findPlayer),
  [NIGHT_STEPS.ALPHA]: (s, me, a, env) => alphaChoose(s, me, a, env),
  [NIGHT_STEPS.WITCH]: (s, me, a, env) => brew(s, me, a, env, findPlayer, effectiveVictimId(s)),
};

function validRoleSwitches(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0
    && keys.every((k) => OPTIONAL_ROLES.includes(k) && typeof value[k] === 'boolean');
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
    env.emit('player_joined', { playerId: id, name });
  }),

  'player:leave': player((s, a, env, me) => {
    if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
    removeFromLobby(s, me.id);
    env.emit('player_left', { playerId: me.id });
  }),

  // Lobby: kick. During the game: retire, which counts as an elimination without a hunter shot.
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
    eliminate(s, target, CAUSES.NARRATOR, env);
    if (s.pendingShot?.hunterId === target.id) s.pendingShot = null;
    if (endIfWinner(s, env)) return;
    if (s.phase === PHASES.NIGHT) advanceNight(s, env);
  }),

  'game:configure': narrator((s, a, env) => {
    const changes = {};
    if (a.wolfCount !== undefined) {
      if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
      const valid = a.wolfCount === null
        || (Number.isInteger(a.wolfCount) && a.wolfCount >= 0 && a.wolfCount <= Math.ceil(MAX_PLAYERS / 3));
      if (!valid) return 'INVALID_WOLF_COUNT';
      changes.wolfCount = a.wolfCount;
    }
    if (a.roles !== undefined) {
      if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
      if (!validRoleSwitches(a.roles)) return 'INVALID_PAYLOAD';
      changes.roles = { ...s.config.roles, ...a.roles };
    }
    for (const key of ['revealDeadRoles', 'mayorBreaksTies', 'showVotes']) {
      if (a[key] === undefined) continue;
      if (typeof a[key] !== 'boolean') return 'INVALID_PAYLOAD';
      changes[key] = a[key];
    }
    if (Object.keys(changes).length === 0) return 'INVALID_PAYLOAD';
    Object.assign(s.config, changes);
    env.emit('config_changed', changes);
  }),

  'game:start': narrator((s, a, env) => {
    if (s.phase !== PHASES.LOBBY) return 'WRONG_PHASE';
    const playerCount = s.players.length;
    const error = validateSetup(s.config, playerCount);
    if (error) return error;

    const roles = assignRoles(s.players.map((p) => p.id), s.config, env.rng);
    s.players = s.players.map((p) => ({ ...newPlayer(p.id, p.name), role: roles[p.id] }));
    const { counts, wolfTotal, villageTotal } = composition(s.config, playerCount);
    s.initial = { playerCount, counts, wolfTotal, villageTotal, roles };
    resetProgress(s);
    s.phase = PHASES.START;
    s.round = 1;
    env.emit('game_started', { counts, roles });
  }),

  // --- Phases ------------------------------------------------------------------

  'phase:advance': narrator((s, a, env) => {
    const from = s.phase;
    const to = a.to;
    if (from === PHASES.START && to === PHASES.NIGHT) {
      startNight(s, env);
      return;
    }
    if (from === PHASES.NIGHT && to === PHASES.DAWN) {
      if (s.night.step !== NIGHT_STEPS.DONE) return 'NIGHT_IN_PROGRESS';
      closeNight(s, env);
      return;
    }
    if (from === PHASES.DAWN && to === PHASES.DAY) {
      if (s.pendingShot) return 'HUNTER_PENDING';
      s.day = emptyDay();
      changePhase(s, PHASES.DAY, env);
      return;
    }
    if (from === PHASES.DAY && to === PHASES.NIGHT) {
      if (s.day.vote) return 'VOTE_IN_PROGRESS';
      if (s.pendingShot) return 'HUNTER_PENDING';
      s.round += 1;
      startNight(s, env);
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

  // "New game with the same players": back to the lobby with the same config.
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

  // --- Night -------------------------------------------------------------------

  // One event for every night ability; the current step decides what it means.
  'night:act': player((s, a, env, me) => {
    if (s.phase !== PHASES.NIGHT) return 'WRONG_PHASE';
    if (!me.alive) return 'PLAYER_DEAD';
    const { step } = s.night;
    if (!stepActorIds(s, step).includes(me.id)) return 'NOT_YOUR_TURN';
    if (alreadyActed(s, step)) return 'ALREADY_ACTED';
    const error = NIGHT_ACTIONS[step](s, me, a, env);
    if (error) return error;
    advanceNight(s, env);
  }),

  // Narrator: skip the current step (for the wolves, it means "no victim", D-1).
  'night:skipStep': narrator((s, a, env) => {
    if (s.phase !== PHASES.NIGHT) return 'WRONG_PHASE';
    const { step } = s.night;
    if (step === NIGHT_STEPS.DONE) return 'NIGHT_DONE';
    if (a.step !== step) return 'STEP_CHANGED';
    s.night.skipped.push(step);
    env.emit('night_step_skipped', { step });
    advanceNight(s, env);
  }),

  // Narrator: the wolves disagree, ask them to vote again (D-1).
  'night:wolvesRevote': narrator((s, a, env) => {
    if (s.phase !== PHASES.NIGHT) return 'WRONG_PHASE';
    if (s.night.step !== NIGHT_STEPS.WOLVES) return 'WRONG_STEP';
    s.night.wolfBallots = {};
    env.emit('wolves_revote', {});
  }),

  // --- Hunter ------------------------------------------------------------------

  'hunter:shoot': player((s, a, env, me) => {
    if (s.phase !== PHASES.DAWN && s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    const error = validateShot(s, me, a.targetId, findPlayer);
    if (error) return error;
    const target = findPlayer(s, a.targetId);
    s.pendingShot = null;
    s.history.push({ round: s.round, phase: s.phase, type: 'shot', hunterId: me.id, targetId: target.id });
    env.emit('hunter_shot', { hunterId: me.id, targetId: target.id });
    eliminate(s, target, CAUSES.HUNTER, env);
    endIfWinner(s, env);
  }),

  // Narrator: the hunter does not shoot (left the game, took too long…).
  'hunter:skip': narrator((s, a, env) => {
    if (!s.pendingShot) return 'NO_PENDING_SHOT';
    const { hunterId } = s.pendingShot;
    s.pendingShot = null;
    s.history.push({ round: s.round, phase: s.phase, type: 'shot', hunterId, targetId: null });
    env.emit('hunter_skipped', { hunterId });
    endIfWinner(s, env);
  }),

  // --- Day -------------------------------------------------------------------------

  'day:accuse': player((s, a, env, me) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    if (s.day.vote || s.day.voteHeld) return 'VOTE_CLOSED';
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
    if (s.pendingShot) return 'HUNTER_PENDING';
    if (s.day.vote) return 'VOTE_IN_PROGRESS';
    if (s.day.voteHeld) return 'VOTE_ALREADY_HELD';
    const candidateIds = candidatesFrom(s.day.accusations, s.players);
    if (candidateIds.length === 0) return 'NO_ACCUSATIONS';
    s.day.vote = { id: `v${s.nextId++}`, candidateIds, ballots: {}, status: 'open', result: null };
    s.day.accusations = [];
    env.emit('vote_opened', { voteId: s.day.vote.id, candidateIds: [...candidateIds] });
  }),

  // targetId: one of the candidates, or null to abstain. `withdraw: true` removes the ballot.
  'day:vote': player((s, a, env, me) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    const { vote } = s.day;
    if (!vote) return 'NO_ACTIVE_VOTE';
    if (vote.status !== 'open') return 'VOTE_CLOSED';
    if (!me.alive) return 'PLAYER_DEAD';
    if (a.withdraw === true) {
      delete vote.ballots[me.id];
      env.emit('vote_cast', { voteId: vote.id, playerId: me.id, targetId: undefined });
      return;
    }
    if (a.targetId !== null) {
      if (!vote.candidateIds.includes(a.targetId)) return 'TARGET_INVALID';
      if (a.targetId === me.id) return 'CANNOT_VOTE_SELF';
    }
    vote.ballots[me.id] = a.targetId;
    env.emit('vote_cast', { voteId: vote.id, playerId: me.id, targetId: a.targetId });
  }),

  'day:closeVote': narrator((s, a, env) => {
    if (s.phase !== PHASES.DAY) return 'WRONG_PHASE';
    const { vote } = s.day;
    if (!vote) return 'NO_ACTIVE_VOTE';
    if (vote.status !== 'open') return 'VOTE_CLOSED';
    vote.status = 'closed';
    vote.result = tallyVote(vote, s.players, { mayorBreaksTies: s.config.mayorBreaksTies });
    env.emit('vote_closed', { voteId: vote.id, result: vote.result });
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
    s.day.voteHeld = true;
    const { result } = vote;
    s.history.push({
      round: s.round,
      phase: PHASES.DAY,
      type: 'vote',
      candidateIds: [...vote.candidateIds],
      eliminatedId: result.eliminatedId,
      tie: result.tie,
      tieBrokenByMayor: result.tieBrokenByMayor,
      votersByCandidate: structuredClone(result.votersByCandidate),
      weighted: { ...result.weighted },
    });
    env.emit('vote_confirmed', { voteId: vote.id, eliminatedId: result.eliminatedId });
    if (result.eliminatedId) {
      eliminate(s, findPlayer(s, result.eliminatedId), CAUSES.VOTE, env);
      endIfWinner(s, env);
    }
  }),
};

function alreadyActed(state, step) {
  const { night } = state;
  if (step === NIGHT_STEPS.SEER) return night.seerTargetId !== null;
  if (step === NIGHT_STEPS.PROTECTOR) return night.protectorTargetId !== null;
  if (step === NIGHT_STEPS.ALPHA) return night.alphaChoice !== null;
  if (step === NIGHT_STEPS.WITCH) return night.witch !== null;
  return false;
}


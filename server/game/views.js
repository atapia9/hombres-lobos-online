// Per-recipient projections of the game state (ADR-002).
// These are the ONLY functions whose output may leave the server:
// - publicView: the whole room. No roles before the end (except dead players
//   when the narrator enables it), no night step, no ability targets.
// - playerView: one player. Adds that player's own secrets under `me`.
// - narratorView: the narrator only. Everything, including the log.

import { MAX_PLAYERS, MIN_PLAYERS, NIGHT_STEPS, PHASES, ROLES, own, teamOf, isWolf } from './constants.js';
import { composition, maxWolfTotal, recommendedWolfTotal, setupWarning, validateSetup } from './setup.js';
import { tallyVote } from './day.js';
import { effectiveVictimId, resolveNight, stepActorIds, wolvesDisagree } from './night.js';
import { healAvailable, poisonAvailable } from './roles/witch.js';

function publicPlayer(state, player) {
  const out = {
    id: player.id,
    name: player.name,
    alive: player.alive,
    eliminatedRound: player.eliminatedRound,
    eliminatedPhase: player.eliminatedPhase,
  };
  const ended = state.phase === PHASES.ENDED;
  if (ended || (!player.alive && state.config.revealDeadRoles)) out.role = player.role;
  if (ended && player.originalRole) out.originalRole = player.originalRole;
  return out;
}

/** While open: only progress. Once closed: the outcome and, if enabled, the show of hands. */
function publicVote(state) {
  const { vote } = state.day;
  if (state.phase !== PHASES.DAY || !vote) return null;
  const tally = vote.status === 'closed'
    ? vote.result
    : tallyVote(vote, state.players, { mayorBreaksTies: state.config.mayorBreaksTies });
  const out = {
    id: vote.id,
    candidateIds: [...vote.candidateIds],
    status: vote.status,
    votedCount: tally.votedCount,
    eligibleCount: tally.eligibleCount,
  };
  if (vote.status === 'closed') {
    out.result = {
      eliminatedId: tally.eliminatedId,
      tie: tally.tie,
      tieBrokenByMayor: tally.tieBrokenByMayor,
      // Weighted totals stay with the narrator (D-7).
      votersByCandidate: state.config.showVotes ? structuredClone(tally.votersByCandidate) : null,
    };
  }
  return out;
}

function publicHistoryEntry(state, entry) {
  if (entry.type === 'night') {
    return { round: entry.round, phase: entry.phase, type: 'night', deathIds: entry.deaths.map((d) => d.playerId) };
  }
  if (entry.type === 'vote') {
    return {
      round: entry.round,
      phase: entry.phase,
      type: 'vote',
      candidateIds: [...entry.candidateIds],
      eliminatedId: entry.eliminatedId,
      tie: entry.tie,
      tieBrokenByMayor: entry.tieBrokenByMayor,
      votersByCandidate: state.config.showVotes ? structuredClone(entry.votersByCandidate) : null,
    };
  }
  return { ...entry }; // 'shot' and 'retired' are public by nature
}

export function publicView(state) {
  const { counts, wolfTotal, villageTotal } = state.initial ?? composition(state.config, state.players.length);
  return {
    phase: state.phase,
    round: state.round,
    gameNumber: state.gameNumber,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    // The composition is public: everyone knows which roles are in play, not who has them.
    setup: { counts: { ...counts }, wolfTotal, villageTotal },
    rules: {
      revealDeadRoles: state.config.revealDeadRoles,
      mayorBreaksTies: state.config.mayorBreaksTies,
      showVotes: state.config.showVotes,
    },
    players: state.players.map((p) => publicPlayer(state, p)),
    accusations: state.phase === PHASES.DAY
      ? state.day.accusations.map(({ id, accuserId, targetId }) => ({ id, accuserId, targetId }))
      : [],
    voteHeld: state.phase === PHASES.DAY ? state.day.voteHeld : false,
    vote: publicVote(state),
    pendingShot: state.pendingShot ? { hunterId: state.pendingShot.hunterId } : null,
    lastNight: state.lastNight ? { round: state.lastNight.round, deathIds: [...state.lastNight.deathIds] } : null,
    history: state.history.map((entry) => publicHistoryEntry(state, entry)),
    timer: state.timer ? { ...state.timer } : null,
    winner: state.winner,
  };
}

function nightSecrets(state, me) {
  const out = { turn: stepActorIds(state, state.night.step).includes(me.id) };
  const { night } = state;
  const step = out.turn ? state.night.step : null;
  out.step = step;

  if (isWolf(me) && step === NIGHT_STEPS.WOLVES) {
    out.wolfPicks = Object.fromEntries(
      state.players.filter((p) => p.alive && isWolf(p)).map((p) => [p.id, own(night.wolfBallots, p.id) ?? null]),
    );
    out.wolvesDisagree = wolvesDisagree(state);
  }
  if (step === NIGHT_STEPS.ALPHA) out.wolfTargetId = night.wolfTargetId;
  if (step === NIGHT_STEPS.WITCH) out.victimId = effectiveVictimId(state);
  return out;
}

/** What one player may see: the public view plus their own secrets. Null for unknown ids. */
export function playerView(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;

  const mine = {
    id: me.id,
    name: me.name,
    alive: me.alive,
    role: me.role,
    team: me.role ? teamOf(me.role) : null,
    originalRole: me.originalRole,
    convertedRound: me.convertedRound,
  };

  // Recognition: from the start, each wolf knows the others (and who the alpha is).
  if (me.role && isWolf(me)) {
    const pack = state.players.filter((p) => isWolf(p) && p.id !== me.id);
    mine.partnerIds = pack.map((p) => p.id);
    mine.alphaId = state.players.find((p) => p.role === ROLES.ALPHA)?.id ?? null;
  }
  if (me.role === ROLES.SEER) mine.seerResults = state.seerResults.map((r) => ({ ...r }));
  if (me.role === ROLES.PROTECTOR) mine.protectorLastTargetId = state.protectorLastTargetId;
  if (me.role === ROLES.SPY) mine.spyReports = state.spyReports.map((r) => ({ ...r }));
  if (me.role === ROLES.ALPHA) mine.alphaUsed = state.alphaUsed;
  if (me.role === ROLES.WITCH) {
    mine.potions = { heal: healAvailable(state), poison: poisonAvailable(state) };
  }
  if (me.role === ROLES.HUNTER) mine.mustShoot = state.pendingShot?.hunterId === me.id;

  if (state.phase === PHASES.NIGHT && me.alive) mine.night = nightSecrets(state, me);

  if (state.phase === PHASES.DAY) {
    const { vote } = state.day;
    mine.ballot = vote && Object.hasOwn(vote.ballots, me.id) ? { targetId: vote.ballots[me.id] } : null;
    mine.accusedId = state.day.accusations.find((a) => a.accuserId === me.id)?.targetId ?? null;
  }

  return { ...publicView(state), me: mine };
}

/** Everything, plus values the narrator screen needs to render controls. */
export function narratorView(state) {
  const view = structuredClone(state);
  const playerCount = state.players.length;
  const inLobby = state.phase === PHASES.LOBBY;
  const atNight = state.phase === PHASES.NIGHT;
  view.derived = {
    composition: state.initial ?? composition(state.config, playerCount),
    recommendedWolfTotal: recommendedWolfTotal(playerCount),
    maxWolfTotal: maxWolfTotal(playerCount),
    setupError: inLobby ? validateSetup(state.config, playerCount) : null,
    setupWarning: inLobby ? setupWarning(state.config, playerCount) : null,
    teams: Object.fromEntries(state.players.map((p) => [p.id, p.role ? teamOf(p.role) : null])),
    liveVote: state.day.vote
      ? tallyVote(state.day.vote, state.players, { mayorBreaksTies: state.config.mayorBreaksTies })
      : null,
    night: atNight
      ? {
        step: state.night.step,
        actorIds: stepActorIds(state, state.night.step),
        wolvesDisagree: wolvesDisagree(state),
        preview: resolveNight(state),
      }
      : null,
  };
  return view;
}


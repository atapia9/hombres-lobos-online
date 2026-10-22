// Per-recipient projections of the game state (ADR-003).
// These are the ONLY functions whose output may leave the server:
// - publicView: the whole room. Never contains roles before the game ends.
// - playerView: one player. Adds that player's own secrets (`me`).
// - narratorView: the narrator only. Everything, including the log.

import { MAX_PLAYERS, MIN_PLAYERS, MODES, PHASES, ROLES, own, teamOf } from './constants.js';
import { effectiveMafiaCount, maxMafiaCount, recommendedMafiaCount, validateSetup } from './roles.js';
import { nightRequestsNeeded, tallyVote } from './day.js';
import { nightProgress, resolveNight } from './night.js';

const aliveCount = (state) => state.players.filter((p) => p.alive).length;

function publicPlayer(player, revealRole) {
  const out = {
    id: player.id,
    name: player.name,
    alive: player.alive,
    eliminatedRound: player.eliminatedRound,
    eliminatedBy: player.eliminatedBy,
  };
  if (revealRole) out.role = player.role;
  return out;
}

/** Night outcome as announced to everyone: the doctor's save stays secret. */
function publicNightOutcome(mode, outcome) {
  const out = { round: outcome.round, victimId: outcome.victimId };
  if (outcome.phase) out.phase = outcome.phase;
  if (outcome.type) out.type = outcome.type;
  // Original rules: the number of mafia ballots is read out (R5). Not in the classic variant (V6).
  if (mode === MODES.ORIGINAL) out.mafiaBallots = outcome.mafiaBallots;
  return out;
}

/** While open: only progress. Once closed: the result and who voted guilty, like a show of hands (R10). */
function publicVote(state) {
  const { vote } = state.day;
  if (state.phase !== PHASES.DAY || !vote) return null;
  const tally = vote.status === 'closed' ? vote.result : tallyVote(vote, state.players);
  const out = {
    id: vote.id,
    accusedId: vote.accusedId,
    accuserId: vote.accuserId,
    status: vote.status,
    votedCount: tally.guiltyCount + tally.notGuiltyCount,
    eligibleCount: tally.eligibleCount,
    required: tally.required,
  };
  if (vote.status === 'closed') {
    out.result = {
      guiltyCount: tally.guiltyCount,
      notGuiltyCount: tally.notGuiltyCount,
      abstainedCount: tally.abstainedCount,
      passed: tally.passed,
      guiltyVoterIds: [...tally.guiltyVoterIds],
    };
  }
  return out;
}

function publicNightRequests(state) {
  if (state.phase !== PHASES.DAY || state.mode !== MODES.ORIGINAL) return null;
  const playerIds = state.day.nightRequests.filter((id) => state.players.find((p) => p.id === id)?.alive);
  return { playerIds, count: playerIds.length, needed: nightRequestsNeeded(aliveCount(state)) };
}

function publicHistoryEntry(mode, entry) {
  if (entry.type === 'night') return publicNightOutcome(mode, entry);
  return { ...entry };
}

export function publicView(state) {
  const ended = state.phase === PHASES.ENDED;
  const showScore = state.config.showScore;
  return {
    mode: state.mode,
    phase: state.phase,
    round: state.round,
    gameNumber: state.gameNumber,
    mafiaCount: state.initial ? state.initial.mafiaCount : effectiveMafiaCount(state.config, state.players.length),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    players: state.players.map((p) => publicPlayer(p, ended)),
    accusations: state.phase === PHASES.DAY
      ? state.day.accusations.map(({ id, accuserId, targetId }) => ({ id, accuserId, targetId }))
      : [],
    vote: publicVote(state),
    nightRequests: publicNightRequests(state),
    night: state.phase === PHASES.NIGHT ? nightProgress(state) : null,
    lastNight: state.lastNight ? publicNightOutcome(state.mode, state.lastNight) : null,
    history: state.history.map((entry) => publicHistoryEntry(state.mode, entry)),
    timer: state.timer ? { ...state.timer } : null,
    winner: state.winner,
    scores: ended && showScore && state.scores ? { ...state.scores } : null,
    scoreboard: showScore ? { ...state.scoreboard } : null,
  };
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
  };

  // Recognition: from dawn on, each mafioso knows the others. Their only advantage.
  if (me.role === ROLES.MAFIA) {
    mine.partnerIds = state.players.filter((p) => p.role === ROLES.MAFIA && p.id !== me.id).map((p) => p.id);
  }
  if (me.role === ROLES.SEER) mine.seerResults = state.seerResults.map((r) => ({ ...r }));
  if (me.role === ROLES.DOCTOR) mine.doctorLastTargetId = state.doctorLastTargetId;

  if (state.phase === PHASES.DAY) {
    const { vote } = state.day;
    mine.vote = vote && Object.hasOwn(vote.ballots, me.id) ? vote.ballots[me.id] : null;
    mine.nightRequested = state.day.nightRequests.includes(me.id);
  }

  if (state.phase === PHASES.NIGHT) {
    const { ballots, abilities } = state.night;
    mine.ballotSubmitted = Object.hasOwn(ballots, me.id);
    mine.ballotTargetId = mine.ballotSubmitted ? ballots[me.id] : null;
    if (me.role === ROLES.SEER || me.role === ROLES.DOCTOR) {
      mine.abilityTargetId = own(abilities, me.id) ?? null;
    }
    // Classic variant: the mafia "wake up together" and see each other's picks (V2).
    if (me.role === ROLES.MAFIA && state.mode === MODES.CLASSIC) {
      mine.partnerPicks = Object.fromEntries(
        mine.partnerIds
          .filter((id) => state.players.find((p) => p.id === id)?.alive)
          .map((id) => [id, own(ballots, id) ?? null]),
      );
    }
  }

  return { ...publicView(state), me: mine };
}

/** Everything, plus values the narrator screen needs to render controls. */
export function narratorView(state) {
  const view = structuredClone(state);
  const playerCount = state.players.length;
  const mafiaCount = state.initial ? state.initial.mafiaCount : effectiveMafiaCount(state.config, playerCount);
  view.derived = {
    recommendedMafiaCount: recommendedMafiaCount(playerCount),
    maxMafiaCount: Math.max(0, maxMafiaCount(playerCount)),
    effectiveMafiaCount: mafiaCount,
    setupError: state.phase === PHASES.LOBBY
      ? validateSetup({ playerCount, mafiaCount, mode: state.mode })
      : null,
    liveVote: state.day.vote ? tallyVote(state.day.vote, state.players) : null,
    nightRequests: publicNightRequests(state),
    nightProgress: state.phase === PHASES.NIGHT ? nightProgress(state) : null,
    nightPreview: state.phase === PHASES.NIGHT ? resolveNight(state) : null,
  };
  return view;
}

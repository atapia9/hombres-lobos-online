import { NIGHT_STEPS, ROLES, TEAMS, isWolf } from '../constants.js';

/** Lobo: votes with the other wolves for the night's victim. */
export const wolf = Object.freeze({
  id: ROLES.WOLF,
  label: 'Lobo',
  team: TEAMS.WOLVES,
  unique: false,
  nightSteps: [NIGHT_STEPS.WOLVES],
});

/**
 * Wolves' ballot. A wolf may change it while the wolves' turn is open.
 * Wolves cannot pick themselves or another wolf.
 */
export function wolfVote(state, me, { targetId }, env, findPlayer) {
  const target = findPlayer(state, targetId);
  if (!target || !target.alive || isWolf(target)) return 'TARGET_INVALID';
  state.night.wolfBallots[me.id] = target.id;
  env.emit('wolf_voted', { playerId: me.id, targetId: target.id });
  return undefined;
}

/**
 * The victim only counts if every living wolf picked the same player; with a
 * single wolf alive, that pick is enough (docs/reglas.md).
 */
export function resolveWolfVote(state) {
  const wolves = state.players.filter((p) => p.alive && isWolf(p));
  const picks = wolves.map((p) => (Object.hasOwn(state.night.wolfBallots, p.id) ? state.night.wolfBallots[p.id] : null));
  const allVoted = picks.length > 0 && picks.every((id) => id !== null);
  const unanimous = allVoted && picks.every((id) => id === picks[0]);
  const target = unanimous ? state.players.find((p) => p.id === picks[0]) : null;
  return {
    allVoted,
    unanimous,
    targetId: target && target.alive && !isWolf(target) ? target.id : null,
  };
}

import { NIGHT_STEPS, ROLES, TEAMS, isWolf } from '../constants.js';

/** Vidente: each night, checks one player and learns whether they are a wolf. */
export const seer = Object.freeze({
  id: ROLES.SEER,
  label: 'Vidente',
  team: TEAMS.VILLAGE,
  unique: true,
  nightSteps: [NIGHT_STEPS.SEER],
});

export function seerCheck(state, me, { targetId }, env, findPlayer) {
  const target = findPlayer(state, targetId);
  if (!target || !target.alive || target.id === me.id) return 'TARGET_INVALID';
  state.night.seerTargetId = target.id;
  // The answer is about the player's role right now; a later conversion is not foreseen.
  const result = { round: state.round, targetId: target.id, isWolf: isWolf(target) };
  state.seerResults.push(result);
  env.emit('seer_checked', { playerId: me.id, ...result });
  return undefined;
}

import { NIGHT_STEPS, ROLES, TEAMS } from '../constants.js';

/**
 * Lobo alfa: votes with the wolves. Once per game, after the wolves agree on
 * a victim, may convert that victim into a wolf instead of killing them (D-4).
 */
export const alpha = Object.freeze({
  id: ROLES.ALPHA,
  label: 'Lobo alfa',
  team: TEAMS.WOLVES,
  unique: true,
  nightSteps: [NIGHT_STEPS.WOLVES, NIGHT_STEPS.ALPHA],
});

/** The alpha is asked whenever there is a victim, even a protected one, so asking leaks nothing. */
export function alphaCanAct(state) {
  return !state.alphaUsed && state.night.wolfTargetId !== null;
}

export function alphaChoose(state, me, { convert }, env) {
  if (typeof convert !== 'boolean') return 'INVALID_PAYLOAD';
  state.night.alphaChoice = convert ? 'convert' : 'kill';
  env.emit('alpha_chose', { playerId: me.id, convert });
  return undefined;
}

/**
 * Turns the player into a plain wolf. They lose their previous ability and
 * join the wolves from the next night on.
 */
export function convertPlayer(state, target, env) {
  target.originalRole ??= target.role;
  target.role = ROLES.WOLF;
  target.convertedRound = state.round;
  state.alphaUsed = true;
  env.emit('player_converted', { playerId: target.id, from: target.originalRole });
}

import { NIGHT_STEPS, ROLES, TEAMS } from '../constants.js';

/**
 * Protector: each night, shields one player from the wolves' victim. Cannot
 * pick the same person two nights in a row, themselves included (D-2).
 * It does not stop the witch's poison.
 */
export const protector = Object.freeze({
  id: ROLES.PROTECTOR,
  label: 'Protector',
  team: TEAMS.VILLAGE,
  unique: true,
  nightSteps: [NIGHT_STEPS.PROTECTOR],
});

export function protect(state, me, { targetId }, env, findPlayer) {
  const target = findPlayer(state, targetId);
  if (!target || !target.alive) return 'TARGET_INVALID';
  if (target.id === state.protectorLastTargetId) return 'PROTECTOR_REPEAT';
  state.night.protectorTargetId = target.id;
  env.emit('player_protected', { playerId: me.id, targetId: target.id });
  return undefined;
}

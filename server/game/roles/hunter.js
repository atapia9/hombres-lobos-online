import { ROLES, TEAMS } from '../constants.js';

/**
 * Cazador: when they die (wolves, poison or vote), they pick another living
 * player who dies with them. At night the shot happens at dawn, after the
 * deaths are announced; by vote, right away (D-9). Removal by the narrator
 * does not trigger the shot.
 */
export const hunter = Object.freeze({
  id: ROLES.HUNTER,
  label: 'Cazador',
  team: TEAMS.VILLAGE,
  unique: true,
  nightSteps: [],
});

export const triggersShot = (player, cause) => player.role === ROLES.HUNTER && cause !== 'narrator';

export function validateShot(state, me, targetId, findPlayer) {
  if (state.pendingShot?.hunterId !== me.id) return 'NO_PENDING_SHOT';
  const target = findPlayer(state, targetId);
  if (!target || !target.alive || target.id === me.id) return 'TARGET_INVALID';
  return undefined;
}

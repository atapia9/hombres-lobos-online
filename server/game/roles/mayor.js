import { ROLES, TEAMS } from '../constants.js';

/**
 * Alcalde: secret role (D-7). Their day vote counts twice and, if the
 * narrator enables it, their ballot breaks ties.
 */
export const mayor = Object.freeze({
  id: ROLES.MAYOR,
  label: 'Alcalde',
  team: TEAMS.VILLAGE,
  unique: true,
  nightSteps: [],
});

export const voteWeight = (player) => (player.alive && player.role === ROLES.MAYOR ? 2 : 1);

/** Returns the tied candidate the living mayor voted for, or null. */
export function breakTie(players, ballots, leaderIds) {
  const living = players.find((p) => p.alive && p.role === ROLES.MAYOR);
  if (!living || !Object.hasOwn(ballots, living.id)) return null;
  const pick = ballots[living.id];
  return leaderIds.includes(pick) ? pick : null;
}

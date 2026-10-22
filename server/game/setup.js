// Composition of the game and random role dealing (D-10).
import { MAX_PLAYERS, MIN_PLAYERS, ROLES, TEAMS } from './constants.js';
import { OPTIONAL_ROLES, ROLE_CATALOG } from './roles/index.js';
import { cryptoRng, shuffle } from './rng.js';

/** Default switches for the optional roles: seer and protector on, the rest off. */
export function defaultRoleSwitches() {
  return Object.fromEntries(OPTIONAL_ROLES.map((id) => [id, id === ROLES.SEER || id === ROLES.PROTECTOR]));
}

/** Recommended wolves (alpha included): about a third of the table. */
export function recommendedWolfTotal(playerCount) {
  return Math.max(1, Math.floor(playerCount / 3));
}

/** At most ceil(n/3) wolves, which always leaves the village ahead. */
export function maxWolfTotal(playerCount) {
  return Math.ceil(playerCount / 3);
}

/** Fewer than floor(n/4) wolves is allowed, but the narrator is warned. */
export function minRecommendedWolfTotal(playerCount) {
  return Math.max(1, Math.floor(playerCount / 4));
}

/**
 * Turns the lobby config into concrete counts per role.
 * `config.wolfCount` is the number of plain wolves; null means "recommended".
 */
export function composition(config, playerCount) {
  const switches = config.roles ?? defaultRoleSwitches();
  const counts = Object.fromEntries(Object.keys(ROLE_CATALOG).map((id) => [id, 0]));
  for (const id of OPTIONAL_ROLES) counts[id] = switches[id] ? 1 : 0;
  counts[ROLES.WOLF] = config.wolfCount ?? Math.max(0, recommendedWolfTotal(playerCount) - counts[ROLES.ALPHA]);
  const assigned = Object.values(counts).reduce((a, b) => a + b, 0);
  counts[ROLES.VILLAGER] = Math.max(0, playerCount - assigned);

  const wolfTotal = counts[ROLES.WOLF] + counts[ROLES.ALPHA];
  return {
    counts,
    wolfTotal,
    villageTotal: Math.max(0, playerCount - wolfTotal),
    assigned,
  };
}

/** Returns an error code, or null when the game can start. */
export function validateSetup(config, playerCount) {
  if (playerCount < MIN_PLAYERS) return 'NOT_ENOUGH_PLAYERS';
  if (playerCount > MAX_PLAYERS) return 'TOO_MANY_PLAYERS';
  const { wolfTotal, assigned } = composition(config, playerCount);
  if (wolfTotal < 1) return 'NO_WOLVES';
  if (wolfTotal > maxWolfTotal(playerCount)) return 'TOO_MANY_WOLVES';
  if (assigned > playerCount) return 'TOO_MANY_ROLES';
  return null;
}

/** Non-blocking advice for the narrator, or null. */
export function setupWarning(config, playerCount) {
  if (validateSetup(config, playerCount)) return null;
  const { wolfTotal } = composition(config, playerCount);
  return wolfTotal < minRecommendedWolfTotal(playerCount) ? 'FEW_WOLVES' : null;
}

/** Deals roles with a cryptographically secure shuffle. Returns `{ [playerId]: role }`. */
export function assignRoles(playerIds, config, rng = cryptoRng) {
  const error = validateSetup(config, playerIds.length);
  if (error) throw new RangeError(`Cannot assign roles: ${error}`);
  const { counts } = composition(config, playerIds.length);
  // Wolves first, then the specials, then villagers: keeps tests predictable with identityRng.
  const order = [ROLES.WOLF, ROLES.ALPHA, ...OPTIONAL_ROLES.filter((id) => id !== ROLES.ALPHA), ROLES.VILLAGER];
  const deck = order.flatMap((id) => Array(counts[id]).fill(id));
  const seats = shuffle(playerIds, rng);
  return Object.fromEntries(seats.map((id, i) => [id, deck[i]]));
}

export const teamLabel = (team) => (team === TEAMS.WOLVES ? 'Lobos' : 'Aldeanos');

import { MAX_PLAYERS, MIN_PLAYERS, MODES, ROLES, isMode } from './constants.js';
import { cryptoRng, shuffle } from './rng.js';

/**
 * Recommended number of mafiosi. Matches the original table exactly:
 * 6–7 → 2, 8–10 → 3, 11–13 → 4, 14–16 → 5 (and extends it up to 20 players).
 */
export function recommendedMafiaCount(playerCount) {
  return Math.floor((playerCount + 1) / 3);
}

/** Largest allowed mafia: always strictly fewer mafiosi than honest players. */
export function maxMafiaCount(playerCount) {
  return Math.floor((playerCount - 1) / 2);
}

/** The narrator may override the recommendation; `null` means "use the table". */
export function effectiveMafiaCount(config, playerCount) {
  return config.mafiaCount ?? recommendedMafiaCount(playerCount);
}

/** Returns an error code, or null when the game can start. */
export function validateSetup({ playerCount, mafiaCount, mode }) {
  if (!isMode(mode)) return 'INVALID_MODE';
  if (playerCount < MIN_PLAYERS) return 'NOT_ENOUGH_PLAYERS';
  if (playerCount > MAX_PLAYERS) return 'TOO_MANY_PLAYERS';
  if (!Number.isInteger(mafiaCount) || mafiaCount < 1 || mafiaCount > maxMafiaCount(playerCount)) {
    return 'INVALID_MAFIA_COUNT';
  }
  return null;
}

/**
 * Deals roles at random. Returns `{ [playerId]: role }`.
 * Classic mode takes one seer and one doctor out of the honest team.
 */
export function assignRoles(playerIds, { mafiaCount, mode }, rng = cryptoRng) {
  const error = validateSetup({ playerCount: playerIds.length, mafiaCount, mode });
  if (error) throw new RangeError(`Cannot assign roles: ${error}`);

  const deck = Array.from({ length: playerIds.length }, (_, i) => {
    if (i < mafiaCount) return ROLES.MAFIA;
    if (mode === MODES.CLASSIC && i === mafiaCount) return ROLES.SEER;
    if (mode === MODES.CLASSIC && i === mafiaCount + 1) return ROLES.DOCTOR;
    return ROLES.HONEST;
  });
  const order = shuffle(playerIds, rng);
  return Object.fromEntries(order.map((id, i) => [id, deck[i]]));
}

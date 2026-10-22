// Shared leak detection for views and network payloads (ADR-003).

// Keys that carry hidden information. Before the game ends they may only
// appear inside `me` (the player's own secrets), never in the public part.
export const SECRET_KEYS = new Set([
  'role', 'team', 'partnerIds', 'partnerPicks', 'seerResults', 'doctorLastTargetId',
  'abilityTargetId', 'ballotTargetId', 'ballots', 'abilities', 'saved', 'intendedVictimId',
  'log', 'derived', 'initial', 'config', 'narratorToken', 'playerToken', 'token', 'seats', 'summary',
]);

/** Paths (a.b.0.c) of every secret key found in `value`. */
export function secretPaths(value, path = '') {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    return [...(SECRET_KEYS.has(key) ? [here] : []), ...secretPaths(child, here)];
  });
}

/** Secret paths that are not allowed: anything outside `me`, except roles revealed at the end. */
export function leakedPaths(payload, { ended = payload?.phase === 'ended', allow = [] } = {}) {
  return secretPaths(payload).filter((path) => {
    if (path.startsWith('me.') || path.startsWith('state.me.')) return false;
    if (ended && /(^|\.)players\.\d+\.role$/.test(path)) return false;
    return !allow.some((allowed) => path === allowed);
  });
}

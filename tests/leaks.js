// Shared leak detection for views and network payloads (ADR-003).

// Keys that carry hidden information. Before the game ends they may only
// appear inside `me` (the player's own secrets), never in the public part.
export const SECRET_KEYS = new Set([
  'role', 'roles', 'team', 'partnerIds', 'partnerPicks', 'seerResults', 'doctorLastTargetId',
  'abilityTargetId', 'ballotTargetId', 'ballots', 'abilities', 'saved', 'intendedVictimId',
  'log', 'derived', 'initial', 'config', 'narratorToken', 'playerToken', 'token', 'seats', 'summary',
]);

// Values that name a role or team. No public field may hold one before the end,
// whatever its key is called.
export const ROLE_VALUES = new Set(['mafia', 'honest', 'seer', 'doctor']);

/** Paths of every secret key, and of every role value (as "path=value"), found in `value`. */
export function secretPaths(value, path = '') {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    const found = [];
    if (SECRET_KEYS.has(key)) found.push(here);
    else if (typeof child === 'string' && ROLE_VALUES.has(child)) found.push(`${here}=${child}`);
    return [...found, ...secretPaths(child, here)];
  });
}

/** Secret paths that are not allowed: anything outside `me`, except what the end of the game reveals. */
export function leakedPaths(payload, { ended = payload?.phase === 'ended', allow = [] } = {}) {
  return secretPaths(payload).filter((path) => {
    if (path.startsWith('me.') || path.startsWith('state.me.')) return false;
    if (ended && /(^|\.)players\.\d+\.role(=|$)/.test(path)) return false;
    if (ended && /(^|\.)winner=/.test(path)) return false;
    return !allow.some((allowed) => path === allowed);
  });
}

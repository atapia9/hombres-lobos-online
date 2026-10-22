// Shared leak detection for views and network payloads (ADR-002).

// Keys that carry hidden information. Before the game ends they may only
// appear inside `me` (the player's own secrets), never in the public part.
export const SECRET_KEYS = new Set([
  'role', 'roles', 'team', 'teams', 'originalRole', 'partnerIds', 'alphaId', 'wolfPicks', 'seerResults',
  'protectorLastTargetId', 'spyReports', 'potions', 'alphaUsed', 'wolfBallots', 'wolfTargetId',
  'seerTargetId', 'protectorTargetId', 'protectedId', 'convertedId', 'healedId', 'poisonedId',
  'weighted', 'deaths', 'step', 'night', 'victimId', 'witchPotions', 'log', 'derived', 'initial',
  'config', 'narratorToken', 'playerToken', 'token', 'seats', 'summary', 'turn', 'mustShoot',
]);

// Values that name a role or team. No public field may hold one before the end,
// whatever its key is called.
export const ROLE_VALUES = new Set([
  'villager', 'seer', 'protector', 'hunter', 'mayor', 'spy', 'witch', 'wolf', 'alpha', 'village', 'wolves',
]);

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

/**
 * Secret paths that are not allowed: anything outside `me`, except what the
 * end of the game (or the "reveal dead roles" option) makes public.
 */
export function leakedPaths(payload, { ended = payload?.phase === 'ended', revealDead = false, allow = [] } = {}) {
  return secretPaths(payload).filter((path) => {
    if (path.startsWith('me.') || path.startsWith('state.me.')) return false;
    const deadRole = /(^|\.)players\.(\d+)\.(role|originalRole)(=|$)/.exec(path);
    if (deadRole && ended) return false;
    if (deadRole && revealDead) {
      const players = path.startsWith('state.') ? payload.state.players : payload.players;
      if (players?.[Number(deadRole[2])]?.alive === false) return false;
    }
    if (ended && /(^|\.)winner=/.test(path)) return false;
    return !allow.some((allowed) => path === allowed);
  });
}

// Hand-written payload validation for Socket.IO events (ADR-007). No dependencies.
// Each validator returns { ok: true, value } or { ok: false }. Only known keys are kept.

import { MODES, PHASES } from '../game/index.js';
import { PLAYER_ID_PATTERN, ROOM_CODE_PATTERN, TOKEN_PATTERN } from '../security.js';

const ok = (value) => ({ ok: true, value });
const bad = { ok: false };

export const v = {
  string: (max) => (x) => (typeof x === 'string' && x.length <= max ? ok(x) : bad),
  boolean: () => (x) => (typeof x === 'boolean' ? ok(x) : bad),
  int: (min, max) => (x) => (Number.isInteger(x) && x >= min && x <= max ? ok(x) : bad),
  oneOf: (values) => (x) => (values.includes(x) ? ok(x) : bad),
  pattern: (re) => (x) => (typeof x === 'string' && re.test(x) ? ok(x) : bad),
  nullable: (inner) => (x) => (x === null ? ok(null) : inner(x)),
  optional: (inner) => {
    const check = (x) => (x === undefined ? ok(undefined) : inner(x));
    check.optional = true;
    return check;
  },
};

/** Room codes are typed by people: accept lower case and surrounding spaces. */
export const roomCode = (x) => {
  if (typeof x !== 'string' || x.length > 20) return bad;
  const code = x.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? ok(code) : bad;
};

/** IANA time zone used to date the summary; unknown zones are rejected. */
export const timeZone = (x) => {
  if (typeof x !== 'string' || x.length > 64) return bad;
  try {
    new Intl.DateTimeFormat('es', { timeZone: x });
    return ok(x);
  } catch {
    return bad;
  }
};

const token = v.pattern(TOKEN_PATTERN);
const playerId = v.pattern(PLAYER_ID_PATTERN);
const shortId = v.pattern(/^[av][0-9]{1,9}$/); // accusation ids (a1…) from the game state

/** Validates a payload against `{ key: validator }`. Returns { ok, value } with only those keys. */
export function check(payload, schema) {
  const input = payload === undefined ? {} : payload;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return bad;
  const value = {};
  for (const [key, validator] of Object.entries(schema)) {
    const raw = Object.hasOwn(input, key) ? input[key] : undefined;
    if (raw === undefined && !validator.optional) return bad;
    const result = validator(raw);
    if (!result.ok) return bad;
    if (result.value !== undefined) value[key] = result.value;
  }
  return ok(value);
}

export const SCHEMAS = {
  'room:create': { mode: v.optional(v.oneOf(Object.values(MODES))), timeZone: v.optional(timeZone) },
  'narrator:resume': { code: roomCode, narratorToken: token },
  'room:join': { code: roomCode, name: v.string(200) },
  'room:rejoin': { code: roomCode, playerToken: token },
  'room:leave': {},
  'state:sync': {},
  'room:configure': {
    mode: v.optional(v.oneOf(Object.values(MODES))),
    mafiaCount: v.optional(v.nullable(v.int(1, 20))),
    showVotes: v.optional(v.boolean()),
    showScore: v.optional(v.boolean()),
  },
  'room:kick': { playerId },
  'seat:approve': { claimId: v.pattern(/^c[0-9]{1,9}$/) },
  'seat:reject': { claimId: v.pattern(/^c[0-9]{1,9}$/) },
  'game:start': {},
  'game:end': {},
  'game:rematch': {},
  'phase:advance': { to: v.oneOf([PHASES.DAY, PHASES.NIGHT]) },
  'timer:set': { seconds: v.int(0, 3600) },
  'day:accuse': { targetId: playerId },
  'day:dismissAccusation': { accusationId: shortId },
  'day:openVote': { accusationId: shortId },
  'day:vote': { guilty: v.nullable(v.boolean()) },
  'day:closeVote': {},
  'day:confirm': { accept: v.boolean() },
  'night:request': { wanted: v.boolean() },
  'night:submit': { targetId: v.nullable(playerId) },
  'night:ability': { targetId: playerId },
};

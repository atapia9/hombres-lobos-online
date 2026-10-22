import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PLAYER_ID_PATTERN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  TOKEN_PATTERN,
  generatePlayerId,
  generateRoomCode,
  generateToken,
  tokensEqual,
} from '../../server/security.js';
import { RoomStore, addSeat, findSeatByToken, isNarrator, rotateSeatToken } from '../../server/rooms.js';
import { SCHEMAS, check, roomCode, timeZone } from '../../server/net/validate.js';
import { createRateLimiter } from '../../server/net/rateLimit.js';
import { isOriginAllowed, loadConfig, parseOrigins } from '../../server/config.js';
import { VENDORED } from '../../scripts/vendor.js';

describe('security helpers (ADR-004)', () => {
  it('builds 5-character room codes without look-alike characters', () => {
    assert.equal(ROOM_CODE_ALPHABET.length, 31);
    for (const ch of '01OIL') assert.equal(ROOM_CODE_ALPHABET.includes(ch), false, ch);
    for (let i = 0; i < 500; i += 1) assert.match(generateRoomCode(), ROOM_CODE_PATTERN);
    assert.doesNotMatch('ABCDL', ROOM_CODE_PATTERN);
  });

  it('creates 128-bit URL-safe tokens and valid player ids', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken));
    assert.equal(tokens.size, 200);
    for (const t of tokens) assert.match(t, TOKEN_PATTERN);
    assert.match(generatePlayerId(), PLAYER_ID_PATTERN);
  });

  it('compares tokens safely', () => {
    const t = generateToken();
    assert.equal(tokensEqual(t, `${t}`), true);
    assert.equal(tokensEqual(t, generateToken()), false);
    assert.equal(tokensEqual(t, t.slice(1)), false);
    assert.equal(tokensEqual(t, undefined), false);
  });
});

describe('RoomStore', () => {
  it('creates rooms with unique codes and secret tokens', () => {
    const store = new RoomStore();
    const a = store.create({ mode: 'original', timeZone: 'UTC' });
    const b = store.create({ mode: 'classic', timeZone: 'UTC' });
    assert.notEqual(a.code, b.code);
    assert.equal(store.get(a.code), a);
    assert.equal(b.game.mode, 'classic');
    assert.equal(isNarrator(a, a.narratorToken), true);
    assert.equal(isNarrator(a, b.narratorToken), false);
  });

  it('refuses new rooms when full', () => {
    const store = new RoomStore({ maxRooms: 1 });
    assert.ok(store.create({ mode: 'original' }));
    assert.equal(store.create({ mode: 'original' }), null);
  });

  it('removes rooms idle for longer than the TTL', () => {
    let clock = 0;
    const store = new RoomStore({ ttlMs: 1000, now: () => clock });
    const idle = store.create({ mode: 'original' });
    clock = 600;
    const active = store.create({ mode: 'original' });
    clock = 1500;
    store.touch(active);
    assert.deepEqual(store.sweep(), [idle.code]);
    assert.equal(store.get(idle.code), null);
    assert.equal(store.get(active.code), active);
  });

  it('finds seats by token and rotates tokens', () => {
    const room = new RoomStore().create({ mode: 'original' });
    const { playerId, seat } = addSeat(room);
    const old = seat.token;
    assert.equal(findSeatByToken(room, old).playerId, playerId);
    rotateSeatToken(seat);
    assert.equal(findSeatByToken(room, old), null);
    assert.equal(findSeatByToken(room, seat.token).playerId, playerId);
  });
});

describe('payload validation (ADR-007)', () => {
  it('normalises typed room codes', () => {
    assert.deepEqual(roomCode(' abcde '), { ok: true, value: 'ABCDE' });
    assert.equal(roomCode('ABCD').ok, false);
    assert.equal(roomCode('ABCD0').ok, false);
    assert.equal(roomCode(12345).ok, false);
  });

  it('accepts real time zones only', () => {
    assert.equal(timeZone('America/Mexico_City').ok, true);
    assert.equal(timeZone('Mars/Olympus').ok, false);
  });

  it('keeps only the known keys', () => {
    const result = check({ guilty: true, type: 'game:end', actor: { kind: 'narrator' } }, SCHEMAS['day:vote']);
    assert.deepEqual(result, { ok: true, value: { guilty: true } });
  });

  it('rejects missing fields, wrong types and non-object payloads', () => {
    assert.equal(check({}, SCHEMAS['day:vote']).ok, false);
    assert.equal(check({ guilty: 'yes' }, SCHEMAS['day:vote']).ok, false);
    assert.equal(check('hello', SCHEMAS['room:join']).ok, false);
    assert.equal(check([1, 2], SCHEMAS['game:start']).ok, false);
    assert.equal(check({ targetId: 'p1' }, SCHEMAS['day:accuse']).ok, false);
  });

  it('accepts empty payloads for events without fields, including null', () => {
    assert.deepEqual(check(undefined, SCHEMAS['game:start']), { ok: true, value: {} });
    assert.deepEqual(check(null, SCHEMAS['game:start']), { ok: true, value: {} });
    assert.equal(check(null, SCHEMAS['day:vote']).ok, false);
  });

  it('does not read inherited properties', () => {
    const payload = Object.create({ guilty: true });
    assert.equal(check(payload, SCHEMAS['day:vote']).ok, false);
  });
});

describe('rate limiter', () => {
  it('allows bursts up to the capacity and refills over time', () => {
    let clock = 0;
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 2, now: () => clock });
    assert.deepEqual([limiter.take(), limiter.take(), limiter.take(), limiter.take()], [true, true, true, false]);
    clock = 500; // +1 token
    assert.deepEqual([limiter.take(), limiter.take()], [true, false]);
    clock = 10_000; // refills up to capacity only
    assert.deepEqual([limiter.take(), limiter.take(), limiter.take(), limiter.take()], [true, true, true, false]);
  });
});

describe('configuration (ADR-015)', () => {
  it('reads PORT, NODE_ENV and CORS_ORIGIN', () => {
    assert.deepEqual(loadConfig({}), { port: 3000, nodeEnv: 'development', corsOrigins: [] });
    assert.deepEqual(
      loadConfig({ PORT: '8080', NODE_ENV: 'production', CORS_ORIGIN: 'https://a.github.io, https://b.example/' }),
      { port: 8080, nodeEnv: 'production', corsOrigins: ['https://a.github.io', 'https://b.example'] },
    );
    assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
  });

  it('refuses origins with a path, a common mistake with GitHub Pages', () => {
    assert.throws(() => parseOrigins('https://atapia9.github.io/mafia-online'), /without paths/);
  });

  it('allows the same host, listed origins and clients without Origin', () => {
    const allowed = ['https://atapia9.github.io'];
    assert.equal(isOriginAllowed(undefined, 'localhost:3000', allowed), true);
    assert.equal(isOriginAllowed('http://localhost:3000', 'localhost:3000', allowed), true);
    assert.equal(isOriginAllowed('https://atapia9.github.io', 'api.example', allowed), true);
    assert.equal(isOriginAllowed('https://evil.example', 'api.example', allowed), false);
    assert.equal(isOriginAllowed('not a url', 'api.example', allowed), false);
  });
});

describe('vendored browser libraries (ADR-006)', () => {
  it('match the installed versions byte for byte (run `npm run vendor` after updating)', async () => {
    const root = join(import.meta.dirname, '..', '..');
    for (const { from, to } of VENDORED) {
      const [installed, vendored] = await Promise.all([readFile(join(root, from)), readFile(join(root, to))]);
      assert.ok(installed.equals(vendored), `${to} is out of date`);
    }
  });
});

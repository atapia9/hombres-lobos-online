import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { MAX_MESSAGE_BYTES } from '../../server/app.js';
import { ok, roomWithPlayers, startGame, startServer } from './helpers.js';

describe('input validation and authorisation (ADR-007)', () => {
  let t;
  before(async () => {
    t = await startServer();
  });
  after(() => t.close());

  it('validates payloads before touching the game', async () => {
    const room = await roomWithPlayers(t, 1);
    const c = await t.client();
    assert.deepEqual(await c.request('room:join', { code: 'abc', name: 'Ana' }), { ok: false, error: 'INVALID_PAYLOAD' });
    assert.deepEqual(await c.request('room:join', 'hello'), { ok: false, error: 'INVALID_PAYLOAD' });
    assert.deepEqual(await c.request('room:join', { code: 'ZZZZZ', name: 'Ana' }), { ok: false, error: 'ROOM_NOT_FOUND' });
    assert.deepEqual(await c.request('room:join', { code: room.code, name: '<>' }), { ok: false, error: 'NAME_INVALID' });
    assert.deepEqual(await c.request('room:join', { code: room.code, name: 'jugador 1' }), { ok: false, error: 'NAME_TAKEN' });
    assert.deepEqual(await c.request('room:create', { timeZone: 42 }), { ok: false, error: 'INVALID_PAYLOAD' });
    assert.deepEqual(await c.request('room:create', { timeZone: 'Mars/Base' }), { ok: false, error: 'INVALID_PAYLOAD' });
  });

  it('accepts room codes typed in lower case', async () => {
    const room = await roomWithPlayers(t, 0);
    const c = await t.client();
    await ok(c, 'room:join', { code: ` ${room.code.toLowerCase()} `, name: 'Ana' });
  });

  it('cleans names on the server', async () => {
    const room = await roomWithPlayers(t, 0);
    const c = await t.client();
    const joined = await ok(c, 'room:join', { code: room.code, name: '  <b>Eva</b>  ' });
    assert.equal(joined.state.me.name, 'bEvab');
    assert.deepEqual(await c.request('room:join', { code: room.code, name: '<img src=x onerror=alert(1)>' }), { ok: false, error: 'ALREADY_JOINED' });
  });

  it('only accepts events from the right sender', async () => {
    const room = await roomWithPlayers(t, 6);
    const stranger = await t.client();
    assert.deepEqual(await stranger.request('game:start'), { ok: false, error: 'NOT_IN_ROOM' });
    assert.deepEqual(await room.players[0].request('game:start'), { ok: false, error: 'NOT_NARRATOR' });
    assert.deepEqual(await room.players[0].request('room:kick', { playerId: room.players[1].playerId }), { ok: false, error: 'NOT_NARRATOR' });
    assert.deepEqual(await room.narrator.request('day:vote', { targetId: null }), { ok: false, error: 'NOT_PLAYER' });
    assert.deepEqual(await room.narrator.request('night:act', { targetId: room.players[0].playerId }), { ok: false, error: 'NOT_PLAYER' });
    assert.deepEqual(await room.players[0].request('night:skipStep', { step: 'seer' }), { ok: false, error: 'NOT_NARRATOR' });
    assert.deepEqual(await room.players[0].request('hunter:skip'), { ok: false, error: 'NOT_NARRATOR' });
  });

  it('ignores extra fields that try to change the action or the actor', async () => {
    const room = await roomWithPlayers(t, 6);
    const { roles } = await startGame(room);
    await ok(room.narrator, 'phase:advance', { to: 'night' });
    const seer = room.players.find((c) => roles.get(c) === 'seer');
    const target = room.players.find((c) => c !== seer);
    const answer = await seer.request('night:act', { targetId: target.playerId, type: 'game:end', actor: { kind: 'narrator' } });
    assert.deepEqual(answer, { ok: true });
    const state = await room.narrator.sync();
    assert.equal(state.phase, 'night');
    assert.equal(state.night.seerTargetId, target.playerId);
  });

  it('accepts events without fields sent with an explicit undefined (arrives as null)', async () => {
    const room = await roomWithPlayers(t, 6);
    assert.deepEqual(await room.narrator.request('game:start', null), { ok: true });
  });

  it('answers game rule errors with their code', async () => {
    const room = await roomWithPlayers(t, 5);
    assert.deepEqual(await room.narrator.request('game:start'), { ok: false, error: 'NOT_ENOUGH_PLAYERS' });
  });

  it('closes connections that send oversized messages', async () => {
    const c = await t.client();
    c.socket.emit('room:join', { code: 'ABCDE', name: 'x'.repeat(MAX_MESSAGE_BYTES + 100) });
    await c.disconnected();
    assert.equal(c.socket.connected, false);
  });
});

describe('rate limiting (ADR-007)', () => {
  let t;
  before(async () => {
    t = await startServer({ rateLimit: { capacity: 5, refillPerSecond: 1, maxStrikes: 8 } });
  });
  after(() => t.close());

  it('answers RATE_LIMITED past the burst and disconnects persistent abusers', async () => {
    const c = await t.client();
    const answers = await Promise.all(Array.from({ length: 8 }, () => c.request('state:sync')));
    const limited = answers.filter((a) => a.error === 'RATE_LIMITED').length;
    assert.equal(limited, 3);
    assert.equal(answers.filter((a) => a.error === 'NOT_IN_ROOM').length, 5);

    for (let i = 0; i < 10; i += 1) c.socket.emit('state:sync', () => {});
    await c.disconnected();
  });
});

describe('origins and HTTP (ADR-007)', () => {
  let t;
  before(async () => {
    t = await startServer({ corsOrigins: ['https://atapia9.github.io'] });
  });
  after(() => t.close());

  const connectWithOrigin = (origin) => new Promise((resolve) => {
    const socket = io(t.url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { origin } });
    socket.once('connect', () => {
      socket.disconnect();
      resolve('connected');
    });
    socket.once('connect_error', () => {
      socket.disconnect();
      resolve('refused');
    });
  });

  it('accepts the configured GitHub Pages origin and refuses others', async () => {
    assert.equal(await connectWithOrigin('https://atapia9.github.io'), 'connected');
    assert.equal(await connectWithOrigin('https://evil.example'), 'refused');
  });

  it('answers CORS preflight-free polling only for allowed origins', async () => {
    const allowed = await fetch(`${t.url}/socket.io/?EIO=4&transport=polling`, { headers: { origin: 'https://atapia9.github.io' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://atapia9.github.io');
    const refused = await fetch(`${t.url}/socket.io/?EIO=4&transport=polling`, { headers: { origin: 'https://evil.example' } });
    assert.equal(refused.status, 403);
  });

  it('exposes a health check with security headers', async () => {
    const res = await fetch(`${t.url}/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(res.headers.get('content-security-policy'), /connect-src 'self' https:\/\/atapia9\.github\.io/);
    assert.doesNotMatch(res.headers.get('content-security-policy'), /upgrade-insecure-requests/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('serves the vendored Socket.IO client for the static pages', async () => {
    const res = await fetch(`${t.url}/vendor/socket.io.esm.min.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Socket\.IO v4\.8\.4/);
  });
});

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ok, roomWithPlayers, startGame, startServer } from './helpers.js';

describe('sessions, reconnection and seats (ADR-008)', () => {
  let t;
  before(async () => {
    t = await startServer();
  });
  after(() => t.close());

  it('lets a player who closed the tab come back with the token and recover the role', async () => {
    const room = await roomWithPlayers(t, 6);
    const { roles } = await startGame(room);
    const [leaver] = room.players;
    const role = roles.get(leaver);

    leaver.close();
    await waitUntil(async () => (await room.narrator.sync()).connections[leaver.playerId] === false);
    const publicState = await room.players[1].sync();
    assert.equal(publicState.players.find((p) => p.id === leaver.playerId).connected, false);

    const back = await t.client();
    const answer = await ok(back, 'room:rejoin', { code: room.code, playerToken: leaver.token });
    assert.equal(answer.playerId, leaver.playerId);
    assert.equal(answer.state.me.role, role);
    assert.equal(answer.state.phase, 'start');
    assert.equal((await room.narrator.sync()).connections[leaver.playerId], true);
  });

  it('closes the older tab when the same seat connects twice', async () => {
    const room = await roomWithPlayers(t, 6);
    const [first] = room.players;
    const second = await t.client();
    const replaced = first.waitFor('session:replaced');
    await ok(second, 'room:rejoin', { code: room.code, playerToken: first.token });
    await replaced;
    await first.disconnected();
    assert.equal((await room.narrator.sync()).connections[first.playerId], true);
  });

  it('rejects unknown rooms and wrong tokens', async () => {
    const room = await roomWithPlayers(t, 1);
    const c = await t.client();
    assert.deepEqual(await c.request('room:rejoin', { code: room.code, playerToken: 'A'.repeat(22) }), { ok: false, error: 'INVALID_TOKEN' });
    assert.deepEqual(await c.request('room:rejoin', { code: 'ZZZZZ', playerToken: room.players[0].token }), { ok: false, error: 'ROOM_NOT_FOUND' });
    assert.deepEqual(await c.request('narrator:resume', { code: room.code, narratorToken: room.players[0].token }), { ok: false, error: 'INVALID_TOKEN' });
  });

  it('lets the narrator resume from another tab with the narrator token', async () => {
    const room = await roomWithPlayers(t, 6);
    const tab = await t.client();
    const replaced = room.narrator.waitFor('session:replaced');
    const answer = await ok(tab, 'narrator:resume', { code: room.code, narratorToken: room.narratorToken });
    assert.equal(answer.state.players.length, 6);
    await replaced;
    await ok(tab, 'game:start');
  });

  it('gives a disconnected seat back to a player who lost the token, once the narrator approves', async () => {
    const room = await roomWithPlayers(t, 6);
    const { roles } = await startGame(room);
    const [lost] = room.players;
    lost.close();
    await waitUntil(async () => (await room.narrator.sync()).connections[lost.playerId] === false);

    // Another phone, same name: the server asks the narrator.
    const phone = await t.client();
    const pending = await ok(phone, 'room:join', { code: room.code, name: lost.name.toUpperCase() });
    assert.equal(pending.pending, true);
    const claims = (await room.narrator.sync()).claims;
    assert.deepEqual(claims, [{ id: pending.claimId, playerId: lost.playerId, name: lost.name }]);

    const granted = phone.waitFor('seat:granted');
    await ok(room.narrator, 'seat:approve', { claimId: pending.claimId });
    const seat = await granted;
    assert.equal(seat.playerId, lost.playerId);
    assert.equal(seat.state.me.role, roles.get(lost));
    assert.notEqual(seat.playerToken, lost.token);

    // The old token no longer works; the new one does.
    const other = await t.client();
    assert.deepEqual(await other.request('room:rejoin', { code: room.code, playerToken: lost.token }), { ok: false, error: 'INVALID_TOKEN' });
    assert.deepEqual((await room.narrator.sync()).claims, []);
  });

  it('refuses seat claims for connected seats and unknown names, and lets the narrator reject one', async () => {
    const room = await roomWithPlayers(t, 6);
    await startGame(room);
    const phone = await t.client();
    assert.deepEqual(await phone.request('room:join', { code: room.code, name: room.players[1].name }), { ok: false, error: 'SEAT_TAKEN' });
    assert.deepEqual(await phone.request('room:join', { code: room.code, name: 'Desconocido' }), { ok: false, error: 'GAME_IN_PROGRESS' });

    room.players[2].close();
    await waitUntil(async () => (await room.narrator.sync()).connections[room.players[2].playerId] === false);
    const pending = await ok(phone, 'room:join', { code: room.code, name: room.players[2].name });
    const rejected = phone.waitFor('seat:rejected');
    await ok(room.narrator, 'seat:reject', { claimId: pending.claimId });
    await rejected;
  });

  it('drops a pending claim when the claimant disconnects', async () => {
    const room = await roomWithPlayers(t, 6);
    await startGame(room);
    room.players[0].close();
    await waitUntil(async () => (await room.narrator.sync()).connections[room.players[0].playerId] === false);
    const phone = await t.client();
    await ok(phone, 'room:join', { code: room.code, name: room.players[0].name });
    phone.close();
    await waitUntil(async () => (await room.narrator.sync()).claims.length === 0);
  });

  it('lets the narrator kick players in the lobby and retire them during the game', async () => {
    const room = await roomWithPlayers(t, 7);
    const [kicked, retired] = room.players;
    const notice = kicked.waitFor('room:kicked');
    await ok(room.narrator, 'room:kick', { playerId: kicked.playerId });
    await notice;
    assert.equal((await room.narrator.sync()).players.length, 6);
    assert.deepEqual(await kicked.request('day:vote', { targetId: null }), { ok: false, error: 'NOT_IN_ROOM' });

    await ok(room.narrator, 'game:start');
    await ok(room.narrator, 'room:kick', { playerId: retired.playerId });
    const state = await retired.sync();
    assert.equal(state.me.alive, false);
    assert.equal(state.players.find((p) => p.id === retired.playerId).alive, false);
  });

  it('lets players leave the lobby', async () => {
    const room = await roomWithPlayers(t, 3);
    await ok(room.players[0], 'room:leave');
    assert.equal((await room.narrator.sync()).players.length, 2);
    assert.deepEqual(await room.players[0].request('state:sync'), { ok: false, error: 'NOT_IN_ROOM' });
  });
});

async function waitUntil(condition, { timeoutMs = 2000, stepMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error('Condition not met in time');
}

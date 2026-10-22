// Helpers for integration tests: a real server on a random port and real Socket.IO clients.

import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApp } from '../../server/app.js';

const silentLogger = { error() {}, warn() {}, log() {} };

export async function startServer(options = {}) {
  const server = createApp({ logger: silentLogger, ...options });
  const port = await server.listen(0);
  const url = `http://localhost:${port}`;
  const clients = [];

  async function client(options = {}) {
    const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, ...options });
    const c = new TestClient(socket);
    clients.push(c);
    await c.connected();
    return c;
  }

  async function close() {
    for (const c of clients) c.close();
    await server.close();
  }

  return { server, url, port, client, close };
}

export class TestClient {
  constructor(socket) {
    this.socket = socket;
    this.received = []; // every server → client event: { event, payload }
    this.latestByEvent = new Map();
    this.waiters = [];
    socket.onAny((event, payload) => {
      this.received.push({ event, payload });
      this.latestByEvent.set(event, payload);
      for (const waiter of [...this.waiters]) {
        if (waiter.event === event && waiter.predicate(payload)) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          clearTimeout(waiter.timer);
          waiter.resolve(payload);
        }
      }
    });
  }

  connected() {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) return resolve();
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });
  }

  /** Emits with an acknowledgement and resolves with the server's answer. */
  request(event, payload) {
    const socket = this.socket.timeout(2000);
    return payload === undefined ? socket.emitWithAck(event) : socket.emitWithAck(event, payload);
  }

  /** Asks for the current state; afterwards every earlier event has been received. */
  async sync() {
    const answer = await this.request('state:sync');
    assert.equal(answer.ok, true, `state:sync failed: ${answer.error}`);
    return answer.state;
  }

  latest(event) {
    return this.latestByEvent.get(event);
  }

  /** Waits for a future event that matches `predicate`. */
  waitFor(event, predicate = () => true, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const waiter = { event, predicate, resolve };
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`Timed out waiting for ${event}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  disconnected() {
    return new Promise((resolve) => {
      if (!this.socket.connected) return resolve();
      this.socket.once('disconnect', resolve);
    });
  }

  close() {
    this.socket.disconnect();
  }
}

/** Creates a room and seats `n` players named "Jugador 1…n". `roles` switches optional roles. */
export async function roomWithPlayers(t, n, { roles } = {}) {
  const narrator = await t.client();
  const created = await narrator.request('room:create', { timeZone: 'America/Mexico_City' });
  assert.equal(created.ok, true, created.error);
  const players = [];
  for (let i = 1; i <= n; i += 1) {
    const c = await t.client();
    const name = `Jugador ${i}`;
    const joined = await c.request('room:join', { code: created.code, name });
    assert.equal(joined.ok, true, `join ${name}: ${joined.error}`);
    Object.assign(c, { playerId: joined.playerId, token: joined.playerToken, name });
    players.push(c);
  }
  if (roles) await ok(narrator, 'room:configure', { roles });
  return { narrator, code: created.code, narratorToken: created.narratorToken, players };
}

/** Narrator or player request that must succeed. */
export async function ok(client, event, payload) {
  const answer = await client.request(event, payload);
  assert.equal(answer.ok, true, `${event} failed: ${answer.error}`);
  return answer;
}

const WOLF_ROLES = new Set(['wolf', 'alpha']);

/**
 * Starts the game. Returns { roles, wolves, village, one(role) }, read from each
 * player's own private state (the only place a player learns their role).
 */
export async function startGame(room) {
  await ok(room.narrator, 'game:start');
  const roles = new Map();
  for (const c of room.players) roles.set(c, (await c.sync()).me.role);
  return {
    roles,
    wolves: room.players.filter((c) => WOLF_ROLES.has(roles.get(c))),
    village: room.players.filter((c) => !WOLF_ROLES.has(roles.get(c))),
    one: (role) => room.players.find((c) => roles.get(c) === role),
  };
}

/** Accusation by `accuser` → open vote → every voter marks `target` → close → confirm. */
export async function voteOut(room, accuser, target, voters) {
  await ok(accuser, 'day:accuse', { targetId: target.playerId });
  await ok(room.narrator, 'day:openVote');
  for (const voter of voters.filter((c) => c !== target)) await ok(voter, 'day:vote', { targetId: target.playerId });
  await ok(room.narrator, 'day:closeVote');
  await ok(room.narrator, 'day:confirm', { accept: true });
}

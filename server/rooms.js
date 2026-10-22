// In-memory room store (ADR-009). Rooms are lost when the process restarts.
// Each room wraps a pure game state plus the connection data the rules don't need:
// the narrator's secret token, each seat's token and socket, and pending seat claims.

import { createGame } from './game/index.js';
import { generatePlayerId, generateRoomCode, generateToken, tokensEqual } from './security.js';

export const DEFAULT_MAX_ROOMS = 500;
export const DEFAULT_ROOM_TTL_MS = 6 * 60 * 60 * 1000; // idle rooms are removed after 6 hours (docs/decisiones.md, ADR-005)

export class RoomStore {
  #rooms = new Map();

  constructor({ maxRooms = DEFAULT_MAX_ROOMS, ttlMs = DEFAULT_ROOM_TTL_MS, now = Date.now } = {}) {
    this.maxRooms = maxRooms;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get size() {
    return this.#rooms.size;
  }

  /** Returns the new room, or null when the server is full. */
  create({ timeZone } = {}) {
    if (this.#rooms.size >= this.maxRooms) return null;
    let code;
    do code = generateRoomCode(); while (this.#rooms.has(code));
    const room = {
      code,
      game: createGame(),
      timeZone,
      narratorToken: generateToken(),
      narratorSocketId: null,
      seats: new Map(), // playerId → { token, socketId }
      claims: new Map(), // claimId → { id, playerId, socketId, name }
      nextClaim: 1,
      createdAt: this.now(),
      lastActivity: this.now(),
    };
    this.#rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.#rooms.get(code) ?? null;
  }

  delete(code) {
    this.#rooms.delete(code);
  }

  touch(room) {
    room.lastActivity = this.now();
  }

  /** Removes rooms idle for longer than the TTL. Returns the removed codes. */
  sweep() {
    const limit = this.now() - this.ttlMs;
    const removed = [];
    for (const [code, room] of this.#rooms) {
      if (room.lastActivity < limit) {
        this.#rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}

export function isNarrator(room, token) {
  return tokensEqual(room.narratorToken, token);
}

/** Creates a seat with a fresh id and token. The game state is updated by the caller. */
export function addSeat(room) {
  let playerId;
  do playerId = generatePlayerId(); while (room.seats.has(playerId));
  const seat = { token: generateToken(), socketId: null };
  room.seats.set(playerId, seat);
  return { playerId, seat };
}

export function findSeatByToken(room, token) {
  for (const [playerId, seat] of room.seats) {
    if (tokensEqual(seat.token, token)) return { playerId, seat };
  }
  return null;
}

/** Issues a new token for a seat, invalidating the old one (used when a seat is reassigned). */
export function rotateSeatToken(seat) {
  seat.token = generateToken();
  return seat.token;
}

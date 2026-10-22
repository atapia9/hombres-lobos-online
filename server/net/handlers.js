// Socket.IO event handlers (ADR-005). Thin layer over the pure rules:
// validate → authorise → applyAction → broadcast per-recipient views.

import {
  PHASES,
  applyAction,
  buildSummary,
  nameKey,
  narratorView,
  normalizeName,
  playerView,
  publicView,
} from '../game/index.js';
import { addSeat, findSeatByToken, isNarrator, rotateSeatToken } from '../rooms.js';
import { SCHEMAS, check } from './validate.js';
import { DEFAULT_RATE_LIMIT, createRateLimiter } from './rateLimit.js';

const MAX_CLAIMS_PER_ROOM = 20;
const roomChannel = (code) => `room:${code}`;

// Events that map 1:1 onto a game action, and who may send them.
const GAME_EVENTS = {
  'room:configure': { as: 'narrator', type: 'game:configure' },
  'game:start': { as: 'narrator', type: 'game:start' },
  'game:end': { as: 'narrator', type: 'game:end' },
  'game:rematch': { as: 'narrator', type: 'game:rematch' },
  'phase:advance': { as: 'narrator', type: 'phase:advance' },
  'timer:set': { as: 'narrator', type: 'timer:set' },
  'night:skipStep': { as: 'narrator', type: 'night:skipStep' },
  'night:wolvesRevote': { as: 'narrator', type: 'night:wolvesRevote' },
  'hunter:skip': { as: 'narrator', type: 'hunter:skip' },
  'day:dismissAccusation': { as: 'narrator', type: 'day:dismissAccusation' },
  'day:openVote': { as: 'narrator', type: 'day:openVote' },
  'day:closeVote': { as: 'narrator', type: 'day:closeVote' },
  'day:confirm': { as: 'narrator', type: 'day:confirm' },
  'night:act': { as: 'player', type: 'night:act' },
  'hunter:shoot': { as: 'player', type: 'hunter:shoot' },
  'day:accuse': { as: 'player', type: 'day:accuse' },
  'day:vote': { as: 'player', type: 'day:vote' },
};

const failure = (error) => ({ ok: false, error });

export function attachHandlers(io, { rooms, now = Date.now, rng, rateLimit = DEFAULT_RATE_LIMIT, logger = console }) {
  const socketsById = () => io.of('/').sockets;

  // --- Payloads: the only data that leaves the server (ADR-003) -------------

  const connected = (room, playerId) => Boolean(room.seats.get(playerId)?.socketId);

  function publicPayload(room) {
    const view = publicView(room.game);
    return {
      code: room.code,
      serverNow: now(),
      ...view,
      players: view.players.map((p) => ({ ...p, connected: connected(room, p.id) })),
    };
  }

  /** Null when the seat no longer has a player (kicked or left the lobby). */
  function privatePayload(room, playerId) {
    const view = playerView(room.game, playerId);
    return view ? { code: room.code, me: view.me } : null;
  }

  function narratorPayload(room) {
    const ended = room.game.phase === PHASES.ENDED;
    return {
      code: room.code,
      serverNow: now(),
      ...narratorView(room.game),
      connections: Object.fromEntries(room.game.players.map((p) => [p.id, connected(room, p.id)])),
      narratorConnected: Boolean(room.narratorSocketId),
      claims: [...room.claims.values()].map(({ id, playerId, name }) => ({ id, playerId, name })),
      summary: ended ? buildSummary(room.game, { now: now(), timeZone: room.timeZone }) : null,
    };
  }

  function broadcast(room) {
    io.to(roomChannel(room.code)).emit('state:public', publicPayload(room));
    for (const [playerId, seat] of room.seats) {
      const payload = seat.socketId ? privatePayload(room, playerId) : null;
      if (payload) io.to(seat.socketId).emit('state:private', payload);
    }
    if (room.narratorSocketId) io.to(room.narratorSocketId).emit('state:narrator', narratorPayload(room));
  }

  // --- Binding sockets to a narrator or a seat ---------------------------------

  /** Tells an older connection it was replaced and closes it. */
  function replaceSocket(oldSocketId, newSocketId) {
    if (!oldSocketId || oldSocketId === newSocketId) return;
    const old = socketsById().get(oldSocketId);
    if (!old) return;
    old.data.binding = null;
    old.emit('session:replaced');
    old.disconnect(true);
  }

  function dropClaims(socket, room) {
    for (const [id, claim] of room.claims) if (claim.socketId === socket.id) room.claims.delete(id);
  }

  function unbind(socket) {
    const binding = socket.data.binding;
    socket.data.binding = null;
    if (!binding) return;
    const room = rooms.get(binding.code);
    socket.leave(roomChannel(binding.code));
    if (!room) return;
    if (binding.role === 'narrator' && room.narratorSocketId === socket.id) room.narratorSocketId = null;
    const seat = binding.role === 'player' ? room.seats.get(binding.playerId) : null;
    if (seat && seat.socketId === socket.id) seat.socketId = null;
    broadcast(room);
  }

  function bindNarrator(socket, room) {
    if (socket.data.binding?.code !== room.code || socket.data.binding.role !== 'narrator') unbind(socket);
    replaceSocket(room.narratorSocketId, socket.id);
    room.narratorSocketId = socket.id;
    socket.data.binding = { code: room.code, role: 'narrator' };
  }

  function bindPlayer(socket, room, playerId) {
    const current = socket.data.binding;
    if (current?.code !== room.code || current.playerId !== playerId) unbind(socket);
    const seat = room.seats.get(playerId);
    replaceSocket(seat.socketId, socket.id);
    seat.socketId = socket.id;
    socket.data.binding = { code: room.code, role: 'player', playerId };
    socket.join(roomChannel(room.code));
  }

  function dispatch(room, action) {
    const result = applyAction(room.game, action, { now: now(), rng });
    if (!result.ok) return failure(result.error);
    room.game = result.state;
    rooms.touch(room);
    broadcast(room);
    return { ok: true };
  }

  const playerState = (room, playerId) => ({ ...publicPayload(room), me: playerView(room.game, playerId).me });

  // --- Connection ------------------------------------------------------------------

  io.on('connection', (socket) => {
    socket.data.binding = null;

    // Rate limit every incoming packet. Over the limit: answer the ack (if any)
    // and drop the packet; persistent abuse closes the connection.
    const limiter = createRateLimiter({ ...rateLimit, now });
    let strikes = 0;
    socket.use((packet, next) => {
      if (limiter.take()) return next();
      strikes += 1;
      const ack = packet.at(-1);
      if (typeof ack === 'function') ack(failure('RATE_LIMITED'));
      if (strikes > rateLimit.maxStrikes) socket.disconnect(true);
    });

    const on = (event, handler) => {
      socket.on(event, (payload, ack) => {
        if (typeof payload === 'function' && ack === undefined) [payload, ack] = [undefined, payload];
        const reply = typeof ack === 'function' ? ack : () => {};
        const parsed = check(payload, SCHEMAS[event]);
        if (!parsed.ok) return reply(failure('INVALID_PAYLOAD'));
        try {
          reply(handler(parsed.value) ?? { ok: true });
        } catch (error) {
          logger.error(`[socket] ${event} failed`, error);
          reply(failure('INTERNAL'));
        }
      });
    };

    const boundRoom = () => {
      const binding = socket.data.binding;
      return binding ? rooms.get(binding.code) : null;
    };

    // Narrator ------------------------------------------------------------------

    on('room:create', ({ timeZone = 'UTC' }) => {
      const room = rooms.create({ timeZone });
      if (!room) return failure('SERVER_FULL');
      bindNarrator(socket, room);
      return { ok: true, code: room.code, narratorToken: room.narratorToken, state: narratorPayload(room) };
    });

    on('narrator:resume', ({ code, narratorToken }) => {
      const room = rooms.get(code);
      if (!room) return failure('ROOM_NOT_FOUND');
      if (!isNarrator(room, narratorToken)) return failure('INVALID_TOKEN');
      bindNarrator(socket, room);
      rooms.touch(room);
      broadcast(room);
      return { ok: true, code, state: narratorPayload(room) };
    });

    on('room:kick', ({ playerId }) => {
      const room = boundRoom();
      if (!room) return failure('NOT_IN_ROOM');
      if (socket.data.binding.role !== 'narrator') return failure('NOT_NARRATOR');
      const inLobby = room.game.phase === PHASES.LOBBY;
      const seat = room.seats.get(playerId);
      const result = dispatch(room, { type: 'player:remove', actor: { kind: 'narrator' }, playerId });
      if (result.ok && inLobby && seat) {
        const kicked = seat.socketId ? socketsById().get(seat.socketId) : null;
        room.seats.delete(playerId);
        if (kicked) {
          kicked.data.binding = null;
          kicked.leave(roomChannel(room.code));
          kicked.emit('room:kicked', { code: room.code });
        }
      }
      return result;
    });

    // Seat reassignment (ADR-008): the narrator approves a claim on a disconnected seat.
    on('seat:approve', ({ claimId }) => {
      const room = boundRoom();
      if (!room) return failure('NOT_IN_ROOM');
      if (socket.data.binding.role !== 'narrator') return failure('NOT_NARRATOR');
      const claim = room.claims.get(claimId);
      if (!claim) return failure('UNKNOWN_CLAIM');
      const seat = room.seats.get(claim.playerId);
      if (!seat) {
        room.claims.delete(claimId);
        return failure('UNKNOWN_PLAYER');
      }
      if (seat.socketId) return failure('SEAT_TAKEN');
      const claimant = socketsById().get(claim.socketId);
      room.claims.delete(claimId);
      if (!claimant) {
        broadcast(room);
        return failure('CLAIM_EXPIRED');
      }
      for (const [id, other] of room.claims) {
        if (other.playerId !== claim.playerId) continue;
        room.claims.delete(id);
        socketsById().get(other.socketId)?.emit('seat:rejected', { code: room.code });
      }
      const playerToken = rotateSeatToken(seat);
      claimant.data.claim = null;
      bindPlayer(claimant, room, claim.playerId);
      rooms.touch(room);
      claimant.emit('seat:granted', {
        code: room.code,
        playerId: claim.playerId,
        playerToken,
        state: playerState(room, claim.playerId),
      });
      broadcast(room);
      return { ok: true };
    });

    on('seat:reject', ({ claimId }) => {
      const room = boundRoom();
      if (!room) return failure('NOT_IN_ROOM');
      if (socket.data.binding.role !== 'narrator') return failure('NOT_NARRATOR');
      const claim = room.claims.get(claimId);
      if (!claim) return failure('UNKNOWN_CLAIM');
      room.claims.delete(claimId);
      socketsById().get(claim.socketId)?.emit('seat:rejected', { code: room.code });
      broadcast(room);
      return { ok: true };
    });

    // Players -----------------------------------------------------------------------

    on('room:join', ({ code, name }) => {
      const room = rooms.get(code);
      if (!room) return failure('ROOM_NOT_FOUND');

      if (room.game.phase !== PHASES.LOBBY) {
        // The game already started: a returning player who lost their token asks
        // the narrator to give them back their disconnected seat.
        const clean = normalizeName(name);
        const target = clean && room.game.players.find((p) => nameKey(p.name) === nameKey(clean));
        if (!target) return failure('GAME_IN_PROGRESS');
        if (connected(room, target.id)) return failure('SEAT_TAKEN');
        if (room.claims.size >= MAX_CLAIMS_PER_ROOM) return failure('TOO_MANY_CLAIMS');
        unbind(socket);
        dropClaims(socket, room);
        const claimId = `c${room.nextClaim++}`;
        room.claims.set(claimId, { id: claimId, playerId: target.id, socketId: socket.id, name: target.name });
        socket.data.claim = { code: room.code, claimId };
        broadcast(room);
        return { ok: true, pending: true, claimId };
      }

      if (socket.data.binding?.code === room.code && socket.data.binding.role === 'player') {
        return failure('ALREADY_JOINED');
      }
      const { playerId, seat } = addSeat(room);
      const result = applyAction(room.game, { type: 'player:join', actor: { kind: 'player', id: playerId }, name }, { now: now(), rng });
      if (!result.ok) {
        room.seats.delete(playerId);
        return failure(result.error);
      }
      room.game = result.state;
      bindPlayer(socket, room, playerId);
      rooms.touch(room);
      broadcast(room);
      return { ok: true, playerId, playerToken: seat.token, state: playerState(room, playerId) };
    });

    on('room:rejoin', ({ code, playerToken }) => {
      const room = rooms.get(code);
      if (!room) return failure('ROOM_NOT_FOUND');
      const found = findSeatByToken(room, playerToken);
      if (!found) return failure('INVALID_TOKEN');
      bindPlayer(socket, room, found.playerId);
      rooms.touch(room);
      broadcast(room);
      return { ok: true, playerId: found.playerId, state: playerState(room, found.playerId) };
    });

    on('room:leave', () => {
      const room = boundRoom();
      if (!room) return failure('NOT_IN_ROOM');
      const { role, playerId } = socket.data.binding;
      if (role !== 'player') return failure('NOT_PLAYER');
      const result = dispatch(room, { type: 'player:leave', actor: { kind: 'player', id: playerId } });
      if (!result.ok) return result;
      room.seats.delete(playerId);
      socket.data.binding = null;
      socket.leave(roomChannel(room.code));
      broadcast(room);
      return result;
    });

    // Returns the caller's current state. Events and acks share one ordered
    // channel, so once this answers, every earlier state event has arrived.
    on('state:sync', () => {
      const room = boundRoom();
      if (!room) return failure('NOT_IN_ROOM');
      const { role, playerId } = socket.data.binding;
      return { ok: true, state: role === 'narrator' ? narratorPayload(room) : playerState(room, playerId) };
    });

    // Game actions ---------------------------------------------------------------

    for (const [event, spec] of Object.entries(GAME_EVENTS)) {
      on(event, (payload) => {
        const room = boundRoom();
        if (!room) return failure('NOT_IN_ROOM');
        const { role, playerId } = socket.data.binding;
        if (spec.as === 'narrator' && role !== 'narrator') return failure('NOT_NARRATOR');
        if (spec.as === 'player' && role !== 'player') return failure('NOT_PLAYER');
        const actor = role === 'narrator' ? { kind: 'narrator' } : { kind: 'player', id: playerId };
        return dispatch(room, { ...payload, type: spec.type, actor });
      });
    }

    socket.on('disconnect', () => {
      const claim = socket.data.claim;
      if (claim) {
        const room = rooms.get(claim.code);
        if (room) {
          dropClaims(socket, room);
          if (!socket.data.binding) broadcast(room);
        }
      }
      unbind(socket);
    });
  });
}

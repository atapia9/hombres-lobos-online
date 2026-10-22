// Connection to the game server (Socket.IO client, vendored: see ADR-006).

import { io } from '../vendor/socket.io.esm.min.js';
import { SERVER_URL } from '../config.js';
import { resolveServerUrl } from './server-url.js';
import { load, remove, save } from './storage.js';

const SERVER_KEY = 'mafia:server';

/** Server URL for this page, remembering a ?server= parameter for next visits. */
export function currentServer() {
  const { url, fromParam } = resolveServerUrl({
    search: location.search,
    saved: load(SERVER_KEY),
    configured: SERVER_URL,
    pageOrigin: location.origin,
  });
  if (fromParam) save(SERVER_KEY, url);
  const defaultUrl = resolveServerUrl({ configured: SERVER_URL, pageOrigin: location.origin }).url;
  return { url, defaultUrl, custom: url !== defaultUrl };
}

/** Forgets a server chosen with ?server= and goes back to the default one. */
export function resetServer() {
  remove(SERVER_KEY);
}

/**
 * Opens the connection. Socket.IO reconnects on its own; listen to 'connect'
 * to restore the session after each (re)connection.
 */
export function connect(url) {
  const socket = io(url, { reconnectionDelayMax: 5000 });
  const statusListeners = new Set();
  let status = 'connecting';

  const setStatus = (next) => {
    status = next;
    for (const listener of statusListeners) listener(status);
  };
  socket.on('connect', () => setStatus('connected'));
  socket.on('disconnect', () => setStatus('connecting'));
  socket.on('connect_error', () => setStatus('error'));

  return {
    socket,
    get status() {
      return status;
    },
    onStatus(listener) {
      statusListeners.add(listener);
      listener(status);
    },
    on(event, handler) {
      socket.on(event, handler);
    },
    /** Resolves with the server's answer, or { ok: false, error: 'TIMEOUT' | 'OFFLINE' }. */
    async request(event, payload, timeoutMs = 8000) {
      if (!socket.connected) return { ok: false, error: 'OFFLINE' };
      try {
        const timed = socket.timeout(timeoutMs);
        return payload === undefined ? await timed.emitWithAck(event) : await timed.emitWithAck(event, payload);
      } catch {
        return { ok: false, error: 'TIMEOUT' };
      }
    },
  };
}

// Express + Socket.IO server factory. `index.js` starts it; tests create their own instances.

import { createServer } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { isOriginAllowed } from './config.js';
import { RoomStore } from './rooms.js';
import { attachHandlers } from './net/handlers.js';
import { DEFAULT_RATE_LIMIT } from './net/rateLimit.js';

export const MAX_MESSAGE_BYTES = 16 * 1024;
const DEFAULT_PUBLIC_DIR = join(import.meta.dirname, '..', 'public');

export function createApp({
  corsOrigins = [],
  nodeEnv = 'development',
  publicDir = DEFAULT_PUBLIC_DIR,
  now = Date.now,
  rng,
  rateLimit = DEFAULT_RATE_LIMIT,
  rooms = new RoomStore({ now }),
  sweepIntervalMs = 10 * 60 * 1000,
  logger = console,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        connectSrc: ["'self'", ...corsOrigins],
        imgSrc: ["'self'", 'data:', 'blob:'],
        // Local development runs over plain http.
        upgradeInsecureRequests: nodeEnv === 'production' ? [] : null,
      },
    },
  }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });
  app.use(express.static(publicDir, { extensions: ['html'] }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: corsOrigins },
    // Browsers send Origin on every WebSocket handshake: refuse unknown sites.
    allowRequest: (req, callback) => {
      callback(null, isOriginAllowed(req.headers.origin, req.headers.host, corsOrigins));
    },
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
  });
  attachHandlers(io, { rooms, now, rng, rateLimit, logger });

  const sweeper = setInterval(() => rooms.sweep(), sweepIntervalMs);
  sweeper.unref();

  return {
    app,
    io,
    rooms,
    httpServer,
    /** Resolves with the port actually used (pass 0 for a random free port). */
    listen(port) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => {
          httpServer.off('error', reject);
          resolve(httpServer.address().port);
        });
      });
    },
    close() {
      clearInterval(sweeper);
      return new Promise((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}

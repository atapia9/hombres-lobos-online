// Environment configuration (ADR-015): PORT, CORS_ORIGIN, NODE_ENV.

/** Parses a comma-separated list of origins such as "https://user.github.io". */
export function parseOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const url = new URL(item); // throws on malformed values
      if (url.origin !== item.replace(/\/$/, '')) {
        throw new Error(`CORS_ORIGIN must list origins without paths: "${item}" → use "${url.origin}"`);
      }
      return url.origin;
    });
}

export function loadConfig(env = process.env) {
  const port = env.PORT === undefined || env.PORT === '' ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : 'development';
  return { port, nodeEnv, corsOrigins: parseOrigins(env.CORS_ORIGIN) };
}

/**
 * Browsers always send Origin on WebSocket and cross-site requests. Allow the
 * server's own origin and the configured ones; allow requests without Origin
 * (non-browser clients such as the tests and the bots).
 */
export function isOriginAllowed(origin, host, allowed) {
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (host && parsed.host === host) return true;
  return allowed.includes(parsed.origin);
}

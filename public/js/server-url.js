// Pure helpers to decide which game server the static client talks to (ADR-006).
// No DOM or network here so they can be unit-tested in Node.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Returns the origin of a usable server URL, or null. Only https (or http on localhost). */
export function normalizeServerUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  return url.origin;
}

/**
 * Priority: ?server= parameter → the choice saved earlier → config.js → the page's own origin.
 * Returns { url, fromParam } so the caller can remember a parameter for next time.
 */
export function resolveServerUrl({ search = '', saved = null, configured = '', pageOrigin }) {
  const param = normalizeServerUrl(new URLSearchParams(search).get('server'));
  if (param) return { url: param, fromParam: true };
  const remembered = normalizeServerUrl(saved);
  if (remembered) return { url: remembered, fromParam: false };
  return { url: normalizeServerUrl(configured) ?? pageOrigin, fromParam: false };
}

/**
 * Link players open to join a room. It points to jugador.html next to the current page,
 * and carries ?server= only when the server is not the default one.
 */
export function joinLink({ pageHref, code, serverUrl, defaultServerUrl }) {
  const url = new URL('jugador.html', pageHref);
  url.search = '';
  url.hash = '';
  url.searchParams.set('sala', code);
  if (serverUrl && serverUrl !== defaultServerUrl) url.searchParams.set('server', serverUrl);
  return url.href;
}

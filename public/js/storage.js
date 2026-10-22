// localStorage can be missing or throw (private mode, blocked storage): never let it break the page.

export function load(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function save(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the session simply won't survive a reload.
  }
}

export function remove(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Ignore.
  }
}

// Per-tab storage: survives a reload of this tab, unlike localStorage it is not shared with other tabs.
export function loadTab(key) {
  try {
    const raw = globalThis.sessionStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTab(key, value) {
  try {
    globalThis.sessionStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore.
  }
}

export function removeTab(key) {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Ignore.
  }
}

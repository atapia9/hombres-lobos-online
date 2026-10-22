// Tiny DOM helpers. User-provided text is always set with textContent, never innerHTML (ADR-007).

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * h('button', { class: 'btn', onclick: fn, 'aria-label': '…' }, 'Texto', child)
 * - `text` sets textContent; `on*` keys add listeners; `class` sets className.
 * - booleans (disabled, hidden…) are set as properties; other keys as attributes.
 * - null/undefined/false children are skipped; arrays are flattened.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (typeof value === 'boolean') el[key] = value;
    else if (key === 'value') el.value = value;
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/** Identifies a control across re-renders: its data-key, or its role and label. */
function focusKey(node) {
  if (node.dataset?.key) return `key:${node.dataset.key}`;
  const label = node.getAttribute('aria-label') ?? node.textContent.trim().slice(0, 80);
  return `${node.tagName}|${node.getAttribute('name') ?? ''}|${node.getAttribute('value') ?? ''}|${label}`;
}

/** Replaces the content of `el`, keeping keyboard focus on the equivalent control. */
export function render(el, ...children) {
  const active = document.activeElement;
  const key = active && active !== document.body && el.contains(active) ? focusKey(active) : null;
  el.replaceChildren();
  append(el, children);
  if (!key) return;
  const match = [...el.querySelectorAll(FOCUSABLE)].find((node) => focusKey(node) === key);
  match?.focus({ preventScroll: true });
}

// Rebuilding the page between pointerdown and click would swallow the click, so
// renders requested while a pointer is pressed wait until the click has happened.
let pointerDown = false;
let pendingRender = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  const release = () => {
    pointerDown = false;
    setTimeout(() => {
      if (pointerDown || !pendingRender) return;
      const run = pendingRender;
      pendingRender = null;
      run();
    }, 0);
  };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
}

/** Runs `fn` now, or right after the current click if a pointer is pressed. */
export function whenIdle(fn) {
  if (pointerDown) pendingRender = fn;
  else fn();
}

export const $ = (selector, root = document) => root.querySelector(selector);

/** Announces a short message to screen readers through the page's aria-live region. */
export function announce(message) {
  const region = $('#announcer');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/** Shows a transient message (errors, confirmations) in the page's toast area. */
export function toast(message, { kind = 'info', timeoutMs = 4000 } = {}) {
  const area = $('#toasts');
  if (!area) return;
  const item = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status', text: message });
  area.append(item);
  setTimeout(() => item.remove(), timeoutMs);
}

/** Native confirm dialog with our own <dialog>, so it is styled and keyboard friendly. Resolves true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'confirm-title' },
      h('form', { method: 'dialog', class: 'dialog-body' },
        h('h2', { id: 'confirm-title', text: title }),
        message ? h('p', { text: message }) : null,
        h('div', { class: 'dialog-actions' },
          h('button', { value: 'cancel', class: 'btn btn-ghost', text: cancelLabel }),
          h('button', { value: 'ok', class: danger ? 'btn btn-danger' : 'btn btn-primary', text: confirmLabel }),
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

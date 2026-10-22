export const NAME_MAX_LENGTH = 20;

// Allow-list: letters, combining marks, digits, emoji, spaces and . - ' ’
// Everything else (markup, control and bidi characters, Markdown/WhatsApp
// formatting symbols) is dropped, so names are safe in every output format.
const DISALLOWED = /[^\p{L}\p{M}\p{N}\p{Extended_Pictographic}\uFE0F .'’-]/gu;
const MEANINGFUL = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;
const RAW_MAX_LENGTH = 200;

/** Returns the cleaned name, or null when it is not acceptable. */
export function normalizeName(raw) {
  if (typeof raw !== 'string' || raw.length > RAW_MAX_LENGTH) return null;
  const cleaned = raw
    .normalize('NFC')
    .replace(DISALLOWED, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  const length = [...cleaned].length;
  if (length === 0 || length > NAME_MAX_LENGTH || !MEANINGFUL.test(cleaned)) return null;
  return cleaned;
}

/** Key used to keep names unique inside a room, ignoring case. */
export function nameKey(name) {
  return name.toLocaleLowerCase('es');
}

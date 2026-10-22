import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Room codes avoid look-alike characters: no 0/O and no 1/I/L (ADR-004).
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const PLAYER_ID_PATTERN = /^p[0-9a-f]{16}$/;

export function generateRoomCode(rng = randomInt) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) code += ROOM_CODE_ALPHABET[rng(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** 128 random bits, URL-safe: 22 characters. */
export function generateToken() {
  return randomBytes(16).toString('base64url');
}

/** Opaque player id that always satisfies the game's id rules. */
export function generatePlayerId() {
  return `p${randomBytes(8).toString('hex')}`;
}

/** Constant-time comparison for secrets of any length. */
export function tokensEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

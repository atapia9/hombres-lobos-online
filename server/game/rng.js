import { randomInt } from 'node:crypto';

/**
 * An RNG is a function `(max) => integer in [0, max)`.
 * The default one is cryptographically secure; tests inject deterministic ones.
 */
export const cryptoRng = (max) => randomInt(max);

/** Fisher–Yates shuffle. Returns a new array and leaves the input untouched. */
export function shuffle(items, rng = cryptoRng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      throw new RangeError(`RNG returned ${j}, expected an integer in [0, ${i}]`);
    }
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

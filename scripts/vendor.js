// Copies browser libraries from node_modules into public/vendor/ so the static
// client (also published on GitHub Pages) needs no build step (ADR-006).
// Run with `npm run vendor` after updating a dependency; tests check the copies.

import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

export const VENDORED = [
  {
    from: 'node_modules/socket.io-client/dist/socket.io.esm.min.js',
    to: 'public/vendor/socket.io.esm.min.js',
  },
];

if (import.meta.main) {
  await mkdir(join(root, 'public/vendor'), { recursive: true });
  for (const { from, to } of VENDORED) {
    await copyFile(join(root, from), join(root, to));
    console.log(`${from} → ${to}`);
  }
}

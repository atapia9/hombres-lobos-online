// Copies browser libraries from node_modules into public/vendor/ so the static
// client (also published on GitHub Pages) needs no build step (ADR-006).
// Run with `npm run vendor` after updating a dependency; tests check the copies.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

export const VENDORED = [
  {
    from: 'node_modules/socket.io-client/dist/socket.io.esm.min.js',
    to: 'public/vendor/socket.io.esm.min.js',
  },
  {
    // The bundle has no license header of its own, so one is added.
    from: 'node_modules/uqr/dist/index.mjs',
    to: 'public/vendor/uqr.mjs',
    banner: '/*! uqr 0.1.3 | MIT License | (c) Project Nayuki, (c) 2023 Anthony Fu | https://github.com/unjs/uqr */\n',
  },
];

/** Expected content of a vendored file. */
export async function vendoredContent({ from, banner = '' }) {
  const source = await readFile(join(root, from));
  return Buffer.concat([Buffer.from(banner), source]);
}

if (import.meta.main) {
  await mkdir(join(root, 'public/vendor'), { recursive: true });
  for (const entry of VENDORED) {
    await writeFile(join(root, entry.to), await vendoredContent(entry));
    console.log(`${entry.from} → ${entry.to}`);
  }
}

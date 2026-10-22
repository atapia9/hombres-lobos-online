// QR code for the join link, drawn as an SVG built with the DOM (no innerHTML).

import { encode } from '../vendor/uqr.mjs';
import { svg } from './dom.js';

/** Path data for the dark modules of a QR matrix: one 1×1 square per module. Pure. */
export function qrPath(matrix) {
  let d = '';
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    });
  });
  return d;
}

export function qrSvg(text, { label = 'Código QR' } = {}) {
  const { size, data } = encode(text, { ecc: 'M', border: 2 });
  const root = svg('svg', {
    viewBox: `0 0 ${size} ${size}`,
    class: 'qr',
    role: 'img',
    'aria-label': label,
    'shape-rendering': 'crispEdges',
  });
  root.append(
    svg('rect', { width: size, height: size, fill: '#ffffff' }),
    svg('path', { d: qrPath(data), fill: '#000000' }),
  );
  return root;
}

// Shareable image of the result, drawn on a <canvas> (optional feature of the summary).

const W = 1080;
const H = 1350;
const PAD = 80;

/** Breaks `text` into lines that fit `maxWidth` with the current font. */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(ctx, text, x, y, { font, color, lineHeight, maxWidth = W - PAD * 2, maxLines = Infinity }) {
  ctx.font = font;
  ctx.fillStyle = color;
  const lines = wrap(ctx, text, maxWidth);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1]} …`;
  for (const line of shown) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function drawSummary(canvas, data) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#16131f');
  gradient.addColorStop(1, '#0b0c10');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d93a40';
  ctx.fillRect(0, 0, W, 14);
  ctx.textBaseline = 'top';

  let y = PAD;
  ctx.font = `800 96px ${sans}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('MAFIA', PAD, y);
  y += 120;
  y = paragraph(ctx, `${data.dateLabel} · ${data.modeLabel}`, PAD, y, { font: `400 30px ${sans}`, color: '#b8bfce', lineHeight: 40, maxLines: 2 });
  y = paragraph(ctx, `${data.playerCount} jugadores · ${data.mafiaCount} en la mafia`, PAD, y, { font: `400 30px ${sans}`, color: '#b8bfce', lineHeight: 40 });

  y += 40;
  y = paragraph(ctx, data.winnerLabel, PAD, y, {
    font: `800 72px ${sans}`,
    color: data.winner === 'mafia' ? '#ff6b70' : data.winner === 'honest' ? '#5fd17c' : '#ffffff',
    lineHeight: 84,
  });

  y += 30;
  for (const team of data.teams) {
    ctx.font = `700 36px ${sans}`;
    ctx.fillStyle = team.label === 'Mafia' ? '#ff6b70' : '#5fd17c';
    ctx.fillText(team.label, PAD, y);
    y += 50;
    const names = team.members.map((m) => (m.roleLabel ? `${m.name} (${m.roleLabel})` : m.name)).join(', ');
    y = paragraph(ctx, names || '—', PAD, y, { font: `400 32px ${sans}`, color: '#eceef3', lineHeight: 44, maxLines: 5 });
    y += 24;
  }

  // Eliminations by round, as many as fit above the closing line.
  const lines = data.rounds.flatMap(({ round, items }) =>
    items.map((item) => `Ronda ${round} · ${item.phase}: ${item.name ? `${item.name} — ` : ''}${item.text}`));
  if (lines.length > 0) {
    ctx.font = `700 32px ${sans}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Eliminaciones', PAD, y);
    y += 46;
    const limit = H - PAD - 260;
    for (const [index, line] of lines.entries()) {
      if (y > limit) {
        paragraph(ctx, `… y ${lines.length - index} más`, PAD, y, { font: `400 26px ${sans}`, color: '#8d95a8', lineHeight: 34 });
        break;
      }
      y = paragraph(ctx, line, PAD, y, { font: `400 26px ${sans}`, color: '#b8bfce', lineHeight: 34, maxLines: 2 });
      y += 6;
    }
  }

  let bottom = H - PAD - 44;
  ctx.font = `400 26px ${sans}`;
  ctx.fillStyle = '#8d95a8';
  ctx.fillText(data.credit, PAD, bottom);
  if (data.closingLine) {
    ctx.font = `italic 400 34px ${sans}`;
    const lines = wrap(ctx, `«${data.closingLine}»`, W - PAD * 2);
    bottom -= 30 + lines.length * 46;
    paragraph(ctx, `«${data.closingLine}»`, PAD, bottom, { font: `italic 400 34px ${sans}`, color: '#eceef3', lineHeight: 46 });
  }
  return canvas;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSummaryImage(data, filename) {
  const canvas = drawSummary(document.createElement('canvas'), data);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) downloadBlob(blob, filename);
  return Boolean(blob);
}

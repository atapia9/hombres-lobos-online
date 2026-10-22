// Narrator screen: create the room, configure the roles, run every phase and the
// ordered night, see roles and votes, read the event log and share the final summary.

import { connect, currentServer, resetServer } from './net.js';
import { $, announce, confirmDialog, h, render, toast, whenIdle } from './dom.js';
import {
  CAUSE_LABELS,
  NIGHT_STEP_LABELS,
  OPTIONAL_ROLE_ORDER,
  PHASE_LABELS,
  ROLE_HINTS,
  ROLE_LABELS,
  WINNER_LABELS,
  errorMessage,
  teamOfRole,
} from './texts.js';
import {
  describeDawn,
  describeLogEntry,
  describeStatus,
  describeVoteResult,
  formatCountdown,
  formatTime,
  groupByRound,
  namer,
  roundTitle,
} from './format.js';
import { joinLink } from './server-url.js';
import { qrSvg } from './qr.js';
import { mountRules } from './rules-ui.js';
import { load, remove, save } from './storage.js';
import { downloadBlob, downloadSummaryImage } from './summary-image.js';

const SESSION_KEY = 'lobos:narrator';
const IN_GAME = ['start', 'night', 'dawn', 'day'];
const server = currentServer();
const conn = connect(server.url);

const ui = {
  state: null,
  clockOffset: 0,
  showRoles: true,
  showQrInGame: false,
  showLiveVotes: true,
  summaryFormat: 'markdown',
  replaced: false,
  lastPhase: null,
};

// --- Wiring -----------------------------------------------------------------------

mountRules($('#rules'));
$('#server-info').replaceChildren(
  `Servidor: ${server.url}`,
  server.custom ? ' · ' : '',
  server.custom ? h('button', { class: 'btn btn-ghost btn-small', text: 'Usar el servidor predeterminado', onclick: () => { resetServer(); location.href = location.pathname; } }) : '',
);
conn.onStatus(renderConnection);
conn.on('connect', restoreSession);
conn.on('state:narrator', setState);
conn.on('session:replaced', () => {
  ui.replaced = true;
  renderAll();
});
setInterval(tickTimer, 1000);
renderAll();

async function send(event, payload) {
  const answer = await conn.request(event, payload);
  if (!answer.ok) toast(errorMessage(answer.error), { kind: 'error' });
  return answer;
}

async function restoreSession() {
  if (ui.replaced) return;
  const session = load(SESSION_KEY);
  if (!session || session.server !== server.url) {
    renderAll();
    return;
  }
  const answer = await conn.request('narrator:resume', { code: session.code, narratorToken: session.narratorToken });
  if (answer.ok) {
    setState(answer.state);
  } else if (answer.error === 'ROOM_NOT_FOUND' || answer.error === 'INVALID_TOKEN') {
    remove(SESSION_KEY);
    ui.state = null;
    toast('La sala anterior ya no existe en el servidor. Crea una nueva.', { kind: 'error', timeoutMs: 7000 });
    renderAll();
  } else {
    toast(errorMessage(answer.error), { kind: 'error' });
  }
}

function setState(state) {
  ui.clockOffset = state.serverNow - Date.now();
  if (ui.lastPhase && ui.lastPhase !== state.phase) {
    announce(state.phase === 'ended' ? WINNER_LABELS[state.winner] : `Fase: ${PHASE_LABELS[state.phase]}`);
  }
  ui.lastPhase = state.phase;
  ui.state = state;
  renderAll();
}

function renderConnection(status) {
  const labels = { connected: 'Conectado', connecting: 'Conectando…', error: 'Sin conexión' };
  const dots = { connected: 'dot-ok', connecting: 'dot-warn', error: 'dot-off' };
  render($('#connection'), h('span', { class: `dot ${dots[status]}`, 'aria-hidden': 'true' }), labels[status]);
  if (!ui.state) renderAll();
}

// --- Rendering ------------------------------------------------------------------------

function renderAll() {
  whenIdle(renderNow);
}

function renderNow() {
  const s = ui.state;
  if (ui.replaced) {
    render($('#primary'), replacedCard());
    render($('#secondary'));
    return;
  }
  if (!s) {
    render($('#primary'), conn.status === 'connected' ? createCard() : waitingCard());
    render($('#secondary'));
    return;
  }
  const nameOf = namer(s.players);
  render($('#primary'),
    claimsCard(s),
    s.phase === 'lobby' ? lobbyCard(s) : null,
    IN_GAME.includes(s.phase) ? gameCard(s, nameOf) : null,
    s.phase === 'ended' ? endedCard(s) : null,
    logCard(s, nameOf),
  );
  render($('#secondary'), roomCard(s), rosterCard(s));
  tickTimer();
  scrollLogToEnd();
}

function waitingCard() {
  const failed = conn.status === 'error';
  return h('section', { class: 'card' },
    h('h1', { text: failed ? 'No se puede conectar con el servidor' : 'Conectando con el servidor…' }),
    h('p', { class: 'muted', text: failed
      ? `Revisa que el servidor (${server.url}) esté en marcha. Si usa un plan gratuito puede tardar alrededor de un minuto en despertar; seguimos intentándolo.`
      : 'Un momento, por favor.' }),
  );
}

function replacedCard() {
  return h('section', { class: 'card card-highlight' },
    h('h1', { text: 'La sala se abrió en otra pestaña' }),
    h('p', { text: 'Solo una pantalla puede dirigir la sala a la vez. Puedes seguir allí o retomarla aquí.' }),
    h('button', {
      class: 'btn btn-primary',
      text: 'Retomar aquí',
      onclick: () => {
        ui.replaced = false;
        conn.socket.connect();
        renderAll();
      },
    }),
  );
}

function createCard() {
  const form = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const answer = await send('room:create', { timeZone });
      button.disabled = false;
      if (!answer.ok) return;
      save(SESSION_KEY, { code: answer.code, narratorToken: answer.narratorToken, server: server.url });
      setState(answer.state);
    },
  },
  h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block', text: 'Crear sala' }),
  );
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'create-title' },
    h('h1', { id: 'create-title', text: 'Nueva sala' }),
    h('p', { class: 'muted', text: 'Crea la sala y comparte el código o el QR. Los jugadores se unen desde su teléfono, sin cuenta ni registro. Los roles se eligen en la sala de espera.' }),
    form,
  );
}

function roomCard(s) {
  const link = joinLink({ pageHref: location.href, code: s.code, serverUrl: server.url, defaultServerUrl: server.defaultUrl });
  const inLobby = s.phase === 'lobby';
  const showQr = inLobby || ui.showQrInGame;
  return h('section', { class: 'card', 'aria-labelledby': 'room-title' },
    h('div', { class: 'row row-between' },
      h('h2', { id: 'room-title', text: 'Sala' }),
    ),
    h('p', { class: 'room-code', 'aria-label': `Código de sala: ${s.code.split('').join(' ')}`, text: s.code }),
    h('a', { class: 'join-link', href: link, target: '_blank', rel: 'noopener', text: link }),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-small', text: 'Copiar enlace', onclick: () => copyText(link, 'Enlace copiado.') }),
      inLobby ? null : h('button', {
        class: 'btn btn-small btn-ghost',
        'aria-expanded': String(showQr),
        text: showQr ? 'Ocultar QR' : 'Mostrar QR',
        onclick: () => { ui.showQrInGame = !ui.showQrInGame; renderAll(); },
      }),
    ),
    showQr ? h('div', { class: 'qr-box' }, qrSvg(link, { label: `Código QR para unirse a la sala ${s.code}` })) : null,
    h('div', { class: 'row', style: 'margin-top: 12px' },
      h('button', {
        class: 'btn btn-ghost btn-small',
        text: 'Salir de esta sala',
        onclick: async () => {
          const okToLeave = await confirmDialog({
            title: '¿Salir de esta sala?',
            message: 'Esta pantalla dejará de dirigirla. La sala sigue existiendo en el servidor hasta 6 horas sin actividad, pero sin el código de narrador guardado en este navegador no podrás retomarla.',
            confirmLabel: 'Salir',
            danger: true,
          });
          if (!okToLeave) return;
          remove(SESSION_KEY);
          location.reload();
        },
      }),
    ),
  );
}

function claimsCard(s) {
  if (!s.claims.length) return null;
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'claims-title' },
    h('h2', { id: 'claims-title', text: 'Solicitudes para recuperar un asiento' }),
    h('p', { class: 'muted small', text: 'Alguien entró con el nombre de un jugador desconectado. Aprueba solo si es esa misma persona: recibirá su rol.' }),
    h('ul', { class: 'list' }, s.claims.map((claim) => h('li', { class: 'list-item' },
      h('span', {}, h('span', { class: 'name', text: claim.name }), ' quiere volver desde otro dispositivo.'),
      h('span', { class: 'row' },
        h('button', { class: 'btn btn-primary btn-small', dataset: { key: `approve-${claim.id}` }, 'aria-label': `Aprobar a ${claim.name}`, text: 'Aprobar', onclick: () => send('seat:approve', { claimId: claim.id }) }),
        h('button', { class: 'btn btn-ghost btn-small', dataset: { key: `reject-${claim.id}` }, 'aria-label': `Rechazar a ${claim.name}`, text: 'Rechazar', onclick: () => send('seat:reject', { claimId: claim.id }) }),
      ),
    ))),
  );
}

function lobbyCard(s) {
  const { derived, config } = s;
  const count = s.players.length;
  const { counts, wolfTotal, villageTotal } = derived.composition;
  const missing = Math.max(0, 6 - count);
  const recommendedPlain = Math.max(0, derived.recommendedWolfTotal - (config.roles.alpha ? 1 : 0));
  const wolfOptions = [
    h('option', { value: 'auto', selected: config.wolfCount === null, text: `Recomendado (${recommendedPlain})` }),
    ...Array.from({ length: 7 }, (_, n) => n).map((n) =>
      h('option', { value: String(n), selected: config.wolfCount === n, text: String(n) })),
  ];

  let status;
  if (derived.setupError) {
    const text = missing > 0 ? `Faltan ${missing} ${missing === 1 ? 'jugador' : 'jugadores'} (mínimo 6).` : errorMessage(derived.setupError);
    status = h('p', { id: 'start-help', class: 'notice notice-warn', text });
  } else {
    status = h('div', { id: 'start-help', class: 'stack', style: 'gap: 8px' },
      h('p', { class: 'notice notice-info', style: 'margin: 0', text: `Habrá ${wolfTotal} ${wolfTotal === 1 ? 'lobo' : 'lobos'} y ${villageTotal} ${villageTotal === 1 ? 'aldeano' : 'aldeanos'} (contando a los roles especiales).` }),
      derived.setupWarning ? h('p', { class: 'notice notice-warn', style: 'margin: 0', text: errorMessage(derived.setupWarning) }) : null,
    );
  }

  const deck = Object.entries(counts).filter(([, n]) => n > 0)
    .map(([role, n]) => h('li', {}, h('span', { class: `badge ${badgeClass(role)}`, text: ROLE_LABELS[role] }), ` × ${n}`));

  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'lobby-title' },
    h('div', { class: 'phase-head' },
      h('h1', { id: 'lobby-title', class: 'phase-title', text: 'Sala de espera' }),
      h('span', { class: 'pill', text: `${count} de 18 jugadores` }),
    ),
    h('fieldset', { class: 'choice-group' },
      h('legend', { text: 'Roles especiales' }),
      h('p', { class: 'muted small', style: 'margin-top: 0', text: 'Cada rol activado se reparte a una persona. El resto de la aldea son Aldeanos.' }),
      OPTIONAL_ROLE_ORDER.map((role) => h('label', { class: 'choice' },
        h('input', {
          type: 'checkbox',
          dataset: { key: `role-${role}` },
          checked: Boolean(config.roles[role]),
          onchange: (event) => send('room:configure', { roles: { [role]: event.target.checked } }),
        }),
        h('span', {},
          h('strong', {}, `${ROLE_LABELS[role]} `, h('span', { class: `badge ${badgeClass(role)}`, text: teamOfRole(role) === 'wolves' ? 'Lobos' : 'Aldeanos' })),
          h('span', { class: 'muted small', text: ROLE_HINTS[role] }),
        ),
      )),
    ),
    h('div', { class: 'field' },
      h('label', { for: 'wolf-count', text: config.roles.alpha ? 'Lobos comunes (además del Lobo alfa)' : 'Número de lobos' }),
      h('select', {
        id: 'wolf-count',
        dataset: { key: 'wolf-count' },
        'aria-describedby': 'wolf-help',
        onchange: (event) => send('room:configure', { wolfCount: event.target.value === 'auto' ? null : Number(event.target.value) }),
      }, wolfOptions),
      h('p', { id: 'wolf-help', class: 'muted small', text: count >= 6
        ? `Con ${count} jugadores se recomiendan ${derived.recommendedWolfTotal} lobos en total y se permiten como máximo ${derived.maxWolfTotal}.`
        : 'Lo recomendado es un tercio de la mesa; el máximo se calcula al llegar a 6 jugadores.' }),
    ),
    h('fieldset', { class: 'choice-group' },
      h('legend', { text: 'Opciones' }),
      switchRow('revealDeadRoles', config.revealDeadRoles, 'Revelar el rol de cada jugador al morir'),
      switchRow('mayorBreaksTies', config.mayorBreaksTies, 'El Alcalde desempata las votaciones'),
      switchRow('showVotes', config.showVotes, 'Mostrar a todos quién votó a quién al cerrar la votación'),
    ),
    deck.length ? h('div', {}, h('h2', { text: 'Roles que se repartirán' }), h('ul', { class: 'deck' }, deck)) : null,
    status,
    h('button', {
      class: 'btn btn-primary btn-big btn-block',
      dataset: { key: 'start' },
      disabled: Boolean(derived.setupError),
      'aria-describedby': 'start-help',
      text: 'Iniciar partida y repartir roles',
      onclick: () => send('game:start'),
    }),
  );
}

function switchRow(key, checked, label) {
  return h('label', { class: 'switch' },
    h('input', { type: 'checkbox', dataset: { key: `opt-${key}` }, checked, onchange: (event) => send('room:configure', { [key]: event.target.checked }) }),
    label,
  );
}

function gameCard(s, nameOf) {
  const content = {
    start: () => startContent(),
    night: () => nightContent(s, nameOf),
    dawn: () => dawnContent(s, nameOf),
    day: () => dayContent(s, nameOf),
  }[s.phase]();
  return h('section', { class: `card card-highlight ${s.phase === 'night' ? 'night card-night' : ''}`, 'aria-labelledby': 'phase-title' },
    h('div', { class: 'phase-head' },
      h('h1', { id: 'phase-title', class: 'phase-title', text: PHASE_LABELS[s.phase] }),
      h('span', { class: 'pill', text: `Ronda ${s.round}${s.gameNumber > 1 ? ` · Partida ${s.gameNumber}` : ''}` }),
    ),
    content,
    s.phase === 'day' ? timerControls(s) : null,
    h('div', { class: 'row', style: 'margin-top: 16px' },
      h('button', {
        class: 'btn btn-danger btn-small',
        text: 'Terminar partida sin ganador',
        onclick: async () => {
          if (await confirmDialog({ title: '¿Terminar la partida?', message: 'Se revelarán todos los roles y no habrá ganador.', confirmLabel: 'Terminar', danger: true })) send('game:end');
        },
      }),
    ),
  );
}

function startContent() {
  return [
    h('p', { text: 'Cada jugador está viendo su rol en su teléfono. Pide que nadie mire las pantallas ajenas.' }),
    h('p', { class: 'muted', text: 'Los lobos ya ven quiénes son sus compañeros.' }),
    h('button', { class: 'btn btn-primary btn-big', dataset: { key: 'to-night' }, text: 'Empieza la primera noche', onclick: () => send('phase:advance', { to: 'night' }) }),
  ];
}

const NIGHT_ORDER = ['seer', 'protector', 'wolves', 'alpha', 'witch'];

function nightContent(s, nameOf) {
  const { night } = s;
  const info = s.derived.night;
  const step = info.step;
  const done = step === 'done';
  const currentIndex = done ? NIGHT_ORDER.length : NIGHT_ORDER.indexOf(step);
  const preview = info.preview;

  const stepDetail = (key) => {
    switch (key) {
      case 'seer': return night.seerTargetId ? `consultó a ${nameOf(night.seerTargetId)}` : null;
      case 'protector': return night.protectorTargetId ? `protegió a ${nameOf(night.protectorTargetId)}` : null;
      case 'wolves': return night.wolfTargetId ? `eligieron a ${nameOf(night.wolfTargetId)}` : null;
      case 'alpha': return night.alphaChoice ? (night.alphaChoice === 'convert' ? 'quiere convertir' : 'prefiere matar') : null;
      case 'witch': {
        if (!night.witch) return null;
        const parts = [night.witch.heal ? 'usó la poción de vida' : null, night.witch.poisonTargetId ? `envenenó a ${nameOf(night.witch.poisonTargetId)}` : null].filter(Boolean);
        return parts.length ? parts.join(' y ') : 'no usó pociones';
      }
      default: return null;
    }
  };

  // Only the steps of roles that are in this game (the wolves always are).
  const { counts } = s.derived.composition;
  const inGame = (key) => key === 'wolves' || (counts[key] ?? 0) > 0;
  const steps = h('ol', { class: 'steps', 'aria-label': 'Orden de la noche' }, NIGHT_ORDER.map((key, i) => {
    if (!inGame(key)) return null;
    const state = i < currentIndex ? 'is-done' : i === currentIndex ? 'is-current' : '';
    const skipped = night.skipped.includes(key);
    const detail = stepDetail(key);
    return h('li', { class: `step ${state}`, 'aria-current': i === currentIndex ? 'step' : null },
      h('strong', { text: NIGHT_STEP_LABELS[key] }),
      i === currentIndex ? h('span', { class: 'muted small', text: ` — actúa: ${info.actorIds.map(nameOf).join(', ')}` }) : null,
      detail ? h('span', { class: 'small', text: ` — ${detail}` }) : null,
      skipped ? h('span', { class: 'muted small', text: ' — saltado por el narrador' }) : null,
      i < currentIndex && !detail && !skipped ? h('span', { class: 'muted small', text: ' — no hubo acción' }) : null,
    );
  }));

  const wolfBallots = step === 'wolves'
    ? h('div', { class: 'vote-box' },
      h('h2', { text: 'Votos de los lobos' }),
      h('ul', { class: 'list' }, info.actorIds.map((id) => h('li', { class: 'list-item' },
        h('span', { class: 'name', text: nameOf(id) }),
        h('span', { class: night.wolfBallots[id] ? 'ballot-guilty' : 'ballot-none', text: night.wolfBallots[id] ? `elige a ${nameOf(night.wolfBallots[id])}` : 'pendiente' }),
      ))),
      info.wolvesDisagree ? h('p', { class: 'notice notice-warn', text: 'Los lobos no coinciden. Pídeles que voten de nuevo o declara que esta noche no hay víctima.' }) : null,
      info.wolvesDisagree ? h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', dataset: { key: 'wolves-revote' }, text: 'Pedir que voten de nuevo', onclick: () => send('night:wolvesRevote') }),
        h('button', { class: 'btn', dataset: { key: 'wolves-none' }, text: 'Sin víctima esta noche', onclick: () => send('night:skipStep', { step: 'wolves' }) }),
      ) : null,
    )
    : null;

  const deaths = preview.deaths.map((d) => `${nameOf(d.playerId)} (${CAUSE_LABELS[d.cause]})`);
  const previewText = deaths.length ? `Si amanece ahora, mueren: ${deaths.join(', ')}.` : 'Si amanece ahora, no muere nadie.';
  const extra = [
    preview.protectedId ? `El Protector salva a ${nameOf(preview.protectedId)}.` : null,
    preview.convertedId ? `${nameOf(preview.convertedId)} se convierte en lobo.` : null,
    preview.healedId ? `La Bruja salva a ${nameOf(preview.healedId)}.` : null,
  ].filter(Boolean).join(' ');

  return [
    h('p', { text: 'Pide a todos que cierren los ojos. Cada rol actúa desde su teléfono, en este orden. Los pasos sin nadie que actúe se saltan solos.' }),
    steps,
    wolfBallots,
    h('p', { class: 'notice notice-info', style: 'margin-top: 12px', text: `${previewText} ${extra}`.trim() }),
    done
      ? h('button', { class: 'btn btn-primary btn-big', dataset: { key: 'to-dawn' }, text: 'Amanecer', onclick: () => send('phase:advance', { to: 'dawn' }) })
      : h('div', { class: 'row' },
        h('button', {
          class: 'btn',
          dataset: { key: 'skip-step' },
          text: `Saltar: ${NIGHT_STEP_LABELS[step]}`,
          onclick: async () => {
            const okToSkip = await confirmDialog({
              title: `¿Saltar el ${NIGHT_STEP_LABELS[step].toLowerCase()}?`,
              message: step === 'wolves' ? 'Esta noche no habrá víctima de los lobos.' : 'Ese rol no actuará esta noche.',
              confirmLabel: 'Saltar',
            });
            if (okToSkip) send('night:skipStep', { step });
          },
        }),
      ),
  ];
}

function hunterBlock(s, nameOf) {
  if (!s.pendingShot) return null;
  return h('div', { class: 'vote-box', role: 'region', 'aria-labelledby': 'hunter-title' },
    h('h2', { id: 'hunter-title', text: `Disparo del Cazador: ${nameOf(s.pendingShot.hunterId)}` }),
    h('p', { text: 'Anuncia que era el Cazador. Elige desde su teléfono a quién se lleva consigo.' }),
    h('button', {
      class: 'btn btn-ghost',
      dataset: { key: 'hunter-skip' },
      text: 'Omitir el disparo',
      onclick: async () => {
        if (await confirmDialog({ title: '¿Omitir el disparo?', message: 'Úsalo solo si el Cazador no puede o no quiere disparar.', confirmLabel: 'Omitir' })) send('hunter:skip');
      },
    }),
  );
}

function dawnContent(s, nameOf) {
  const text = describeDawn(s.lastNight, nameOf);
  return [
    text ? h('p', { class: 'announcement' }, h('span', { class: 'visually-hidden', text: 'Anuncio para leer en voz alta: ' }), text) : null,
    s.config.revealDeadRoles && s.lastNight?.deathIds.length
      ? h('p', { class: 'muted', text: `Roles revelados: ${s.lastNight.deathIds.map((id) => `${nameOf(id)} era ${ROLE_LABELS[s.players.find((p) => p.id === id)?.role]}`).join('; ')}.` })
      : null,
    hunterBlock(s, nameOf),
    h('button', {
      class: 'btn btn-primary btn-big',
      dataset: { key: 'to-day' },
      disabled: Boolean(s.pendingShot),
      text: 'Empezar el día',
      onclick: () => send('phase:advance', { to: 'day' }),
    }),
  ];
}

function dayContent(s, nameOf) {
  const { vote, voteHeld } = s.day;
  const blocked = Boolean(vote) || Boolean(s.pendingShot);
  return [
    h('p', { class: 'muted', text: 'Discusión libre. Cualquier jugador acusa desde su teléfono; tú abres la votación entre los acusados. Solo hay una votación válida al día.' }),
    hunterBlock(s, nameOf),
    vote ? voteBlock(s, nameOf) : accusationsBlock(s, nameOf, voteHeld),
    h('div', { class: 'vote-box' },
      h('button', {
        class: 'btn btn-primary',
        dataset: { key: 'to-night' },
        disabled: blocked,
        text: 'Pasar a la noche',
        onclick: () => send('phase:advance', { to: 'night' }),
      }),
      blocked ? h('p', { class: 'muted small', text: s.pendingShot ? 'Espera el disparo del Cazador.' : 'Termina la votación en curso antes de pasar a la noche.' }) : null,
    ),
  ];
}

function accusationsBlock(s, nameOf, voteHeld) {
  const list = s.day.accusations;
  if (voteHeld) return h('p', { class: 'notice notice-info', text: 'La votación de hoy ya se resolvió. Cuando quieras, pasa a la noche.' });
  const candidates = [...new Set(list.map((a) => a.targetId))];
  return h('div', {},
    h('h2', { text: 'Acusaciones' }),
    list.length === 0
      ? h('p', { class: 'muted small', text: 'Nadie ha acusado todavía.' })
      : h('ul', { class: 'list' }, list.map((a) => h('li', { class: 'list-item' },
        h('span', {}, h('span', { class: 'name', text: nameOf(a.accuserId) }), ' acusa a ', h('span', { class: 'name', text: nameOf(a.targetId) })),
        h('button', {
          class: 'btn btn-ghost btn-small',
          dataset: { key: `dismiss-${a.id}` },
          'aria-label': `Descartar la acusación de ${nameOf(a.accuserId)} contra ${nameOf(a.targetId)}`,
          text: 'Descartar',
          onclick: () => send('day:dismissAccusation', { accusationId: a.id }),
        }),
      ))),
    h('button', {
      class: 'btn btn-primary',
      style: 'margin-top: 12px',
      dataset: { key: 'open-vote' },
      disabled: candidates.length === 0 || Boolean(s.pendingShot),
      text: candidates.length ? `Abrir votación entre: ${candidates.map(nameOf).join(', ')}` : 'Abrir votación',
      onclick: () => send('day:openVote'),
    }),
  );
}

function voteBlock(s, nameOf) {
  const vote = s.day.vote;
  const live = s.derived.liveVote;
  const voters = s.players.filter((p) => p.alive);
  const ballotOf = (id) => (Object.hasOwn(vote.ballots, id) ? vote.ballots[id] : undefined);

  const tally = (result) => h('div', { class: 'tally' }, vote.candidateIds.map((id) =>
    h('div', {}, h('strong', { text: result.weighted[id] ?? 0 }), nameOf(id))));

  if (vote.status === 'closed') {
    const r = vote.result;
    return h('div', { class: 'vote-box', role: 'region', 'aria-labelledby': 'vote-title' },
      h('h2', { id: 'vote-title', text: 'Resultado de la votación' }),
      tally(r),
      h('p', { class: 'announcement', text: describeVoteResult(r, nameOf) }),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', dataset: { key: 'confirm-vote' }, text: r.eliminatedId ? `Confirmar: sale ${nameOf(r.eliminatedId)}` : 'Confirmar: nadie sale', onclick: () => send('day:confirm', { accept: true }) }),
        h('button', {
          class: 'btn btn-danger',
          text: 'Anular votación',
          onclick: async () => {
            if (await confirmDialog({ title: '¿Anular la votación?', message: 'No tendrá ningún efecto y podrás repetirla. Quedará en el registro.', confirmLabel: 'Anular', danger: true })) send('day:confirm', { accept: false });
          },
        }),
      ),
    );
  }

  return h('div', { class: 'vote-box', role: 'region', 'aria-labelledby': 'vote-title' },
    h('h2', { id: 'vote-title', text: `Votación entre: ${vote.candidateIds.map(nameOf).join(', ')}` }),
    h('p', { text: `Han votado ${live.votedCount} de ${live.eligibleCount}.${s.derived.composition.counts.mayor ? ' El Alcalde cuenta doble en estos totales.' : ''}` }),
    h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: ui.showLiveVotes, dataset: { key: 'show-live-votes' }, onchange: (event) => { ui.showLiveVotes = event.target.checked; renderAll(); } }),
      'Mostrar en esta pantalla quién vota a quién',
    ),
    ui.showLiveVotes
      ? [
        tally(live),
        h('ul', { class: 'list' }, voters.map((p) => {
          const ballot = ballotOf(p.id);
          let text = 'Sin voto';
          let cls = 'ballot-none';
          if (ballot === null) text = 'Se abstiene';
          else if (ballot !== undefined) { text = `Vota contra ${nameOf(ballot)}`; cls = 'ballot-guilty'; }
          return h('li', { class: 'list-item' },
            h('span', { class: 'roster-meta' }, h('span', { class: 'name', text: p.name }), roleBadge(p.role)),
            h('span', { class: cls, text }),
          );
        })),
      ]
      : h('p', { class: 'muted small', text: 'Votos ocultos en esta pantalla (útil si la proyectas).' }),
    h('button', { class: 'btn btn-primary', dataset: { key: 'close-vote' }, text: 'Cerrar la votación', onclick: () => send('day:closeVote') }),
  );
}

function timerControls(s) {
  const select = h('select', { id: 'timer-minutes', 'aria-label': 'Duración del temporizador' },
    [1, 2, 3, 5, 10, 15].map((m) => h('option', { value: String(m * 60), selected: m === 3, text: `${m} min` })));
  return h('div', { class: 'vote-box' },
    h('h2', { text: 'Temporizador' }),
    h('div', { class: 'row' },
      s.timer ? h('span', { class: 'timer', id: 'timer', 'aria-live': 'off', text: '' }) : h('span', { class: 'muted small', text: 'Sin temporizador.' }),
      h('span', { style: 'max-width: 120px' }, select),
      h('button', { class: 'btn btn-small', text: 'Iniciar', onclick: () => send('timer:set', { seconds: Number(select.value) }) }),
      s.timer ? h('button', { class: 'btn btn-small btn-ghost', text: 'Quitar', onclick: () => send('timer:set', { seconds: 0 }) }) : null,
    ),
  );
}

function tickTimer() {
  const el = $('#timer');
  const timer = ui.state?.timer;
  if (!el || !timer) return;
  const left = timer.endsAt - (Date.now() + ui.clockOffset);
  el.textContent = left > 0 ? formatCountdown(left) : 'Tiempo';
  el.classList.toggle('is-over', left <= 0);
}

function badgeClass(role) {
  if (teamOfRole(role) === 'wolves') return 'badge-wolf';
  return role === 'villager' ? 'badge-village' : 'badge-special';
}

function roleBadge(role) {
  if (!role || !ui.showRoles) return null;
  return h('span', { class: `badge ${badgeClass(role)}`, text: ROLE_LABELS[role] });
}

function rosterCard(s) {
  const inLobby = s.phase === 'lobby';
  const inGame = IN_GAME.includes(s.phase);
  const aliveCount = s.players.filter((p) => p.alive).length;
  return h('section', { class: 'card', 'aria-labelledby': 'roster-title' },
    h('div', { class: 'row row-between' },
      h('h2', { id: 'roster-title', text: inLobby ? 'Jugadores conectados' : `Jugadores (${aliveCount} en juego)` }),
      inLobby ? null : h('label', { class: 'switch small' },
        h('input', { type: 'checkbox', checked: ui.showRoles, onchange: (event) => { ui.showRoles = event.target.checked; renderAll(); } }),
        'Mostrar roles',
      ),
    ),
    inLobby ? null : h('p', { class: 'muted small', text: 'Solo tú ves los roles. Ocúltalos si proyectas esta pantalla.' }),
    s.players.length === 0
      ? h('p', { class: 'muted', text: 'Todavía no hay nadie. Comparte el código o el QR.' })
      : h('ul', { class: 'list' }, s.players.map((p) => {
        const online = s.connections[p.id];
        return h('li', { class: `list-item ${p.alive ? '' : 'is-out'}` },
          h('span', { class: 'roster-meta' },
            h('span', { class: `dot ${online ? 'dot-ok' : 'dot-off'}`, role: 'img', 'aria-label': online ? 'Conectado' : 'Desconectado' }),
            h('span', { class: 'name', text: p.name }),
            roleBadge(p.role),
            inLobby ? null : h('span', { class: 'muted small', text: p.alive ? 'En juego' : `${describeStatus(p)} · ${CAUSE_LABELS[p.eliminatedBy] ?? ''}` }),
          ),
          inLobby
            ? h('button', {
              class: 'btn btn-ghost btn-small',
              dataset: { key: `kick-${p.id}` },
              'aria-label': `Expulsar a ${p.name}`,
              text: 'Expulsar',
              onclick: () => send('room:kick', { playerId: p.id }),
            })
            : inGame && p.alive
              ? h('button', {
                class: 'btn btn-ghost btn-small',
                dataset: { key: `retire-${p.id}` },
                'aria-label': `Retirar a ${p.name} de la partida`,
                text: 'Retirar',
                onclick: async () => {
                  const okToRetire = await confirmDialog({
                    title: `¿Retirar a ${p.name}?`,
                    message: 'Cuenta como una eliminación: no se revela su rol, el Cazador no dispara y puede decidir la partida.',
                    confirmLabel: 'Retirar',
                    danger: true,
                  });
                  if (okToRetire) send('room:kick', { playerId: p.id });
                },
              })
              : null,
        );
      })),
  );
}

function endedCard(s) {
  const summary = s.summary;
  const text = summary ? summary[ui.summaryFormat] : '';
  const fileBase = `hombres-lobos-${s.code}-partida-${s.gameNumber}`;
  const tab = (format, label) => h('button', {
    class: 'btn btn-small',
    'aria-pressed': String(ui.summaryFormat === format),
    text: label,
    onclick: () => { ui.summaryFormat = format; renderAll(); },
  });

  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'ended-title' },
    h('h1', { id: 'ended-title', class: 'winner', text: WINNER_LABELS[s.winner] }),
    summary?.data.closingLine ? h('p', { class: 'closing', text: `«${summary.data.closingLine}»` }) : null,
    h('p', { class: 'muted', text: 'Los roles ya son visibles para todos. Comparte el resumen de la partida:' }),
    h('div', { class: 'row', style: 'margin-bottom: 8px' },
      h('div', { class: 'tabs', role: 'group', 'aria-label': 'Formato del resumen' }, tab('markdown', 'Markdown'), tab('whatsapp', 'WhatsApp')),
    ),
    h('pre', { class: 'summary', id: 'summary-text', tabindex: '0', 'aria-label': 'Resumen de la partida', text }),
    h('div', { class: 'row', style: 'margin-top: 12px' },
      h('button', { class: 'btn btn-primary', text: 'Copiar resumen', onclick: () => copyText(text, 'Resumen copiado.', $('#summary-text')) }),
      h('button', {
        class: 'btn',
        text: 'Descargar .md',
        onclick: () => downloadBlob(new Blob([summary.markdown], { type: 'text/markdown;charset=utf-8' }), `${fileBase}.md`),
      }),
      h('button', {
        class: 'btn',
        text: 'Descargar imagen',
        onclick: async () => {
          if (!(await downloadSummaryImage(summary.data, `${fileBase}.png`))) toast('No se pudo generar la imagen.', { kind: 'error' });
        },
      }),
    ),
    h('div', { class: 'vote-box' },
      h('button', {
        class: 'btn btn-primary btn-big',
        text: 'Nueva partida con los mismos jugadores',
        onclick: async () => {
          if (await confirmDialog({ title: '¿Nueva partida?', message: 'Volverán todos a la sala de espera con la misma configuración de roles.', confirmLabel: 'Empezar otra' })) send('game:rematch');
        },
      }),
    ),
  );
}

function logCard(s, nameOf) {
  const groups = groupByRound(s.log);
  return h('section', { class: 'card', 'aria-labelledby': 'log-title' },
    h('h2', { id: 'log-title', text: 'Registro de eventos' }),
    h('p', { class: 'muted small', text: 'Solo lo ves tú: incluye roles, habilidades y votos.' }),
    h('div', { class: 'log', id: 'log', tabindex: '0', 'aria-label': 'Registro de eventos por ronda' },
      groups.length === 0 ? h('p', { class: 'muted', text: 'Sin eventos todavía.' }) : null,
      groups.map((group) => [
        h('h3', { text: roundTitle(group.round) }),
        h('ol', {}, group.entries.map((entry) => h('li', {},
          h('time', { datetime: new Date(entry.at).toISOString(), text: formatTime(entry.at) }),
          h('span', { text: describeLogEntry(entry, nameOf) }),
        ))),
      ]),
    ),
  );
}

let logPinnedToEnd = true;
function scrollLogToEnd() {
  const log = $('#log');
  if (!log) return;
  if (logPinnedToEnd) log.scrollTop = log.scrollHeight;
  log.addEventListener('scroll', () => {
    logPinnedToEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 24;
  }, { passive: true });
}

async function copyText(text, okMessage, fallbackElement) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage, { kind: 'ok' });
  } catch {
    // Older or embedded browsers may refuse the Clipboard API: select the text and try the legacy command.
    const target = fallbackElement ?? h('textarea', { class: 'visually-hidden', value: text });
    if (!fallbackElement) document.body.append(target);
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    if (!fallbackElement) target.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    if (!fallbackElement) target.remove();
    if (copied) toast(okMessage, { kind: 'ok' });
    else toast('No se pudo copiar automáticamente. El texto quedó seleccionado: cópialo con Ctrl+C o Cmd+C.', { kind: 'error', timeoutMs: 7000 });
  }
}

// Narrator screen: create the room, run the lobby and every phase, see roles and votes,
// read the event log and share the final summary.

import { connect, currentServer, resetServer } from './net.js';
import { $, announce, confirmDialog, h, render, toast, whenIdle } from './dom.js';
import {
  CLASSIC_NOTE,
  MODE_LABELS,
  PHASE_LABELS,
  ROLE_LABELS,
  WINNER_LABELS,
  errorMessage,
} from './texts.js';
import {
  describeLastNight,
  describeLogEntry,
  describeStatus,
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

const SESSION_KEY = 'mafia:narrator';
const server = currentServer();
const conn = connect(server.url);

const ui = {
  state: null,
  clockOffset: 0,
  showRoles: true,
  showQrInGame: false,
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
    ['dawn', 'day', 'night'].includes(s.phase) ? gameCard(s, nameOf) : null,
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

function modeChoices(name, current, onchange) {
  return h('fieldset', { class: 'choice-group' },
    h('legend', { text: 'Modo de juego' }),
    h('label', { class: 'choice' },
      h('input', { type: 'radio', name, value: 'original', checked: current === 'original', onchange }),
      h('span', {}, h('strong', { text: MODE_LABELS.original }), h('span', { class: 'muted small', text: 'Reglas originales: Honestos contra Mafia, sin roles especiales.' })),
    ),
    h('label', { class: 'choice' },
      h('input', { type: 'radio', name, value: 'classic', checked: current === 'classic', onchange }),
      h('span', {},
        h('strong', {}, `${MODE_LABELS.classic} `, h('span', { class: 'badge badge-variant', text: 'Variante, no original' })),
        h('span', { class: 'muted small', text: `Añade Vidente y Doctor. ${CLASSIC_NOTE}` }),
      ),
    ),
  );
}

function createCard() {
  let mode = 'original';
  const form = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const answer = await send('room:create', { mode, timeZone });
      button.disabled = false;
      if (!answer.ok) return;
      save(SESSION_KEY, { code: answer.code, narratorToken: answer.narratorToken, server: server.url });
      setState(answer.state);
    },
  },
  modeChoices('create-mode', mode, (event) => { mode = event.target.value; }),
  h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block', text: 'Crear sala' }),
  );
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'create-title' },
    h('h1', { id: 'create-title', text: 'Nueva sala' }),
    h('p', { class: 'muted', text: 'Crea la sala y comparte el código o el QR. Los jugadores se unen desde su teléfono, sin cuenta ni registro.' }),
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
      h('span', { class: s.mode === 'classic' ? 'badge badge-variant' : 'badge', text: MODE_LABELS[s.mode] }),
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
  const { derived } = s;
  const count = s.players.length;
  const max = derived.maxMafiaCount;
  const enough = count >= 6;
  const mafiaOptions = [
    h('option', { value: 'auto', selected: s.config.mafiaCount === null, text: enough ? `Según la tabla (${derived.recommendedMafiaCount})` : 'Según la tabla' }),
    ...Array.from({ length: Math.max(enough ? max : 0, s.config.mafiaCount ?? 0) }, (_, i) => i + 1).map((n) =>
      h('option', { value: String(n), selected: s.config.mafiaCount === n, text: String(n) })),
  ];
  const missing = Math.max(0, 6 - count);
  const status = derived.setupError
    ? h('p', { id: 'start-help', class: 'notice notice-warn', text: missing > 0 ? `Faltan ${missing} ${missing === 1 ? 'jugador' : 'jugadores'} (mínimo 6).` : errorMessage(derived.setupError) })
    : h('p', { id: 'start-help', class: 'notice notice-info', text: `Habrá ${derived.effectiveMafiaCount} ${derived.effectiveMafiaCount === 1 ? 'mafioso' : 'mafiosos'} entre ${count} jugadores.` });

  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'lobby-title' },
    h('div', { class: 'phase-head' },
      h('h1', { id: 'lobby-title', class: 'phase-title', text: 'Sala de espera' }),
      h('span', { class: 'pill', text: `${count} de 20 jugadores` }),
    ),
    modeChoices('lobby-mode', s.mode, (event) => send('room:configure', { mode: event.target.value })),
    h('div', { class: 'field' },
      h('label', { for: 'mafia-count', text: 'Número de mafiosos' }),
      h('select', {
        id: 'mafia-count',
        dataset: { key: 'mafia-count' },
        'aria-describedby': 'mafia-help',
        onchange: (event) => send('room:configure', { mafiaCount: event.target.value === 'auto' ? null : Number(event.target.value) }),
      }, mafiaOptions),
      h('p', { id: 'mafia-help', class: 'muted small', text: `Tabla del original: 6–7 jugadores → 2; 8–10 → 3; 11–13 → 4; 14–16 → 5. ${enough ? `Con ${count} jugadores se permiten de 1 a ${max}.` : 'El rango permitido se calcula al llegar a 6 jugadores.'}` }),
    ),
    h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: s.config.showScore, onchange: (event) => send('room:configure', { showScore: event.target.checked }) }),
      'Incluir la puntuación en el resumen',
    ),
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

function gameCard(s, nameOf) {
  const content = {
    dawn: () => dawnContent(),
    day: () => dayContent(s, nameOf),
    night: () => nightContent(s, nameOf),
  }[s.phase]();
  return h('section', { class: `card card-highlight ${s.phase === 'night' ? 'night card-night' : ''}`, 'aria-labelledby': 'phase-title' },
    h('div', { class: 'phase-head' },
      h('h1', { id: 'phase-title', class: 'phase-title', text: PHASE_LABELS[s.phase] }),
      h('span', { class: 'pill', text: `Ronda ${s.round}${s.gameNumber > 1 ? ` · Partida ${s.gameNumber}` : ''}` }),
    ),
    content,
    timerControls(s),
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

function dawnContent() {
  return [
    h('p', { text: 'Cada jugador está viendo su rol en su teléfono. Pide que nadie mire las pantallas ajenas.' }),
    h('p', { class: 'muted', text: 'Reconocimiento: los mafiosos ya ven quiénes son sus compañeros.' }),
    h('button', { class: 'btn btn-primary btn-big', dataset: { key: 'to-day' }, text: 'Empezar el día', onclick: () => send('phase:advance', { to: 'day' }) }),
  ];
}

function dayContent(s, nameOf) {
  const lastNight = s.lastNight && s.lastNight.round === s.round - 1 ? describeLastNight(s.lastNight, nameOf, s.mode) : null;
  const requests = s.derived.nightRequests;
  const voteOpen = Boolean(s.day.vote);
  const canNight = !voteOpen && (s.mode === 'classic' || (requests && requests.count >= requests.needed));
  const nightHelp = s.mode === 'classic'
    ? 'En la variante clásica hay noche en cada ronda.'
    : `Piden la noche: ${requests.count} de ${requests.needed} necesarios${requests.playerIds.length ? ` (${requests.playerIds.map(nameOf).join(', ')})` : ''}.`;

  return [
    lastNight ? h('p', { class: 'announcement' }, h('span', { class: 'visually-hidden', text: 'Anuncio para leer en voz alta: ' }), lastNight) : null,
    h('p', { class: 'muted', text: 'Discusión libre. Cualquier jugador puede acusar desde su teléfono; tú abres la votación.' }),
    accusationsBlock(s, nameOf),
    s.day.vote ? voteBlock(s, nameOf) : null,
    h('div', { class: 'vote-box' },
      h('p', { id: 'night-help', class: 'small', text: nightHelp }),
      h('button', {
        class: 'btn btn-primary',
        dataset: { key: 'to-night' },
        disabled: !canNight,
        'aria-describedby': 'night-help',
        text: 'Pasar a la noche',
        onclick: () => send('phase:advance', { to: 'night' }),
      }),
      voteOpen ? h('p', { class: 'muted small', text: 'Termina la votación en curso antes de pasar a la noche.' }) : null,
    ),
  ];
}

function accusationsBlock(s, nameOf) {
  const list = s.day.accusations;
  return h('div', {},
    h('h2', { text: 'Acusaciones' }),
    list.length === 0
      ? h('p', { class: 'muted small', text: 'Nadie ha pedido votación todavía.' })
      : h('ul', { class: 'list' }, list.map((a) => h('li', { class: 'list-item' },
        h('span', {}, h('span', { class: 'name', text: nameOf(a.accuserId) }), ' acusa a ', h('span', { class: 'name', text: nameOf(a.targetId) })),
        h('span', { class: 'row' },
          h('button', {
            class: 'btn btn-primary btn-small',
            dataset: { key: `open-${a.id}` },
            disabled: Boolean(s.day.vote),
            'aria-label': `Abrir votación contra ${nameOf(a.targetId)}`,
            text: 'Abrir votación',
            onclick: () => send('day:openVote', { accusationId: a.id }),
          }),
          h('button', {
            class: 'btn btn-ghost btn-small',
            dataset: { key: `dismiss-${a.id}` },
            'aria-label': `Descartar la acusación contra ${nameOf(a.targetId)}`,
            text: 'Descartar',
            onclick: () => send('day:dismissAccusation', { accusationId: a.id }),
          }),
        ),
      ))),
  );
}

function voteBlock(s, nameOf) {
  const vote = s.day.vote;
  const accused = nameOf(vote.accusedId);
  const live = s.derived.liveVote;
  const voters = s.players.filter((p) => p.alive && p.id !== vote.accusedId);
  const ballotOf = (id) => (Object.hasOwn(vote.ballots, id) ? vote.ballots[id] : null);
  const showVotes = s.config.showVotes;

  if (vote.status === 'closed') {
    const r = vote.result;
    return h('div', { class: 'vote-box', role: 'region', 'aria-labelledby': 'vote-title' },
      h('h2', { id: 'vote-title', text: `Resultado: ${accused}` }),
      h('div', { class: 'tally' },
        h('div', {}, h('strong', { text: r.guiltyCount }), 'Culpable'),
        h('div', {}, h('strong', { text: r.notGuiltyCount }), 'No culpable'),
        h('div', {}, h('strong', { text: r.abstainedCount }), 'Sin voto'),
      ),
      h('p', { class: 'announcement', text: r.passed
        ? `${accused} queda eliminado: ${r.guiltyCount} de ${r.eligibleCount} votos «culpable» (se necesitaban ${r.required}).`
        : `${accused} queda absuelto: ${r.guiltyCount} de ${r.eligibleCount} votos «culpable» (se necesitaban ${r.required}).` }),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', dataset: { key: 'confirm-vote' }, text: r.passed ? 'Confirmar eliminación' : 'Confirmar absolución', onclick: () => send('day:confirm', { accept: true }) }),
        h('button', {
          class: 'btn btn-danger',
          text: 'Anular votación',
          onclick: async () => {
            if (await confirmDialog({ title: '¿Anular la votación?', message: 'No tendrá ningún efecto y quedará en el registro.', confirmLabel: 'Anular', danger: true })) send('day:confirm', { accept: false });
          },
        }),
      ),
    );
  }

  return h('div', { class: 'vote-box', role: 'region', 'aria-labelledby': 'vote-title' },
    h('h2', { id: 'vote-title', text: `Votación: ¿${accused} es culpable?` }),
    h('p', { class: 'muted small', text: `Acusa: ${nameOf(vote.accuserId)}. El acusado no vota.` }),
    h('p', { text: `Han votado ${live.guiltyCount + live.notGuiltyCount} de ${live.eligibleCount}. Se necesitan ${live.required} votos «culpable».` }),
    h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: showVotes, dataset: { key: 'show-votes' }, onchange: (event) => send('room:configure', { showVotes: event.target.checked }) }),
      'Mostrar quién vota qué en esta pantalla',
    ),
    showVotes
      ? [
        h('div', { class: 'tally' },
          h('div', {}, h('strong', { text: live.guiltyCount }), 'Culpable'),
          h('div', {}, h('strong', { text: live.notGuiltyCount }), 'No culpable'),
          h('div', {}, h('strong', { text: live.abstainedCount }), 'Sin voto'),
        ),
        h('ul', { class: 'list' }, voters.map((p) => {
          const ballot = ballotOf(p.id);
          return h('li', { class: 'list-item' },
            h('span', { class: 'name', text: p.name }),
            ballot === null
              ? h('span', { class: 'ballot-none', text: 'Sin voto' })
              : h('span', { class: ballot ? 'ballot-guilty' : 'ballot-innocent', text: ballot ? 'Culpable' : 'No culpable' }),
          );
        })),
      ]
      : h('p', { class: 'muted small', text: 'Votos ocultos en esta pantalla.' }),
    h('button', { class: 'btn btn-primary', dataset: { key: 'close-vote' }, text: 'Cerrar la votación', onclick: () => send('day:closeVote') }),
  );
}

function nightContent(s, nameOf) {
  const progress = s.derived.nightProgress;
  const preview = s.derived.nightPreview;
  const pending = progress.expected - progress.submitted;
  const alive = s.players.filter((p) => p.alive);
  const usesAbility = (p) => s.mode === 'classic' && (p.role === 'seer' || p.role === 'doctor');

  let previewText = 'Si cierras la noche ahora, no muere nadie.';
  if (preview.victimId) previewText = `Si cierras la noche ahora, muere ${nameOf(preview.victimId)}.`;
  else if (preview.saved) previewText = `Si cierras la noche ahora, el Doctor salva a ${nameOf(preview.intendedVictimId)}.`;

  return [
    h('p', { text: 'Todos entregan su papeleta en secreto: los honestos marcan «Honesto» y los mafiosos eligen a una víctima.' }),
    h('p', { class: 'pill', text: `Papeletas: ${progress.submitted} de ${progress.expected}` }),
    h('ul', { class: 'list', style: 'margin-top: 12px' }, alive.map((p) => {
      let text;
      let cls = 'ballot-none';
      if (usesAbility(p)) {
        const target = s.night.abilities[p.id];
        text = target ? `${p.role === 'seer' ? 'Consulta a' : 'Protege a'} ${nameOf(target)}` : 'Pendiente';
        if (target) cls = '';
      } else if (Object.hasOwn(s.night.ballots, p.id)) {
        const target = s.night.ballots[p.id];
        text = target ? `Elige a ${nameOf(target)}` : 'Honesto';
        cls = target ? 'ballot-guilty' : '';
      } else {
        text = 'Pendiente';
      }
      return h('li', { class: 'list-item' },
        h('span', { class: 'roster-meta' }, h('span', { class: 'name', text: p.name }), roleBadge(p.role)),
        h('span', { class: cls, text }),
      );
    })),
    h('p', { class: 'notice notice-info', style: 'margin-top: 12px', text: previewText }),
    h('button', {
      class: 'btn btn-primary btn-big',
      dataset: { key: 'to-dawn' },
      text: 'Cerrar la noche y amanecer',
      onclick: async () => {
        if (pending > 0) {
          const okToClose = await confirmDialog({
            title: `Faltan ${pending} ${pending === 1 ? 'papeleta' : 'papeletas'}`,
            message: 'Si cierras ahora, la papeleta que falte de un honesto cuenta como «Honesto» y la de un mafioso como «sin víctima» (esa noche no muere nadie).',
            confirmLabel: 'Cerrar igualmente',
          });
          if (!okToClose) return;
        }
        send('phase:advance', { to: 'day' });
      },
    }),
  ];
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

function roleBadge(role) {
  if (!role || !ui.showRoles) return null;
  const cls = role === 'mafia' ? 'badge-mafia' : role === 'honest' ? 'badge-honest' : 'badge-special';
  return h('span', { class: `badge ${cls}`, text: ROLE_LABELS[role] });
}

function rosterCard(s) {
  const inLobby = s.phase === 'lobby';
  const inGame = ['dawn', 'day', 'night'].includes(s.phase);
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
            inLobby ? null : h('span', { class: 'muted small', text: describeStatus(p) }),
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
                    message: 'Cuenta como una eliminación: no se revela su rol y puede decidir la partida.',
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
  const fileBase = `mafia-${s.code}-partida-${s.gameNumber}`;
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
          if (await confirmDialog({ title: '¿Nueva partida?', message: 'Volverán todos a la sala de espera y la puntuación se acumulará.', confirmLabel: 'Empezar otra' })) send('game:rematch');
        },
      }),
    ),
  );
}

function logCard(s, nameOf) {
  const groups = groupByRound(s.log);
  return h('section', { class: 'card', 'aria-labelledby': 'log-title' },
    h('h2', { id: 'log-title', text: 'Registro de eventos' }),
    h('p', { class: 'muted small', text: 'Solo lo ves tú: incluye roles y papeletas.' }),
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

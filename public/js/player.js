// Player screen: join with the room code, see your role in private, follow the
// public state and act in each phase. Secrets live only behind covered cards (ADR-010).

import { connect, currentServer, resetServer } from './net.js';
import { $, announce, confirmDialog, h, render, toast, whenIdle } from './dom.js';
import { PHASE_LABELS, ROLE_LABELS, WINNER_LABELS, errorMessage, teamOfRole } from './texts.js';
import { describeDawn, describeStatus, formatCountdown, namer } from './format.js';
import { accuseOptions, endMessage, hunterPanel, nightPanel, parseRoomCode, roleCard, voteView } from './player-logic.js';
import { mountRules } from './rules-ui.js';
import { load, loadTab, removeTab, save, saveTab } from './storage.js';

const SESSIONS_KEY = 'lobos:player:sessions'; // localStorage: { [code:playerId]: session }, survives closing the tab
const TAB_KEY = 'lobos:player:tab'; // sessionStorage: this tab's session, so several tabs can play
// Hidden cards cover themselves after this long without interaction (ADR-010).
const REVEAL_MS = { role: 10_000, night: 20_000 };

const server = currentServer();
const conn = connect(server.url);
const params = new URLSearchParams(location.search);

const ui = {
  public: null,
  me: null,
  session: null,
  pendingClaim: null,
  notice: null,
  replaced: false,
  clockOffset: 0,
  lastPhase: null,
  reveal: null, // 'role' | 'night' | null
  revealTimer: null,
  draft: { code: parseRoomCode(params.get('sala')) ?? '', name: '' },
  joinError: null,
  joining: false,
  // Unsent selections survive re-renders caused by other players' actions.
  nightChoice: undefined,
  accuseTarget: '',
  voteTarget: undefined,
  resumeOffers: [], // sessions saved by earlier tabs: offered, never resumed silently
};

// --- Sessions -----------------------------------------------------------------

function storedSessions() {
  return load(SESSIONS_KEY) ?? {};
}

/** This tab's own session: resumed automatically after a reload. */
function tabSession(code) {
  const tab = loadTab(TAB_KEY);
  return tab && tab.server === server.url && (!code || tab.code === code) ? tab : null;
}

/**
 * A session saved by a tab that was closed. It is only offered ("Seguir como…"):
 * resuming it silently would steal the seat when several people share a browser.
 */
function savedSessions(code) {
  const sessions = Object.values(storedSessions())
    .filter((s) => s.server === server.url)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  const room = code ?? sessions[0]?.code;
  return sessions.filter((s) => s.code === room);
}

function rememberSession(session) {
  ui.session = session;
  saveTab(TAB_KEY, session);
  const all = storedSessions();
  all[`${session.code}:${session.playerId}`] = { ...session, savedAt: Date.now() };
  // Keep only the eight most recent seats.
  const recent = Object.entries(all).sort(([, a], [, b]) => (b.savedAt ?? 0) - (a.savedAt ?? 0)).slice(0, 8);
  save(SESSIONS_KEY, Object.fromEntries(recent));
  if (params.get('sala') !== session.code) {
    const url = new URL(location.href);
    url.searchParams.set('sala', session.code);
    history.replaceState(null, '', url);
  }
}

/** Forgets this tab's seat in `code` (or a specific saved seat). */
function forgetSession(code, playerId = ui.session?.playerId ?? loadTab(TAB_KEY)?.playerId) {
  ui.session = null;
  const tab = loadTab(TAB_KEY);
  if (tab?.code === code) removeTab(TAB_KEY);
  const all = storedSessions();
  delete all[`${code}:${playerId}`];
  save(SESSIONS_KEY, all);
}

// --- Wiring ---------------------------------------------------------------------

mountRules($('#rules'));
$('#server-info').replaceChildren(
  `Servidor: ${server.url}`,
  server.custom ? ' · ' : '',
  server.custom ? h('button', { class: 'btn btn-ghost btn-small', text: 'Usar el servidor predeterminado', onclick: () => { resetServer(); location.href = location.pathname; } }) : '',
);

conn.onStatus(renderConnection);
conn.on('connect', restoreSession);
conn.on('state:public', (state) => {
  ui.public = state;
  onStateChange();
});
conn.on('state:private', ({ me }) => {
  ui.me = me;
  onStateChange();
});
conn.on('seat:granted', (grant) => {
  ui.pendingClaim = null;
  rememberSession({ code: grant.code, playerId: grant.playerId, playerToken: grant.playerToken, name: grant.state.me.name, server: server.url });
  applyState(grant.state);
  toast('El narrador te devolvió tu asiento.', { kind: 'ok' });
});
conn.on('seat:rejected', () => {
  ui.pendingClaim = null;
  ui.notice = { title: 'Solicitud rechazada', text: 'El narrador no aprobó que recuperes ese asiento desde este dispositivo.' };
  renderAll();
});
conn.on('room:kicked', ({ code }) => {
  forgetSession(code);
  ui.public = null;
  ui.me = null;
  ui.notice = { title: 'Saliste de la sala', text: 'El narrador te sacó de la sala de espera.' };
  renderAll();
});
conn.on('session:replaced', () => {
  ui.replaced = true;
  renderAll();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') cover();
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
  ui.pendingClaim = null; // a pending claim does not survive a reconnection
  const session = ui.session ?? tabSession(ui.draft.code || null);
  if (!session) {
    ui.resumeOffers = savedSessions(ui.draft.code || null);
    renderAll();
    return;
  }
  await resume(session);
}

async function resume(session) {
  ui.resumeOffers = [];
  const answer = await conn.request('room:rejoin', { code: session.code, playerToken: session.playerToken });
  if (answer.ok) {
    ui.session = session;
    rememberSession(session);
    applyState(answer.state);
    return;
  }
  if (answer.error === 'INVALID_TOKEN' || answer.error === 'ROOM_NOT_FOUND') {
    forgetSession(session.code, session.playerId);
    ui.draft = { code: session.code, name: session.name };
    ui.notice = answer.error === 'ROOM_NOT_FOUND'
      ? { title: 'La sala ya no existe', text: 'Puede que el servidor se haya reiniciado. Pide al narrador el código de la nueva sala.' }
      : { title: 'Tu sesión ya no es válida', text: 'Vuelve a entrar con tu nombre. Si la partida ya empezó, el narrador tendrá que aprobarlo.' };
    ui.public = null;
    ui.me = null;
    renderAll();
    return;
  }
  toast(errorMessage(answer.error), { kind: 'error' });
}

function applyState(state) {
  const { me, ...rest } = state;
  ui.public = rest;
  ui.me = me;
  onStateChange();
}

function onStateChange() {
  const s = ui.public;
  if (!s) return renderAll();
  ui.clockOffset = s.serverNow - Date.now();
  if (ui.lastPhase !== s.phase) {
    if (ui.lastPhase) announce(s.phase === 'ended' ? WINNER_LABELS[s.winner] : `Fase: ${PHASE_LABELS[s.phase]}`);
    ui.lastPhase = s.phase;
    cover();
  }
  renderAll();
}

// --- Hidden cards --------------------------------------------------------------------

function reveal(which) {
  ui.reveal = which;
  keepRevealed();
  renderAll();
}

/** Restarts the auto-cover countdown: called on every interaction with an open card. */
function keepRevealed() {
  clearTimeout(ui.revealTimer);
  if (ui.reveal) ui.revealTimer = setTimeout(cover, REVEAL_MS[ui.reveal]);
}

const revealedCardEvents = { onpointerdown: keepRevealed, onkeydown: keepRevealed, onchange: keepRevealed };

function cover() {
  clearTimeout(ui.revealTimer);
  ui.nightChoice = undefined;
  if (ui.reveal === null) return;
  ui.reveal = null;
  renderAll();
}

// --- Rendering -------------------------------------------------------------------------

function renderConnection(status) {
  const labels = { connected: 'Conectado', connecting: 'Conectando…', error: 'Sin conexión' };
  const dots = { connected: 'dot-ok', connecting: 'dot-warn', error: 'dot-off' };
  render($('#connection'), h('span', { class: `dot ${dots[status]}`, 'aria-hidden': 'true' }), labels[status]);
  if (!ui.public) renderAll();
}

function renderAll() {
  whenIdle(renderNow);
}

function renderNow() {
  const app = $('#app');
  if (ui.replaced) return render(app, replacedCard());
  if (ui.pendingClaim) return render(app, claimCard());
  if (!ui.public || !ui.me) return render(app, ui.notice ? noticeCard() : null, conn.status === 'connected' ? joinCard() : connectingCard());

  const s = { ...ui.public, me: ui.me };
  const nameOf = namer(s.players);
  render(app,
    statusStrip(s),
    s.phase === 'lobby' ? lobbyCard(s) : null,
    hunterCard(s),
    ['start', 'night', 'dawn', 'day'].includes(s.phase) ? roleSection(s) : null,
    s.phase === 'start' ? startCard() : null,
    s.phase === 'dawn' ? dawnCard(s, nameOf) : null,
    s.phase === 'day' ? dayCard(s, nameOf) : null,
    s.phase === 'night' ? nightCard(s, nameOf) : null,
    s.phase === 'ended' ? endedCard(s) : null,
    playersCard(s),
  );
  tickTimer();
}

function connectingCard() {
  const failed = conn.status === 'error';
  return h('section', { class: 'card' },
    h('h1', { text: failed ? 'No se puede conectar con el servidor' : 'Conectando con el servidor…' }),
    h('p', { class: 'muted', text: failed
      ? 'Seguimos intentándolo. Si el servidor usa un plan gratuito puede tardar alrededor de un minuto en despertar.'
      : 'Un momento, por favor.' }),
  );
}

function noticeCard() {
  return h('section', { class: 'notice notice-warn', role: 'status' },
    h('strong', { text: ui.notice.title }),
    h('p', { class: 'small', style: 'margin: 4px 0 0', text: ui.notice.text }),
  );
}

function replacedCard() {
  return h('section', { class: 'card card-highlight' },
    h('h1', { text: 'Abriste esta partida en otro lugar' }),
    h('p', { text: 'Tu asiento se está usando en otra pestaña o dispositivo. Solo una pantalla puede jugar a la vez.' }),
    h('button', {
      class: 'btn btn-primary btn-block',
      text: 'Jugar desde aquí',
      onclick: () => {
        ui.replaced = false;
        conn.socket.connect();
        renderAll();
      },
    }),
  );
}

function joinCard() {
  const codeInput = h('input', {
    id: 'join-code',
    class: 'code-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    maxlength: '5',
    required: true,
    value: ui.draft.code,
    'aria-describedby': 'join-code-help',
    oninput: (event) => { ui.draft.code = event.target.value.toUpperCase(); },
  });
  const nameInput = h('input', {
    id: 'join-name',
    type: 'text',
    autocomplete: 'nickname',
    maxlength: '20',
    required: true,
    value: ui.draft.name,
    oninput: (event) => { ui.draft.name = event.target.value; },
  });

  const form = h('form', {
    novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      const code = parseRoomCode(codeInput.value);
      const name = nameInput.value.trim();
      if (!code) return showJoinError('El código tiene 5 caracteres, por ejemplo ABCDE.', codeInput);
      if (!name) return showJoinError('Escribe tu nombre.', nameInput);
      ui.joining = true;
      ui.joinError = null;
      ui.draft = { code, name };
      renderAll();
      const answer = await conn.request('room:join', { code, name });
      ui.joining = false;
      if (!answer.ok) return showJoinError(errorMessage(answer.error), answer.error === 'ROOM_NOT_FOUND' ? codeInput : nameInput);
      ui.notice = null;
      if (answer.pending) {
        ui.pendingClaim = { code, claimId: answer.claimId, name };
        renderAll();
        return;
      }
      rememberSession({ code, playerId: answer.playerId, playerToken: answer.playerToken, name: answer.state.me.name, server: server.url });
      applyState(answer.state);
    },
  },
  h('div', { class: 'field' },
    h('label', { for: 'join-code', text: 'Código de la sala' }),
    codeInput,
    h('p', { id: 'join-code-help', class: 'muted small', text: 'Te lo da el narrador. También puedes escanear su QR.' }),
  ),
  h('div', { class: 'field' },
    h('label', { for: 'join-name', text: 'Tu nombre' }),
    nameInput,
  ),
  ui.joinError ? h('p', { id: 'join-error', class: 'field-error', role: 'alert', text: ui.joinError }) : null,
  h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block', disabled: ui.joining, text: ui.joining ? 'Entrando…' : 'Entrar a la sala' }),
  );

  const offers = ui.resumeOffers;
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'join-title' },
    h('h1', { id: 'join-title', text: offers.length ? 'Vuelve a la partida' : 'Únete a la partida' }),
    offers.length ? h('div', { class: 'notice notice-info stack', style: 'margin-bottom: 16px; gap: 8px' },
      h('p', { style: 'margin: 0', text: `Desde este navegador ya se jugó en la sala ${offers[0].code}.` }),
      offers.map((offer) => h('button', {
        class: 'btn btn-primary btn-block',
        dataset: { key: `resume-${offer.playerId}` },
        text: `Seguir como «${offer.name}»`,
        onclick: () => resume(offer),
      })),
      h('p', { class: 'muted small', style: 'margin: 0', text: 'Si no eres ninguna de esas personas, entra abajo con tu propio nombre.' }),
    ) : null,
    h('p', { class: 'muted', text: 'Sin cuenta ni registro. Usa el nombre con el que te conocen en la mesa.' }),
    form,
  );

  function showJoinError(message, field) {
    ui.joining = false;
    ui.joinError = message;
    renderAll();
    $(`#${field.id}`)?.focus();
  }
}

function claimCard() {
  return h('section', { class: 'card card-highlight', 'aria-live': 'polite' },
    h('h1', { text: 'Esperando al narrador' }),
    h('p', { text: `La partida ya empezó y hay un asiento libre a nombre de «${ui.pendingClaim.name}». El narrador tiene que aprobar que lo recuperes desde este dispositivo.` }),
    h('button', {
      class: 'btn btn-ghost',
      text: 'Cancelar',
      onclick: () => {
        ui.pendingClaim = null;
        // Reconnecting drops the claim on the server.
        conn.socket.disconnect();
        conn.socket.connect();
        renderAll();
      },
    }),
  );
}

function statusStrip(s) {
  return h('section', { class: 'card status-strip', 'aria-label': 'Estado de la partida' },
    h('div', {},
      h('p', { class: 'phase-title', text: PHASE_LABELS[s.phase] }),
      h('p', { class: 'muted small', style: 'margin: 0' },
        `Sala ${s.code} · ${s.me.name}`,
        s.round > 0 ? ` · Ronda ${s.round}` : '',
      ),
    ),
    s.phase !== 'lobby' ? h('span', { class: 'pill', text: `${s.players.filter((p) => p.alive).length} vivos` }) : null,
  );
}

function compositionLine(s) {
  const roles = Object.entries(s.setup.counts).filter(([, n]) => n > 0).map(([role, n]) => `${ROLE_LABELS[role]}${n > 1 ? ` ×${n}` : ''}`);
  return `En juego: ${roles.join(', ')}.`;
}

function lobbyCard(s) {
  const count = s.players.length;
  return h('section', { class: 'card card-highlight' },
    h('h1', { text: 'Ya estás dentro' }),
    h('p', { text: `Espera a que el narrador inicie la partida. Hay ${count} ${count === 1 ? 'jugador' : 'jugadores'}${count < s.minPlayers ? `; se necesitan al menos ${s.minPlayers}` : ''}.` }),
    count >= s.minPlayers ? h('p', { class: 'muted small', text: compositionLine(s) }) : null,
    h('button', {
      class: 'btn btn-ghost',
      text: 'Salir de la sala',
      onclick: async () => {
        const answer = await send('room:leave');
        if (!answer.ok) return;
        forgetSession(s.code);
        ui.public = null;
        ui.me = null;
        renderAll();
      },
    }),
  );
}

function roleSection(s) {
  const card = roleCard(s);
  if (!card) return null;
  if (ui.reveal !== 'role') {
    return h('section', { class: 'card secret', 'aria-labelledby': 'role-heading' },
      h('h2', { id: 'role-heading', text: 'Tu rol' }),
      h('p', { class: 'muted', text: 'Está oculto para que nadie lo vea de reojo. Míralo cuando nadie esté mirando tu pantalla.' }),
      h('button', { class: 'btn btn-primary btn-big btn-block', dataset: { key: 'show-role' }, 'aria-controls': 'role-heading', text: 'Mostrar mi rol', onclick: () => reveal('role') }),
    );
  }
  return h('section', { class: `card secret is-revealed role-${teamOfRole(card.role)}`, 'aria-labelledby': 'role-heading', ...revealedCardEvents },
    h('p', { class: 'secret-warning', role: 'alert', text: 'Tu rol está visible. Cubre la pantalla y no lo enseñes.' }),
    h('h2', { id: 'role-heading', class: 'visually-hidden', text: 'Tu rol' }),
    h('p', { class: 'role-title', text: card.title }),
    h('p', { class: 'muted', text: `Equipo: ${card.team}` }),
    card.lines.map((line) => h('p', { text: line })),
    h('button', { class: 'btn btn-block', dataset: { key: 'hide-role' }, text: 'Ocultar', onclick: cover }),
    h('p', { class: 'muted small', style: 'margin-top: 8px', text: 'Se ocultará solo si no lo tocas en unos segundos.' }),
  );
}

function startCard() {
  return h('section', { class: 'card card-highlight' },
    h('h1', { text: 'Mira tu rol en privado' }),
    h('p', { text: 'Si eres lobo, verás quiénes son tus compañeros.' }),
    h('p', { class: 'muted', text: 'El narrador empezará la primera noche en cuanto todos lo hayan visto.' }),
  );
}

function dawnCard(s, nameOf) {
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'dawn-title' },
    h('h1', { id: 'dawn-title', text: 'Amanecer' }),
    h('p', { class: 'announcement', text: describeDawn(s.lastNight, nameOf) }),
    s.pendingShot && !s.me.mustShoot ? h('p', { class: 'notice notice-warn', text: `${nameOf(s.pendingShot.hunterId)} era el Cazador y va a disparar.` }) : null,
    s.me.alive ? null : h('p', { class: 'notice notice-warn', text: 'Estás fuera de la partida. No reveles tu rol.' }),
  );
}

function hunterCard(s) {
  const panel = hunterPanel(s);
  if (!panel) return null;
  const select = h('select', { id: 'hunter-target', dataset: { key: 'hunter-target' } },
    h('option', { value: '', text: 'Elige a quién disparar' }),
    panel.options.map((o) => h('option', { value: o.value, text: o.label })));
  return h('section', { class: 'card card-highlight', role: 'alert', 'aria-labelledby': 'hunter-title' },
    h('h1', { id: 'hunter-title', text: 'Tu último disparo' }),
    h('p', { text: panel.instruction }),
    h('label', { for: 'hunter-target', class: 'visually-hidden', text: 'Jugador al que disparas' }),
    select,
    h('button', {
      class: 'btn btn-danger btn-big btn-block',
      style: 'margin-top: 12px',
      dataset: { key: 'hunter-shoot' },
      text: 'Disparar',
      onclick: async () => {
        if (!select.value) return toast('Elige primero a quién disparar.', { kind: 'error' });
        const name = panel.options.find((o) => o.value === select.value)?.label;
        if (!(await confirmDialog({ title: `¿Disparar a ${name}?`, message: 'No se puede deshacer.', confirmLabel: 'Disparar', danger: true }))) return;
        send('hunter:shoot', { targetId: select.value });
      },
    }),
  );
}

function dayCard(s, nameOf) {
  const vote = voteView(s);
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'day-title' },
    h('h1', { id: 'day-title', text: 'Día' }),
    s.lastNight && s.lastNight.round === s.round ? h('p', { class: 'muted', text: describeDawn(s.lastNight, nameOf) }) : null,
    timerLine(s),
    s.me.alive
      ? h('p', { class: 'muted', text: 'Discutan en voz alta. Acusa a quien sospeches; el narrador abrirá la votación entre los acusados.' })
      : h('p', { class: 'notice notice-warn', text: 'Estás fuera de la partida. No reveles tu rol: ya no puedes ayudar a nadie.' }),
    vote ? voteBlock(vote) : null,
    !vote && s.voteHeld ? h('p', { class: 'notice notice-info', text: 'La votación de hoy ya terminó. Pronto caerá la noche.' }) : null,
    s.me.alive && !vote && !s.voteHeld ? accuseBlock(s, nameOf) : null,
  );
}

function voteBlock(vote) {
  if (!vote.open) {
    return h('div', { class: 'section-gap', role: 'region', 'aria-labelledby': 'vote-title' },
      h('h2', { id: 'vote-title', text: 'Resultado de la votación' }),
      h('p', { class: 'announcement', text: vote.result.text }),
      vote.result.voters
        ? h('ul', { class: 'list' }, vote.result.voters.map((row) => h('li', { class: 'list-item small' },
          h('span', { class: 'name', text: row.name }),
          h('span', { text: row.voters.length ? `votos de: ${row.voters.join(', ')}` : 'sin votos' }),
        )))
        : null,
    );
  }
  const mine = vote.myBallot;
  const selected = ui.voteTarget !== undefined ? ui.voteTarget : mine?.targetId;
  return h('div', { class: 'section-gap', role: 'region', 'aria-labelledby': 'vote-title' },
    h('h2', { id: 'vote-title', text: 'Votación: ¿quién sale de la aldea?' }),
    vote.candidates.some((c) => c.isMe) ? h('p', { class: 'notice notice-warn', text: 'Te acusaron. Defiéndete en voz alta: no puedes votar contra ti.' }) : null,
    vote.canVote ? h('fieldset', { class: 'options' },
      h('legend', { text: 'Marca a un acusado o abstente' }),
      [...vote.candidates.filter((c) => !c.isMe).map((c) => ({ value: c.id, label: c.name })), { value: null, label: 'Me abstengo' }]
        .map((option) => h('label', { class: 'option' },
          h('input', {
            type: 'radio',
            name: 'vote-choice',
            value: option.value ?? '',
            checked: selected !== undefined && selected === option.value,
            onchange: () => { ui.voteTarget = option.value; },
          }),
          h('span', { text: option.label }),
        )),
    ) : null,
    vote.canVote ? h('button', {
      class: 'btn btn-primary btn-big btn-block',
      dataset: { key: 'vote-send' },
      'aria-label': 'Confirmar mi voto',
      text: mine ? 'Cambiar mi voto' : 'Confirmar mi voto',
      onclick: async () => {
        if (ui.voteTarget === undefined) return toast('Elige una opción.', { kind: 'error' });
        const answer = await send('day:vote', { targetId: ui.voteTarget });
        if (answer.ok) {
          ui.voteTarget = undefined;
          toast('Voto registrado.', { kind: 'ok' });
        }
      },
    }) : null,
    mine ? h('p', { class: 'small', text: mine.targetId === null ? 'Tu voto: te abstienes.' : `Tu voto: contra ${vote.candidates.find((c) => c.id === mine.targetId)?.name ?? '¿?'}.` }) : null,
    h('p', { class: 'small', style: 'margin-top: 8px', text: vote.progress }),
  );
}

function accuseBlock(s, nameOf) {
  const options = accuseOptions(s);
  const mine = s.accusations.find((a) => a.accuserId === s.me.id);
  const others = s.accusations.filter((a) => a.accuserId !== s.me.id);
  if (!options.some((p) => p.id === ui.accuseTarget)) ui.accuseTarget = '';
  const select = h('select', {
    id: 'accuse-target',
    dataset: { key: 'accuse-target' },
    onchange: (event) => { ui.accuseTarget = event.target.value; },
  },
  h('option', { value: '', text: 'Elige a quién acusar' }),
  options.map((p) => h('option', { value: p.id, text: p.name, selected: p.id === ui.accuseTarget })));
  return h('div', { class: 'section-gap' },
    h('h2', { text: 'Acusar' }),
    mine ? h('p', { class: 'notice notice-info', text: `Acusaste a ${nameOf(mine.targetId)}. Esperando a que el narrador abra la votación.` }) : null,
    h('label', { for: 'accuse-target', class: 'visually-hidden', text: 'Jugador al que acusas' }),
    h('div', { class: 'row' },
      h('span', { style: 'flex: 1 1 180px' }, select),
      h('button', {
        class: 'btn btn-primary',
        text: mine ? 'Cambiar acusación' : 'Acusar y pedir votación',
        onclick: async () => {
          if (!select.value) return toast('Elige primero a quién acusar.', { kind: 'error' });
          const answer = await send('day:accuse', { targetId: select.value });
          if (answer.ok) {
            ui.accuseTarget = '';
            toast('Acusación enviada al narrador.', { kind: 'ok' });
          }
        },
      }),
    ),
    others.length ? h('ul', { class: 'list', style: 'margin-top: 12px' }, others.map((a) => h('li', { class: 'list-item small' },
      h('span', {}, h('span', { class: 'name', text: nameOf(a.accuserId) }), ' acusa a ', h('span', { class: 'name', text: nameOf(a.targetId) })),
    ))) : null,
  );
}

function nightCard(s, nameOf) {
  const panel = nightPanel(s);
  const header = h('h1', { id: 'night-title', text: 'Noche' });
  if (panel.kind === 'dead') {
    return h('section', { class: 'card card-night night', 'aria-labelledby': 'night-title' }, header, h('p', { text: panel.instruction }));
  }

  // Everyone alive sees the same covered card, so nobody can tell who has a turn.
  if (ui.reveal !== 'night') {
    return h('section', { class: 'card card-night night', 'aria-labelledby': 'night-title' },
      header,
      h('div', { class: 'secret' },
        h('p', { class: 'muted small', text: 'Ábrelo cuando nadie mire tu pantalla: ahí verás si te toca actuar.' }),
        h('button', { class: 'btn btn-primary btn-big btn-block', dataset: { key: 'open-night' }, text: 'Abrir mi panel de la noche', onclick: () => reveal('night') }),
      ),
    );
  }

  return h('section', { class: 'card card-night night', 'aria-labelledby': 'night-title' },
    header,
    h('div', { class: 'secret is-revealed', ...revealedCardEvents },
      h('p', { class: 'secret-warning', role: 'alert', text: 'Tu panel está visible. Cubre la pantalla.' }),
      panel.title ? h('h2', { text: panel.title }) : null,
      h('p', { text: panel.instruction }),
      nightBody(s, panel, nameOf),
      h('button', { class: 'btn btn-block', style: 'margin-top: 8px', dataset: { key: 'hide-night' }, text: 'Ocultar', onclick: cover }),
    ),
  );
}

function latestSeerResult(s) {
  return (s.me.seerResults ?? []).find((r) => r.round === s.round) ?? null;
}

function nightBody(s, panel, nameOf) {
  if (panel.kind === 'wait') {
    const seen = s.me.role === 'seer' ? latestSeerResult(s) : null;
    return seen
      ? h('p', { class: 'notice notice-info', text: `${nameOf(seen.targetId)} ${seen.isWolf ? 'ES lobo' : 'no es lobo'}.` })
      : null;
  }
  if (panel.kind === 'alpha') {
    return h('div', { class: 'row' },
      h('button', { class: 'btn btn-danger btn-big', dataset: { key: 'alpha-convert' }, 'aria-label': `Convertir a ${panel.targetName} en lobo`, text: 'Convertir en lobo', onclick: () => send('night:act', { convert: true }) }),
      h('button', { class: 'btn btn-big', dataset: { key: 'alpha-kill' }, 'aria-label': `Dejar que ${panel.targetName} muera`, text: 'Que muera', onclick: () => send('night:act', { convert: false }) }),
    );
  }
  if (panel.kind === 'witch') return witchForm(panel);
  return choiceForm(panel);
}

function choiceForm(panel) {
  const selected = ui.nightChoice !== undefined ? ui.nightChoice : panel.current ?? undefined;
  const form = h('form', {
    onchange: (event) => {
      if (event.target.name === 'night-choice') ui.nightChoice = event.target.value;
    },
    onsubmit: async (event) => {
      event.preventDefault();
      const picked = form.querySelector('input[name="night-choice"]:checked');
      if (!picked) return toast('Elige a alguien.', { kind: 'error' });
      const answer = await send('night:act', { targetId: picked.value });
      if (!answer.ok) return;
      ui.nightChoice = undefined;
      keepRevealed();
      if (panel.kind === 'protector') toast('Protección registrada.', { kind: 'ok' });
      if (panel.kind === 'wolves') toast('Elección enviada a la manada.', { kind: 'ok' });
    },
  },
  panel.kind === 'wolves' && panel.partnerPicks.length
    ? h('ul', { class: 'small' }, panel.partnerPicks.map((p) => h('li', { text: `${p.name}: ${p.target ? `elige a ${p.target}` : 'todavía no elige'}` })))
    : null,
  panel.disagree ? h('p', { class: 'notice notice-warn', text: 'La manada no coincide. Pónganse de acuerdo: pueden cambiar su elección.' }) : null,
  h('fieldset', { class: 'options' },
    h('legend', { text: panel.action }),
    panel.options.map((option) => h('label', { class: 'option' },
      h('input', {
        type: 'radio',
        name: 'night-choice',
        value: option.value,
        checked: selected === option.value,
        disabled: option.disabled,
      }),
      h('span', { text: option.label }),
      option.note ? h('span', { class: 'note', text: option.note }) : null,
    )),
  ),
  h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block', dataset: { key: 'night-send' }, text: panel.kind === 'wolves' && panel.current ? 'Cambiar elección' : panel.action }),
  );
  return form;
}

function witchForm(panel) {
  const heal = panel.canHeal ? h('input', { type: 'checkbox', id: 'witch-heal', dataset: { key: 'witch-heal' } }) : null;
  const poison = panel.canPoison
    ? h('select', { id: 'witch-poison', dataset: { key: 'witch-poison' } },
      h('option', { value: '', text: 'No usar la poción de muerte' }),
      panel.poisonOptions.map((o) => h('option', { value: o.value, text: o.label })))
    : null;
  return h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      const answer = await send('night:act', { heal: Boolean(heal?.checked), poisonTargetId: poison?.value || null });
      if (answer.ok) {
        toast('Listo.', { kind: 'ok' });
        cover();
      }
    },
  },
  heal ? h('label', { class: 'switch' }, heal, `Usar la poción de vida para salvar a ${panel.victimName}`) : h('p', { class: 'muted small', text: 'No puedes usar la poción de vida esta noche.' }),
  poison ? h('div', { class: 'field' }, h('label', { for: 'witch-poison', text: 'Poción de muerte' }), poison) : h('p', { class: 'muted small', text: 'Ya usaste la poción de muerte.' }),
  h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block', dataset: { key: 'witch-send' }, text: 'Terminar mi turno' }),
  );
}

function timerLine(s) {
  if (!s.timer) return null;
  return h('p', {}, 'Tiempo de discusión: ', h('span', { id: 'timer', class: 'timer', text: '' }));
}

function tickTimer() {
  const el = $('#timer');
  const timer = ui.public?.timer;
  if (!el || !timer) return;
  const left = timer.endsAt - (Date.now() + ui.clockOffset);
  el.textContent = left > 0 ? formatCountdown(left) : 'Tiempo';
  el.classList.toggle('is-over', left <= 0);
}

function endedCard(s) {
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'end-title' },
    h('h1', { id: 'end-title', class: 'result-big', text: WINNER_LABELS[s.winner] }),
    h('p', { class: 'announcement', text: endMessage(s) }),
    h('p', { class: 'muted', text: `Tu rol era: ${ROLE_LABELS[s.me.role]}${s.me.originalRole ? ` (antes ${ROLE_LABELS[s.me.originalRole]})` : ''}. Ahora todos los roles son visibles.` }),
    h('p', { class: 'muted small', style: 'margin-top: 12px', text: 'Si el narrador empieza otra partida con los mismos jugadores, volverás a la sala de espera.' }),
  );
}

function playersCard(s) {
  const ended = s.phase === 'ended';
  const alive = s.players.filter((p) => p.alive).length;
  return h('section', { class: 'card', 'aria-labelledby': 'players-title' },
    h('h2', { id: 'players-title', text: s.phase === 'lobby' ? 'Jugadores en la sala' : `Jugadores (${alive} en juego)` }),
    h('ul', { class: 'list' }, s.players.map((p) => h('li', { class: `list-item ${p.alive ? '' : 'is-out'}` },
      h('span', { class: 'row' },
        h('span', { class: `dot ${p.connected ? 'dot-ok' : 'dot-off'}`, role: 'img', 'aria-label': p.connected ? 'Conectado' : 'Desconectado' }),
        h('span', { class: 'name', text: p.id === s.me.id ? `${p.name} (tú)` : p.name }),
        p.role ? h('span', { class: `badge ${teamOfRole(p.role) === 'wolves' ? 'badge-wolf' : p.role === 'villager' ? 'badge-village' : 'badge-special'}`, text: ROLE_LABELS[p.role] }) : null,
      ),
      s.phase === 'lobby' ? null : h('span', { class: 'muted small', text: describeStatus(p) }),
    ))),
  );
}

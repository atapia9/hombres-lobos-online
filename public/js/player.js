// Player screen: join with the room code, see your role in private, follow the
// public state and act in each phase. Secrets live only behind covered cards (ADR-010).

import { connect, currentServer, resetServer } from './net.js';
import { $, announce, h, render, toast, whenIdle } from './dom.js';
import { CLASSIC_NOTE, MODE_LABELS, PHASE_LABELS, ROLE_LABELS, WINNER_LABELS, errorMessage } from './texts.js';
import { describeLastNight, describeStatus, formatCountdown, namer } from './format.js';
import { accuseOptions, endMessage, nightChoices, parseRoomCode, roleCard, voteView } from './player-logic.js';
import { mountRules } from './rules-ui.js';
import { load, loadTab, removeTab, save, saveTab } from './storage.js';

const SESSIONS_KEY = 'mafia:player:sessions'; // localStorage: { [code:playerId]: session }, survives closing the tab
const TAB_KEY = 'mafia:player:tab'; // sessionStorage: this tab's session, so several tabs can play
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
    ['dawn', 'day', 'night'].includes(s.phase) ? roleSection(s) : null,
    s.phase === 'dawn' ? dawnCard() : null,
    s.phase === 'day' ? dayCard(s, nameOf) : null,
    s.phase === 'night' ? nightCard(s) : null,
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
    h('span', { class: s.mode === 'classic' ? 'badge badge-variant' : 'badge', text: MODE_LABELS[s.mode] }),
  );
}

function lobbyCard(s) {
  const count = s.players.length;
  return h('section', { class: 'card card-highlight' },
    h('h1', { text: 'Ya estás dentro' }),
    h('p', { text: `Espera a que el narrador inicie la partida. Hay ${count} ${count === 1 ? 'jugador' : 'jugadores'}${count < s.minPlayers ? `; se necesitan al menos ${s.minPlayers}` : ''}.` }),
    s.mode === 'classic' ? h('p', { class: 'muted small', text: `Modo clásico con roles. ${CLASSIC_NOTE}` }) : null,
    count >= s.minPlayers
      ? h('p', { class: 'muted small', text: `Si empieza ahora, habrá ${s.mafiaCount} ${s.mafiaCount === 1 ? 'mafioso' : 'mafiosos'} entre ${count} jugadores.` })
      : null,
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
  return h('section', { class: `card secret is-revealed role-${card.role}`, 'aria-labelledby': 'role-heading', ...revealedCardEvents },
    h('p', { class: 'secret-warning', role: 'alert', text: 'Tu rol está visible. Cubre la pantalla y no lo enseñes.' }),
    h('h2', { id: 'role-heading', class: 'visually-hidden', text: 'Tu rol' }),
    h('p', { class: 'role-title', text: card.title }),
    h('p', { class: 'muted', text: `Equipo: ${card.team}` }),
    card.lines.map((line) => h('p', { text: line })),
    h('button', { class: 'btn btn-block', dataset: { key: 'hide-role' }, text: 'Ocultar', onclick: cover }),
    h('p', { class: 'muted small', style: 'margin-top: 8px', text: 'Se ocultará solo si no lo tocas en unos segundos.' }),
  );
}

function dawnCard() {
  return h('section', { class: 'card card-highlight' },
    h('h1', { text: 'Mira tu rol en privado' }),
    h('p', { text: 'Si eres de la Mafia, verás quiénes son tus compañeros.' }),
    h('p', { class: 'muted', text: 'El narrador empezará el día en cuanto todos lo hayan visto.' }),
  );
}

function dayCard(s, nameOf) {
  const lastNight = s.lastNight && s.lastNight.round === s.round - 1 ? describeLastNight(s.lastNight, nameOf, s.mode) : null;
  const vote = voteView(s);
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'day-title' },
    h('h1', { id: 'day-title', text: 'Día' }),
    lastNight ? h('p', { class: 'announcement', text: lastNight }) : null,
    timerLine(s),
    s.me.alive
      ? h('p', { class: 'muted', text: 'Discutan en voz alta. Cualquiera puede acusar y pedir votación.' })
      : h('p', { class: 'notice notice-warn', text: 'Estás fuera de la partida. No reveles tu rol: ya no puedes ayudar a nadie.' }),
    vote ? voteBlock(vote) : null,
    s.me.alive ? accuseBlock(s, nameOf) : null,
    s.me.alive && s.nightRequests ? nightRequestBlock(s, nameOf) : null,
  );
}

function voteBlock(vote) {
  if (!vote.open) {
    return h('div', { class: 'section-gap', role: 'region', 'aria-labelledby': 'vote-title' },
      h('h2', { id: 'vote-title', text: `Resultado: ${vote.accused}` }),
      h('p', { class: 'announcement', text: vote.result.text }),
      h('p', { class: 'small' }, 'Votaron «culpable»: ', vote.result.guiltyVoters.length ? vote.result.guiltyVoters.join(', ') : 'nadie', '.'),
    );
  }
  return h('div', { class: 'section-gap', role: 'region', 'aria-labelledby': 'vote-title' },
    h('h2', { id: 'vote-title', text: `Votación: ¿${vote.accused} es culpable?` }),
    h('p', { class: 'muted small', text: `Acusa: ${vote.accuser}.` }),
    vote.isAccused ? h('p', { class: 'notice notice-warn', text: 'Te acusaron. Defiéndete en voz alta: tú no votas.' }) : null,
    vote.canVote ? h('div', { class: 'vote-buttons' },
      h('button', {
        class: 'btn btn-big btn-guilty',
        dataset: { key: 'vote-guilty' },
        'aria-pressed': String(vote.myVote === true),
        'aria-label': `Votar culpable contra ${vote.accused}`,
        text: 'Culpable',
        onclick: () => send('day:vote', { guilty: true }),
      }),
      h('button', {
        class: 'btn btn-big btn-innocent',
        dataset: { key: 'vote-innocent' },
        'aria-pressed': String(vote.myVote === false),
        'aria-label': `Votar no culpable a favor de ${vote.accused}`,
        text: 'No culpable',
        onclick: () => send('day:vote', { guilty: false }),
      }),
    ) : null,
    vote.canVote && vote.myVote !== null
      ? h('button', { class: 'btn btn-ghost btn-small', text: 'Retirar mi voto', onclick: () => send('day:vote', { guilty: null }) })
      : null,
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

function nightRequestBlock(s, nameOf) {
  const { count, needed, playerIds } = s.nightRequests;
  const requested = s.me.nightRequested;
  return h('div', { class: 'section-gap' },
    h('h2', { text: 'La noche' }),
    h('p', { class: 'small', text: `Piden la noche: ${count} de ${needed} necesarios${playerIds.length ? ` (${playerIds.map(nameOf).join(', ')})` : ''}.` }),
    h('button', {
      class: requested ? 'btn' : 'btn btn-primary',
      dataset: { key: 'night-request' },
      'aria-pressed': String(requested),
      text: requested ? 'Ya no pido la noche' : 'Pedir la noche',
      onclick: () => send('night:request', { wanted: !requested }),
    }),
  );
}

function nightCard(s) {
  const choices = nightChoices(s);
  const header = h('h1', { id: 'night-title', text: 'Noche' });
  if (choices.kind === 'none') {
    return h('section', { class: 'card card-night night', 'aria-labelledby': 'night-title' },
      header,
      h('p', { text: choices.instruction }),
      nightProgressLine(s),
    );
  }

  const status = choices.submitted ? 'Papeleta entregada ✓' : 'Papeleta pendiente';
  if (ui.reveal !== 'night') {
    return h('section', { class: 'card card-night night', 'aria-labelledby': 'night-title' },
      header,
      h('div', { class: 'secret' },
        h('p', { class: 'secret-status', text: status }),
        h('p', { class: 'muted small', text: 'Todos entregan una papeleta en secreto. Ábrela cuando nadie mire tu pantalla.' }),
        h('button', { class: 'btn btn-primary btn-big btn-block', dataset: { key: 'open-ballot' }, text: 'Abrir mi papeleta', onclick: () => reveal('night') }),
      ),
      nightProgressLine(s),
    );
  }

  const seerResult = choices.kind === 'seer' ? (s.me.seerResults ?? []).find((r) => r.round === s.round) : null;
  const nameOf = namer(s.players);
  const selected = ui.nightChoice !== undefined ? ui.nightChoice : choices.current;
  const form = h('form', {
    onchange: (event) => {
      if (event.target.name === 'night-choice') ui.nightChoice = event.target.value === '' ? null : event.target.value;
    },
    onsubmit: async (event) => {
      event.preventDefault();
      const picked = form.querySelector('input[name="night-choice"]:checked');
      if (!picked) return toast('Elige una opción.', { kind: 'error' });
      const value = picked.value === '' ? null : picked.value;
      const answer = choices.kind === 'ballot'
        ? await send('night:submit', { targetId: value })
        : await send('night:ability', { targetId: value });
      if (!answer.ok) return;
      if (choices.kind === 'seer') {
        keepRevealed(); // keep the result on screen for a moment
      } else {
        toast('Papeleta entregada.', { kind: 'ok' });
        cover();
      }
    },
  },
  h('fieldset', { class: 'options', disabled: choices.locked },
    h('legend', { text: 'Tu papeleta' }),
    choices.options.map((option) => h('label', { class: 'option' },
      h('input', {
        type: 'radio',
        name: 'night-choice',
        value: option.value ?? '',
        checked: selected !== undefined && selected === option.value,
        disabled: option.disabled,
      }),
      h('span', { text: option.label }),
      option.note ? h('span', { class: 'note', text: option.note }) : null,
    )),
  ),
  choices.locked ? null : h('button', { type: 'submit', class: 'btn btn-primary btn-big btn-block', text: choices.submitted && choices.kind !== 'seer' ? 'Cambiar papeleta' : choices.action }),
  );

  return h('section', { class: 'card card-night night', 'aria-labelledby': 'night-title' },
    header,
    h('div', { class: 'secret is-revealed', ...revealedCardEvents },
      h('p', { class: 'secret-warning', role: 'alert', text: 'Tu papeleta está visible. Cubre la pantalla.' }),
      h('p', { text: choices.instruction }),
      choices.partnerPicks?.length
        ? h('ul', { class: 'small' }, choices.partnerPicks.map((p) => h('li', { text: `${p.name}: ${p.target ? `elige a ${p.target}` : 'todavía no elige'}` })))
        : null,
      seerResult ? h('p', { class: 'notice notice-info', text: `${nameOf(seerResult.targetId)} es ${seerResult.team === 'mafia' ? 'de la Mafia' : 'Honesto'}.` }) : null,
      form,
      h('button', { class: 'btn btn-block', style: 'margin-top: 8px', dataset: { key: 'hide-ballot' }, text: 'Ocultar', onclick: cover }),
    ),
    nightProgressLine(s),
  );
}

function nightProgressLine(s) {
  return s.night ? h('p', { class: 'muted small', style: 'margin-top: 12px', text: `Papeletas entregadas: ${s.night.submitted} de ${s.night.expected}.` }) : null;
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
  const scores = s.scores;
  return h('section', { class: 'card card-highlight', 'aria-labelledby': 'end-title' },
    h('h1', { id: 'end-title', class: 'result-big', text: WINNER_LABELS[s.winner] }),
    h('p', { class: 'announcement', text: endMessage(s) }),
    h('p', { class: 'muted', text: `Tu rol era: ${ROLE_LABELS[s.me.role]}. Ahora todos los roles son visibles.` }),
    scores ? h('table', { class: 'score-table' },
      h('caption', { class: 'visually-hidden', text: 'Puntuación' }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Jugador' }), h('th', { scope: 'col', text: s.gameNumber > 1 ? 'Puntos (total)' : 'Puntos' }))),
      h('tbody', {}, [...s.players]
        .sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0))
        .map((p) => h('tr', {},
          h('td', { text: p.id === s.me.id ? `${p.name} (tú)` : p.name }),
          h('td', { text: s.gameNumber > 1 ? `${scores[p.id] ?? 0} (${s.scoreboard?.[p.id] ?? 0})` : String(scores[p.id] ?? 0) }),
        ))),
    ) : null,
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
        ended && p.role ? h('span', { class: `badge ${p.role === 'mafia' ? 'badge-mafia' : p.role === 'honest' ? 'badge-honest' : 'badge-special'}`, text: ROLE_LABELS[p.role] }) : null,
      ),
      s.phase === 'lobby' ? null : h('span', { class: 'muted small', text: describeStatus(p) }),
    ))),
  );
}

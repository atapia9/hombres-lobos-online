// Development only: simulated players that join a room and act on their own (R13).
//
//   npm run bots -- <ROOM_CODE> [count=3] [--server=http://localhost:3000]
//
// Bots vote at random, ask for the night when a human already has, and always
// hand in their night ballot (a random victim if they are mafia), so a game can
// be tested with only a few real tabs.

import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [code, countArg = '3'] = args.filter((a) => !a.startsWith('--'));
const server = flags.server ?? 'http://localhost:3000';
const count = Number(countArg);

if (!code || !Number.isInteger(count) || count < 1 || count > 19) {
  console.error('Uso: npm run bots -- <CÓDIGO> [cantidad 1-19] [--server=http://localhost:3000]');
  process.exit(1);
}

const pick = (items) => items[Math.floor(Math.random() * items.length)];
const later = (fn) => setTimeout(fn, 400 + Math.random() * 1200);

function startBot(index) {
  const socket = io(server, { transports: ['websocket'] });
  const bot = { name: `Bot ${index}`, playerId: null, token: null, public: null, me: null, busy: false };
  const log = (message) => console.log(`[${bot.name}] ${message}`);
  const send = (event, payload) => socket.timeout(3000).emitWithAck(event, payload).catch(() => ({ ok: false }));

  socket.on('connect', async () => {
    if (bot.token) {
      const answer = await send('room:rejoin', { code, playerToken: bot.token });
      if (answer.ok) return update(answer.state);
    }
    let answer = await send('room:join', { code, name: bot.name });
    if (!answer.ok && answer.error === 'NAME_TAKEN') {
      bot.name = `${bot.name} ${Math.floor(Math.random() * 90 + 10)}`;
      answer = await send('room:join', { code, name: bot.name });
    }
    if (!answer.ok) {
      log(`no pudo unirse: ${answer.error}`);
      socket.disconnect();
      return;
    }
    Object.assign(bot, { playerId: answer.playerId, token: answer.playerToken });
    log('se unió a la sala');
    update(answer.state);
  });

  socket.on('state:public', (state) => update(state));
  socket.on('state:private', ({ me }) => update({ ...bot.public, me }));
  socket.on('room:kicked', () => {
    log('expulsado por el narrador');
    socket.disconnect();
  });

  function update(state) {
    if (!state) return;
    const { me, ...rest } = state;
    if (Object.keys(rest).length > 0) bot.public = rest;
    if (me) {
      if (me.role && me.role !== bot.me?.role) log(`rol: ${me.role}`);
      bot.me = me;
    }
    if (!bot.busy) later(act);
  }

  async function act() {
    const state = bot.public;
    const me = bot.me;
    if (!state || !me || !me.alive || bot.busy) return;
    bot.busy = true;
    try {
      const alive = state.players.filter((p) => p.alive);
      const others = alive.filter((p) => p.id !== me.id);

      if (state.phase === 'day') {
        const vote = state.vote;
        if (vote?.status === 'open' && vote.accusedId !== me.id && me.vote === null) {
          const guilty = Math.random() < 0.6;
          if ((await send('day:vote', { guilty })).ok) log(guilty ? 'votó culpable' : 'votó no culpable');
        }
        const requests = state.nightRequests;
        if (requests && !me.nightRequested && requests.count > 0) {
          if ((await send('night:request', { wanted: true })).ok) log('pidió la noche');
        }
      }

      if (state.phase === 'night') {
        if ((me.role === 'seer' || me.role === 'doctor') && !me.abilityTargetId) {
          const choices = me.role === 'seer'
            ? others
            : alive.filter((p) => p.id !== me.doctorLastTargetId);
          const target = pick(choices);
          if (target && (await send('night:ability', { targetId: target.id })).ok) log(`usó su habilidad con ${target.name}`);
        } else if (me.role === 'mafia' && !me.ballotSubmitted) {
          const target = pick(others.filter((p) => !me.partnerIds.includes(p.id)));
          if (target && (await send('night:submit', { targetId: target.id })).ok) log(`eligió a ${target.name}`);
        } else if ((me.role === 'honest') && !me.ballotSubmitted) {
          if ((await send('night:submit', { targetId: null })).ok) log('entregó «Honesto»');
        }
      }
    } finally {
      bot.busy = false;
    }
  }

  return socket;
}

const sockets = Array.from({ length: count }, (_, i) => startBot(i + 1));
console.log(`${count} bots conectándose a ${server}, sala ${code}. Ctrl+C para salir.`);

process.once('SIGINT', () => {
  for (const socket of sockets) socket.disconnect();
  process.exit(0);
});

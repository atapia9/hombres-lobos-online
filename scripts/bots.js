// Development only: simulated players that join a room and act on their own.
//
//   npm run bots -- <ROOM_CODE> [count=3] [--server=http://localhost:3000] [--auto]
//
// Bots use their night ability when it is their turn (wolves follow the first
// pick of the pack), shoot if they are a dead hunter, and vote at random when a
// vote is open, so a game can be tested with only a few real tabs.
// With --auto they also accuse at random, so the narrator can run whole days
// without human players.

import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [code, countArg = '3'] = args.filter((a) => !a.startsWith('--'));
const server = flags.server ?? 'http://localhost:3000';
const count = Number(countArg);
const auto = 'auto' in flags;

if (!code || !Number.isInteger(count) || count < 1 || count > 18) {
  console.error('Uso: npm run bots -- <CÓDIGO> [cantidad 1-18] [--server=http://localhost:3000] [--auto]');
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
    if (!state || !me || bot.busy) return;
    bot.busy = true;
    try {
      const alive = state.players.filter((p) => p.alive);
      const others = alive.filter((p) => p.id !== me.id);
      const pack = new Set(me.partnerIds ?? []);

      if (me.mustShoot) {
        const target = pick(others);
        if (target && (await send('hunter:shoot', { targetId: target.id })).ok) log(`disparó a ${target.name}`);
        return;
      }
      if (!me.alive) return;

      if (state.phase === 'day') {
        const vote = state.vote;
        if (vote?.status === 'open' && !me.ballot) {
          const choices = vote.candidateIds.filter((id) => id !== me.id && !pack.has(id));
          const targetId = Math.random() < 0.85 && choices.length ? pick(choices) : null;
          if ((await send('day:vote', { targetId })).ok) log(targetId ? `vota contra ${state.players.find((p) => p.id === targetId)?.name}` : 'se abstiene');
        }
        if (auto && !vote && !state.voteHeld && !me.accusedId && Math.random() < 0.25) {
          const target = pick(others.filter((p) => !pack.has(p.id)));
          if (target && (await send('day:accuse', { targetId: target.id })).ok) log(`acusa a ${target.name}`);
        }
      }

      const night = me.night;
      if (state.phase === 'night' && night?.turn) {
        let payload = null;
        if (night.step === 'seer') payload = { targetId: pick(others)?.id };
        if (night.step === 'protector') payload = { targetId: pick(alive.filter((p) => p.id !== me.protectorLastTargetId))?.id };
        if (night.step === 'wolves' && !night.wolfPicks?.[me.id]) {
          const chosen = Object.values(night.wolfPicks ?? {}).find(Boolean);
          payload = { targetId: chosen ?? pick(others.filter((p) => !pack.has(p.id)))?.id };
        }
        if (night.step === 'alpha') payload = { convert: Math.random() < 0.3 };
        if (night.step === 'witch') {
          payload = { heal: Boolean(me.potions?.heal && night.victimId && Math.random() < 0.5), poisonTargetId: null };
        }
        if (payload && (await send('night:act', payload)).ok) log(`actúa de noche (${night.step})`);
      }
    } finally {
      bot.busy = false;
    }
  }

  if (auto) setInterval(() => later(act), 3000);
  return socket;
}

const sockets = Array.from({ length: count }, (_, i) => startBot(i + 1));
console.log(`${count} bots conectándose a ${server}, sala ${code}. Ctrl+C para salir.`);

process.once('SIGINT', () => {
  for (const socket of sockets) socket.disconnect();
  process.exit(0);
});

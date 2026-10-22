import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_CODE_PATTERN } from '../../server/security.js';
import { leakedPaths } from '../leaks.js';
import { ok, roomWithPlayers, startGame, startServer, voteOut } from './helpers.js';

describe('a full room over Socket.IO', () => {
  let t;
  before(async () => {
    t = await startServer();
  });
  after(() => t.close());

  it('plays a whole game with special roles, from lobby to summary, without leaking secrets', async () => {
    // 8 players: 2 wolves, seer, protector, hunter, witch, 2 villagers.
    const room = await roomWithPlayers(t, 8, { roles: { hunter: true, witch: true } });
    assert.match(room.code, ROOM_CODE_PATTERN);

    // Lobby: the narrator sees everyone and the resulting composition.
    const lobby = await room.narrator.sync();
    assert.equal(lobby.players.length, 8);
    assert.equal(lobby.derived.composition.wolfTotal, 2);
    assert.equal(lobby.derived.setupError, null);
    assert.ok(Object.values(lobby.connections).every(Boolean));

    // Start: roles reach their owners only; wolves recognise each other.
    const { wolves, village, one } = await startGame(room);
    assert.equal(wolves.length, 2);
    const [w1, w2] = wolves;
    const seer = one('seer');
    const protector = one('protector');
    const hunter = one('hunter');
    const witch = one('witch');
    const villagers = village.filter((c) => ![seer, protector, hunter, witch].includes(c));
    assert.deepEqual(w1.latest('state:private').me.partnerIds, [w2.playerId]);
    for (const c of village) assert.equal(c.latest('state:private').me.partnerIds, undefined);
    const narratorStart = await room.narrator.sync();
    assert.equal(narratorStart.players.filter((p) => p.role === 'wolf').length, 2, 'the narrator sees every role');

    // Night 1: seer → protector → wolves (on the protected player) → witch does nothing.
    await ok(room.narrator, 'phase:advance', { to: 'night' });
    assert.equal((await seer.sync()).me.night.turn, true);
    assert.equal((await w1.sync()).me.night.turn, false, 'wolves wait for the seer and the protector');
    await ok(seer, 'night:act', { targetId: w1.playerId });
    await ok(protector, 'night:act', { targetId: villagers[0].playerId });
    await ok(w1, 'night:act', { targetId: villagers[0].playerId });
    await ok(w2, 'night:act', { targetId: villagers[0].playerId });
    const witchView = await witch.sync();
    assert.equal(witchView.me.night.victimId, null, 'the protected victim is not shown to the witch');
    await ok(witch, 'night:act', { heal: false, poisonTargetId: null });
    assert.equal((await room.narrator.sync()).night.step, 'done');
    await ok(room.narrator, 'phase:advance', { to: 'dawn' });
    const dawn1 = await villagers[1].sync();
    assert.deepEqual(dawn1.lastNight, { round: 1, deathIds: [] });
    assert.deepEqual((await seer.sync()).me.seerResults, [{ round: 1, targetId: w1.playerId, isWolf: true }]);

    // Day 1: the village votes out the first wolf.
    await ok(room.narrator, 'phase:advance', { to: 'day' });
    await voteOut(room, seer, w1, room.players);
    const afterVote = await villagers[1].sync();
    assert.equal(afterVote.players.find((p) => p.id === w1.playerId).alive, false);
    assert.equal(afterVote.players.find((p) => p.id === w1.playerId).role, undefined, 'dead roles stay hidden');

    // Night 2: the last wolf kills the hunter; the witch does not save them.
    await ok(room.narrator, 'phase:advance', { to: 'night' });
    await ok(seer, 'night:act', { targetId: w2.playerId });
    await ok(protector, 'night:act', { targetId: seer.playerId });
    await ok(w2, 'night:act', { targetId: hunter.playerId });
    assert.equal((await witch.sync()).me.night.victimId, hunter.playerId);
    await ok(witch, 'night:act', { heal: false, poisonTargetId: null });
    await ok(room.narrator, 'phase:advance', { to: 'dawn' });
    const dawn2 = await villagers[1].sync();
    assert.deepEqual(dawn2.lastNight.deathIds, [hunter.playerId]);
    assert.deepEqual(dawn2.pendingShot, { hunterId: hunter.playerId });
    assert.deepEqual(await room.narrator.request('phase:advance', { to: 'day' }), { ok: false, error: 'HUNTER_PENDING' });

    // The hunter takes the last wolf down → the village wins.
    assert.equal((await hunter.sync()).me.mustShoot, true);
    await ok(hunter, 'hunter:shoot', { targetId: w2.playerId });
    const end = await villagers[1].sync();
    assert.equal(end.phase, 'ended');
    assert.equal(end.winner, 'village');
    assert.equal(end.players.filter((p) => p.role === 'wolf').length, 2, 'roles revealed at the end');

    // Summary and log for the narrator.
    const final = await room.narrator.sync();
    assert.ok(final.summary.markdown.includes('**Ganan los Aldeanos.**'));
    assert.ok(final.summary.markdown.includes('abatido por el Cazador'));
    assert.ok(final.summary.whatsapp.includes('*Resultado:* Ganan los Aldeanos'));
    assert.ok(final.log.length > 10);

    // Nothing a player received over the network leaked hidden information.
    for (const c of room.players) {
      for (const { event, payload } of c.received) {
        assert.deepEqual(leakedPaths(payload), [], `${c.name} received a leak in ${event}`);
        if (event === 'state:public') assert.equal(payload.me, undefined);
      }
      assert.ok(c.received.every(({ event }) => event !== 'state:narrator'), `${c.name} got narrator state`);
      if (c !== seer) assert.ok(c.received.every(({ payload }) => payload?.me?.seerResults === undefined));
      if (c !== witch) assert.ok(c.received.every(({ payload }) => payload?.me?.potions === undefined));
    }
  });

  it('wolves who disagree wait for the narrator (D-1)', async () => {
    const room = await roomWithPlayers(t, 6, { roles: { seer: false, protector: false } });
    const { wolves, village } = await startGame(room);
    await ok(room.narrator, 'phase:advance', { to: 'night' });
    await ok(wolves[0], 'night:act', { targetId: village[0].playerId });
    await ok(wolves[1], 'night:act', { targetId: village[1].playerId });
    const narrator = await room.narrator.sync();
    assert.equal(narrator.derived.night.wolvesDisagree, true);
    assert.equal((await wolves[0].sync()).me.night.wolvesDisagree, true);
    await ok(room.narrator, 'night:skipStep', { step: 'wolves' });
    await ok(room.narrator, 'phase:advance', { to: 'dawn' });
    assert.deepEqual((await village[0].sync()).lastNight.deathIds, []);
  });

  it('runs several rooms independently', async () => {
    const a = await roomWithPlayers(t, 6);
    const b = await roomWithPlayers(t, 6);
    await ok(a.narrator, 'game:start');
    const stateB = await b.players[0].sync();
    assert.equal(stateB.phase, 'lobby');
    assert.ok(b.players[0].received.every(({ payload }) => payload?.code !== a.code));
  });
});

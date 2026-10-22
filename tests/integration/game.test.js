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

  it('plays an original game with 6 players from lobby to summary without leaking roles', async () => {
    const room = await roomWithPlayers(t, 6);
    assert.match(room.code, ROOM_CODE_PATTERN);

    // Lobby: the narrator sees everyone and the recommended mafia count.
    const lobby = await room.narrator.sync();
    assert.equal(lobby.players.length, 6);
    assert.equal(lobby.derived.recommendedMafiaCount, 2);
    assert.ok(Object.values(lobby.connections).every(Boolean));

    // Start: roles reach their owners only; mafiosi recognise each other.
    const { mafia, honest } = await startGame(room);
    assert.equal(mafia.length, 2);
    assert.deepEqual(mafia[0].latest('state:private').me.partnerIds, [mafia[1].playerId]);
    assert.deepEqual(mafia[1].latest('state:private').me.partnerIds, [mafia[0].playerId]);
    for (const c of honest) assert.equal(c.latest('state:private').me.partnerIds, undefined);
    const narratorStart = await room.narrator.sync();
    assert.equal(narratorStart.players.filter((p) => p.role === 'mafia').length, 2);

    // Day 1: an honest player accuses a mafioso, who is voted out.
    await ok(room.narrator, 'phase:advance', { to: 'day' });
    await voteOut(room, honest[0], mafia[0], room.players);
    const afterVote = await honest[1].sync();
    assert.equal(afterVote.players.find((p) => p.id === mafia[0].playerId).alive, false);
    assert.equal(afterVote.players.find((p) => p.id === mafia[0].playerId).role, undefined);

    // Night 1: called by majority; the last mafioso kills honest[0].
    const alive = room.players.filter((c) => c !== mafia[0]);
    for (const c of alive) await ok(c, 'night:request', { wanted: true });
    await ok(room.narrator, 'phase:advance', { to: 'night' });
    await ok(mafia[1], 'night:submit', { targetId: honest[0].playerId });
    for (const c of honest) await ok(c, 'night:submit', { targetId: null });
    const progress = await honest[1].sync();
    assert.deepEqual(progress.night, { submitted: 5, expected: 5 });
    await ok(room.narrator, 'phase:advance', { to: 'day' });
    const day2 = await honest[1].sync();
    assert.equal(day2.round, 2);
    assert.deepEqual(day2.lastNight, { round: 1, victimId: honest[0].playerId, mafiaBallots: 1 });

    // Day 2: the last mafioso is voted out → the honest team wins.
    const survivors = alive.filter((c) => c !== honest[0]);
    await voteOut(room, honest[1], mafia[1], survivors);
    const end = await honest[1].sync();
    assert.equal(end.phase, 'ended');
    assert.equal(end.winner, 'honest');
    assert.equal(end.players.filter((p) => p.role === 'mafia').length, 2, 'roles revealed at the end');

    // Summary for the narrator.
    const final = await room.narrator.sync();
    assert.ok(final.summary.markdown.includes('**Ganan los Honestos.**'));
    assert.ok(final.summary.whatsapp.includes('*Resultado:* Ganan los Honestos'));
    assert.ok(final.log.length > 10);

    // Nothing a player received over the network leaked hidden information.
    for (const c of room.players) {
      for (const { event, payload } of c.received) {
        assert.deepEqual(leakedPaths(payload), [], `${c.name} received a leak in ${event}`);
        if (event === 'state:public') assert.equal(payload.me, undefined);
        if (event === 'state:private' && !mafia.includes(c)) assert.equal(payload.me.partnerIds, undefined);
      }
      assert.ok(c.received.every(({ event }) => event !== 'state:narrator'), `${c.name} got narrator state`);
    }
  });

  it('keeps the seer\'s result private in the classic variant', async () => {
    const room = await roomWithPlayers(t, 6, { mode: 'classic' });
    const { roles, mafia } = await startGame(room);
    const seer = room.players.find((c) => roles.get(c) === 'seer');
    await ok(room.narrator, 'phase:advance', { to: 'day' });
    await ok(room.narrator, 'phase:advance', { to: 'night' });
    await ok(seer, 'night:ability', { targetId: mafia[0].playerId });
    const seen = await seer.sync();
    assert.deepEqual(seen.me.seerResults, [{ round: 1, targetId: mafia[0].playerId, team: 'mafia' }]);
    for (const c of room.players.filter((p) => p !== seer)) {
      const state = await c.sync();
      assert.equal(state.me.seerResults, undefined);
      for (const { payload } of c.received) assert.deepEqual(leakedPaths(payload), []);
    }
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

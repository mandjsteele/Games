'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildDeck, bestArrangement } = require('../server/cards');
const { Game } = require('../server/game');

let nextId = 1000;
const c = (rank, suit = 'hearts') => ({ id: nextId++, rank, suit });
const joker = () => ({ id: nextId++, rank: 0, suit: 'joker' });

test('deck has 116 cards with 6 jokers', () => {
  const deck = buildDeck();
  assert.strictEqual(deck.length, 116);
  assert.strictEqual(deck.filter((x) => x.rank === 0).length, 6);
  assert.strictEqual(new Set(deck.map((x) => x.id)).size, 116);
});

test('book of three goes out', () => {
  const hand = [c(7, 'hearts'), c(7, 'clubs'), c(7, 'stars')];
  assert.strictEqual(bestArrangement(hand, 3).points, 0);
});

test('run of three same suit goes out; mixed suits do not', () => {
  assert.strictEqual(bestArrangement([c(5), c(6), c(7)], 3).points, 0);
  assert.strictEqual(bestArrangement([c(5), c(6, 'clubs'), c(7)], 3).points, 18);
});

test('wild rank and jokers fill gaps', () => {
  // Round 1: 3s are wild. 5h 7h + 3s fills the 6h gap.
  assert.strictEqual(bestArrangement([c(5), c(7), c(3, 'spades')], 3).points, 0);
  assert.strictEqual(bestArrangement([c(12), c(12, 'clubs'), joker()], 5).points, 0);
});

test('unmelded wilds score 20 and jokers 50', () => {
  const r = bestArrangement([c(3, 'spades'), joker(), c(9), c(11, 'clubs')], 3);
  // Jc + two wilds make a meld, leaving the 9h (cheaper than leaving the Jc).
  assert.strictEqual(r.points, 9);
});

test('three wilds alone make a meld', () => {
  assert.strictEqual(bestArrangement([joker(), joker(), c(4, 'stars')], 4).points, 0);
  assert.strictEqual(bestArrangement([joker(), c(4, 'stars')], 4).points, 70);
});

test('card can serve a run or a book, solver picks the best', () => {
  // 5h 6h 7h 7c 7s: run 5-6-7h leaves 7c 7s (14); book of 7s leaves 5h 6h (11).
  const hand = [c(5), c(6), c(7), c(7, 'clubs'), c(7, 'spades')];
  assert.strictEqual(bestArrangement(hand, 13).points, 11);
  // Add a wild: run 5-6-7h + book 7c 7s wild → 0
  assert.strictEqual(bestArrangement([...hand, joker()], 13).points, 0);
});

test('large hand solves quickly', () => {
  const hand = [
    c(3), c(4), c(5), c(6), c(8, 'clubs'), c(8, 'spades'), c(8, 'stars'),
    c(10, 'diamonds'), c(11, 'diamonds'), c(12, 'diamonds'), joker(), c(13, 'clubs'), c(9, 'stars'), c(4, 'spades'),
  ];
  const t = Date.now();
  const r = bestArrangement(hand, 13);
  assert.ok(Date.now() - t < 1000);
  assert.strictEqual(r.points, 4); // only the 4 of spades is left over
  const used = r.melds.flatMap((m) => m.cards).length + r.leftover.length;
  assert.strictEqual(used, hand.length);
});

test('full game plays through 11 rounds', () => {
  let seed = 42;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const g = new Game('TEST', rng);
  g.addPlayer('a', 'ta', 'Alice');
  g.addPlayer('b', 'tb', 'Bob');
  g.addPlayer('c', 'tc', 'Cara');
  assert.throws(() => g.start('b'), /host/);
  g.start('a');
  for (let round = 1; round <= 11; round++) {
    assert.strictEqual(g.round, round);
    assert.ok(g.players.every((p) => p.hand.length === round + 2));
    let turns = 0;
    while (g.phase === 'playing') {
      const p = g.players[g.turn];
      assert.throws(() => g.discardCard(p.id, p.hand[0].id), /Draw a card first/);
      g.draw(p.id, turns % 2 ? 'discard' : 'deck');
      // Go out if any discard allows it; else discard the first card; force out after many turns.
      let wentOut = false;
      for (const card of p.hand) {
        const rest = p.hand.filter((x) => x.id !== card.id);
        if (g.wentOut === null && bestArrangement(rest, g.wildRank).points === 0) {
          g.discardCard(p.id, card.id, true);
          wentOut = true;
          break;
        }
      }
      if (!wentOut) g.discardCard(p.id, p.hand[0].id);
      if (++turns > 2000) assert.fail('round never ended');
    }
    assert.ok(g.players.every((p) => p.scores.length === round));
    if (round < 11) g.nextRound('a');
  }
  assert.strictEqual(g.phase, 'gameOver');
  const view = g.viewFor('b');
  assert.strictEqual(view.me, 1);
  assert.ok(view.roundResults.length === 3);
});

test('cannot go out with unmelded cards', () => {
  const g = new Game('X', () => 0.5);
  g.addPlayer('a', 'ta', 'A');
  g.addPlayer('b', 'tb', 'B');
  g.start('a');
  const p = g.players[g.turn];
  p.hand = [c(4), c(9, 'clubs'), c(12, 'stars')];
  g.draw(p.id, 'deck');
  p.hand.push(c(13, 'spades'));
  assert.throws(() => g.discardCard(p.id, p.hand[0].id, true), /can't go out/);
});

test('substitute teacher mispronounces names and announces going out', () => {
  const Roast = require('../public/roast.js');
  assert.strictEqual(Roast.mispronounce('Aaron'), 'A-A-Ron');
  assert.strictEqual(Roast.mispronounce('Denise'), 'Dee-Nice');
  for (const name of ['Mike', 'Sue', 'Jo', 'Bob', 'Elizabeth', 'Grandma', 'X', 'Mary Ann', '😀', 'Al']) {
    const n = Roast.mispronounce(name);
    assert.ok(typeof n === 'string' && n.length > 0, name);
  }
  // Same line on every phone for the same player and round
  const line = Roast.goOutLine('Blake', 4);
  assert.strictEqual(line, Roast.goOutLine('Blake', 4));
  assert.match(line, /went out/i);
  assert.ok(line.includes(Roast.mispronounce('Blake')));
  assert.strictEqual(Roast.forSpeech('A-A-Ron'), 'A. A. Ron');
});

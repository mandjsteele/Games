'use strict';

// Five Crowns deck: two decks of 5 suits x ranks 3..K (13), plus 6 jokers = 116 cards.
const SUITS = ['stars', 'hearts', 'clubs', 'spades', 'diamonds'];
const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 11 = J, 12 = Q, 13 = K
const JOKER = 0;

function buildDeck() {
  const deck = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) deck.push({ id: id++, suit, rank });
    }
  }
  for (let j = 0; j < 6; j++) deck.push({ id: id++, suit: 'joker', rank: JOKER });
  return deck;
}

function shuffle(cards, rng = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function isWild(card, wildRank) {
  return card.rank === JOKER || card.rank === wildRank;
}

// Points left in hand at round end: jokers 50, the round's wild rank 20, others face value.
function cardPoints(card, wildRank) {
  if (card.rank === JOKER) return 50;
  if (card.rank === wildRank) return 20;
  return card.rank;
}

/**
 * Find the arrangement of a hand that leaves the fewest points unmelded.
 * Melds are books (3+ of a rank) or runs (3+ consecutive ranks of one suit);
 * wild cards can stand in for any card.
 * Returns { points, melds: [[card...]], leftover: [card...] }.
 */
function bestArrangement(hand, wildRank) {
  const wilds = hand.filter((c) => isWild(c, wildRank));
  // Use jokers before rank-wilds so any leftover wilds are the cheap ones.
  wilds.sort((a, b) => cardPoints(b, wildRank) - cardPoints(a, wildRank));
  const naturals = hand.filter((c) => !isWild(c, wildRank));
  const n = naturals.length;
  const W = wilds.length;
  const wildTotal = wilds.reduce((s, c) => s + cardPoints(c, wildRank), 0);
  const memo = new Map();

  // Each candidate meld: { mask (naturals used), wilds (count), slots (for display) }
  function meldsContaining(i, mask) {
    const out = [];
    const ci = naturals[i];
    // Books
    const sameRank = [];
    for (let j = 0; j < n; j++) {
      if (j !== i && mask & (1 << j) && naturals[j].rank === ci.rank) sameRank.push(j);
    }
    const subsets = 1 << sameRank.length;
    for (let s = 0; s < subsets; s++) {
      let m = 1 << i;
      let k = 1;
      for (let b = 0; b < sameRank.length; b++) {
        if (s & (1 << b)) { m |= 1 << sameRank[b]; k++; }
      }
      out.push({ mask: m, wilds: Math.max(0, 3 - k), kind: 'book' });
    }
    // Runs: pick one index per rank of this suit (duplicates are interchangeable)
    const byRank = new Map();
    for (let j = 0; j < n; j++) {
      const c = naturals[j];
      if (mask & (1 << j) && c.suit === ci.suit && !byRank.has(c.rank)) byRank.set(c.rank, j);
    }
    byRank.set(ci.rank, i);
    const ranks = [...byRank.keys()].sort((a, b) => a - b);
    const lows = ranks.filter((r) => r <= ci.rank);
    const highs = ranks.filter((r) => r >= ci.rank);
    for (const lo of lows) {
      for (const hi of highs) {
        const interior = ranks.filter((r) => r > lo && r < hi && r !== ci.rank);
        const combos = 1 << interior.length;
        for (let s = 0; s < combos; s++) {
          let m = (1 << byRank.get(lo)) | (1 << byRank.get(hi)) | (1 << i);
          const used = new Set([lo, hi, ci.rank]);
          for (let b = 0; b < interior.length; b++) {
            if (s & (1 << b)) { m |= 1 << byRank.get(interior[b]); used.add(interior[b]); }
          }
          const span = hi - lo + 1;
          const w = span - used.size + Math.max(0, 3 - span);
          out.push({ mask: m, wilds: w, kind: 'run', lo, hi });
        }
      }
    }
    return out;
  }

  function solve(mask, w, any) {
    if (mask === 0) {
      if (w === 0 || any || w >= 3) return { points: 0, choice: null };
      return { points: wildTotal, choice: null };
    }
    const key = mask * 64 + w * 2 + (any ? 1 : 0);
    if (memo.has(key)) return memo.get(key);
    let i = 0;
    while (!(mask & (1 << i))) i++;
    // Option 1: leave card i unmelded
    const rest = solve(mask & ~(1 << i), w, any);
    let best = { points: rest.points + naturals[i].rank, choice: { leave: i } };
    // Option 2: put card i in a meld
    if (best.points > 0) {
      for (const meld of meldsContaining(i, mask)) {
        if (meld.wilds > w) continue;
        const r = solve(mask & ~meld.mask, w - meld.wilds, true);
        if (r.points < best.points) {
          best = { points: r.points, choice: { meld } };
          if (best.points === 0) break;
        }
      }
    }
    memo.set(key, best);
    return best;
  }

  const result = solve((1 << n) - 1, W, false);

  // Reconstruct arrangement
  const melds = [];
  const leftover = [];
  let mask = (1 << n) - 1;
  let w = W;
  let any = false;
  let wildIdx = 0;
  while (mask) {
    const key = mask * 64 + w * 2 + (any ? 1 : 0);
    const { choice } = memo.get(key);
    if (choice.leave !== undefined) {
      leftover.push(naturals[choice.leave]);
      mask &= ~(1 << choice.leave);
    } else {
      const { meld } = choice;
      const cards = [];
      for (let j = 0; j < n; j++) if (meld.mask & (1 << j)) cards.push(naturals[j]);
      cards.sort((a, b) => a.rank - b.rank);
      for (let k = 0; k < meld.wilds; k++) cards.push(wilds[wildIdx++]);
      melds.push({ kind: meld.kind, cards });
      mask &= ~meld.mask;
      w -= meld.wilds;
      any = true;
    }
  }
  const spare = wilds.slice(wildIdx);
  if (spare.length) {
    if (melds.length) melds[0].cards.push(...spare);
    else if (spare.length >= 3) melds.push({ kind: 'book', cards: spare });
    else leftover.push(...spare);
  }
  return { points: result.points, melds, leftover };
}

const api = { SUITS, RANKS, JOKER, buildDeck, shuffle, isWild, cardPoints, bestArrangement };
// Shared with the browser (served as /melds.js) so players can preview their melds.
if (typeof module !== 'undefined') module.exports = api;
else window.FiveCrowns = api;

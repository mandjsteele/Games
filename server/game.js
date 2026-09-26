'use strict';

const { buildDeck, shuffle, bestArrangement } = require('./cards');

const TOTAL_ROUNDS = 11;
const MAX_PLAYERS = 7;
const MIN_PLAYERS = 2;

class GameError extends Error {}

class Game {
  constructor(code, rng = Math.random) {
    this.code = code;
    this.rng = rng;
    this.players = []; // { id, token, name, hand, scores: [], connected }
    this.phase = 'lobby'; // lobby | playing | roundOver | gameOver
    this.round = 0;
    this.dealer = -1;
    this.turn = 0;
    this.turnStep = 'draw'; // draw | discard
    this.deck = [];
    this.discard = [];
    this.wentOut = null; // index of player who went out first
    this.finalTurnsLeft = 0;
    this.roundResults = null;
    this.log = [];
  }

  get hostId() {
    return this.players[0] && this.players[0].id;
  }

  get cardsThisRound() {
    return this.round + 2;
  }

  get wildRank() {
    return this.round + 2;
  }

  addLog(msg) {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
  }

  addPlayer(id, token, name) {
    if (this.phase !== 'lobby') throw new GameError('Game already started');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('Room is full');
    const player = { id, token, name, hand: [], scores: [], connected: true };
    this.players.push(player);
    this.addLog(`${name} joined`);
    return player;
  }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    if (this.phase === 'lobby') {
      this.addLog(`${this.players[idx].name} left`);
      this.players.splice(idx, 1);
    } else {
      this.players[idx].connected = false;
    }
  }

  playerIndex(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) throw new GameError('You are not in this game');
    return idx;
  }

  start(byId) {
    if (byId !== this.hostId) throw new GameError('Only the host can start');
    if (this.phase !== 'lobby') throw new GameError('Game already started');
    if (this.players.length < MIN_PLAYERS) throw new GameError(`Need at least ${MIN_PLAYERS} players`);
    this.dealer = Math.floor(this.rng() * this.players.length);
    this.startRound(1);
  }

  startRound(round) {
    this.round = round;
    this.phase = 'playing';
    this.dealer = (this.dealer + 1) % this.players.length;
    this.deck = shuffle(buildDeck(), this.rng);
    for (const p of this.players) p.hand = this.deck.splice(0, this.cardsThisRound);
    this.discard = [this.deck.pop()];
    this.turn = (this.dealer + 1) % this.players.length;
    this.turnStep = 'draw';
    this.wentOut = null;
    this.finalTurnsLeft = 0;
    this.roundResults = null;
    this.addLog(`Round ${round} — ${this.cardsThisRound} cards, ${rankName(this.wildRank)}s are wild`);
  }

  nextRound(byId) {
    if (byId !== this.hostId) throw new GameError('Only the host can deal the next round');
    if (this.phase !== 'roundOver') throw new GameError('Round is not over');
    this.startRound(this.round + 1);
  }

  assertTurn(id, step) {
    if (this.phase !== 'playing') throw new GameError('No round in progress');
    const idx = this.playerIndex(id);
    if (idx !== this.turn) throw new GameError("It's not your turn");
    if (this.turnStep !== step) throw new GameError(step === 'draw' ? 'You already drew' : 'Draw a card first');
    return this.players[idx];
  }

  draw(id, source) {
    const player = this.assertTurn(id, 'draw');
    let card;
    if (source === 'discard') {
      if (!this.discard.length) throw new GameError('Discard pile is empty');
      card = this.discard.pop();
      this.addLog(`${player.name} took ${cardName(card)} from the discard pile`);
    } else {
      if (!this.deck.length) this.reshuffle();
      card = this.deck.pop();
      this.addLog(`${player.name} drew from the deck`);
    }
    player.hand.push(card);
    this.turnStep = 'discard';
    return card;
  }

  reshuffle() {
    const top = this.discard.pop();
    this.deck = shuffle(this.discard, this.rng);
    this.discard = top ? [top] : [];
    this.addLog('Deck reshuffled');
  }

  discardCard(id, cardId, goOut = false) {
    const player = this.assertTurn(id, 'discard');
    const idx = player.hand.findIndex((c) => c.id === cardId);
    if (idx === -1) throw new GameError("That card isn't in your hand");
    const remaining = player.hand.filter((c) => c.id !== cardId);
    if (goOut && this.wentOut === null) {
      const arr = bestArrangement(remaining, this.wildRank);
      if (arr.points > 0) throw new GameError("You can't go out yet — not every card fits in a book or run");
    }
    const [card] = player.hand.splice(idx, 1);
    this.discard.push(card);
    this.addLog(`${player.name} discarded ${cardName(card)}`);

    if (this.wentOut === null) {
      if (goOut) {
        this.wentOut = this.turn;
        this.finalTurnsLeft = this.players.length - 1;
        this.addLog(`👑 ${player.name} went out! Everyone else gets one last turn.`);
        if (this.finalTurnsLeft === 0) return this.endRound();
      }
    } else {
      this.finalTurnsLeft--;
      if (this.finalTurnsLeft === 0) return this.endRound();
    }
    this.turn = (this.turn + 1) % this.players.length;
    this.turnStep = 'draw';
  }

  endRound() {
    this.roundResults = this.players.map((p) => {
      const arr = bestArrangement(p.hand, this.wildRank);
      p.scores.push(arr.points);
      return { name: p.name, points: arr.points, melds: arr.melds, leftover: arr.leftover };
    });
    this.addLog(`Round ${this.round} over`);
    if (this.round >= TOTAL_ROUNDS) {
      this.phase = 'gameOver';
      const totals = this.players.map((p) => total(p));
      const low = Math.min(...totals);
      const winners = this.players.filter((p, i) => totals[i] === low).map((p) => p.name);
      this.addLog(`🏆 Game over! ${winners.join(' & ')} win${winners.length > 1 ? '' : 's'} with ${low} points`);
    } else {
      this.phase = 'roundOver';
    }
  }

  // Personalised view of the game for one player (hides other hands).
  viewFor(id) {
    const me = this.players.findIndex((p) => p.id === id);
    const showHands = this.phase === 'roundOver' || this.phase === 'gameOver';
    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      totalRounds: TOTAL_ROUNDS,
      wildRank: this.wildRank,
      dealer: this.dealer,
      turn: this.turn,
      turnStep: this.turnStep,
      wentOut: this.wentOut,
      finalTurnsLeft: this.finalTurnsLeft,
      deckCount: this.deck.length,
      discardTop: this.discard[this.discard.length - 1] || null,
      me,
      isHost: id === this.hostId,
      players: this.players.map((p) => ({
        name: p.name,
        cardCount: p.hand.length,
        scores: p.scores,
        total: total(p),
        connected: p.connected,
      })),
      hand: me >= 0 ? this.players[me].hand : [],
      roundResults: showHands ? this.roundResults : null,
      log: this.log.slice(-15),
    };
  }
}

function total(p) {
  return p.scores.reduce((s, x) => s + x, 0);
}

function rankName(rank) {
  return { 0: 'Joker', 11: 'Jack', 12: 'Queen', 13: 'King' }[rank] || String(rank);
}

function cardName(card) {
  if (card.rank === 0) return 'a Joker';
  const sym = { stars: '★', hearts: '♥', clubs: '♣', spades: '♠', diamonds: '♦' }[card.suit];
  const r = { 11: 'J', 12: 'Q', 13: 'K' }[card.rank] || card.rank;
  return `${r}${sym}`;
}

module.exports = { Game, GameError, TOTAL_ROUNDS };

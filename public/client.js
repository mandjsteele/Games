/* global io, FiveCrowns */
'use strict';

const socket = io();
const $ = (id) => document.getElementById(id);

const SUIT_SYMBOL = { stars: '★', hearts: '♥', clubs: '♣', spades: '♠', diamonds: '♦', joker: '🃏' };
const SUIT_ORDER = ['stars', 'hearts', 'clubs', 'spades', 'diamonds'];

let state = null;
let selected = null; // selected card id
let handOrder = []; // local ordering of card ids
let sortMode = 'suit';
let showHint = false;

// ---------- helpers ----------
function rankLabel(rank) {
  return { 0: '★', 11: 'J', 12: 'Q', 13: 'K' }[rank] || String(rank);
}
function rankWord(rank) {
  return { 11: 'Jacks', 12: 'Queens', 13: 'Kings' }[rank] || `${rank}s`;
}
function isWildCard(card) {
  return state && FiveCrowns.isWild(card, state.wildRank);
}

function cardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = `card ${card.suit}`;
  if (isWildCard(card)) el.classList.add('wild');
  if (card.rank === 0) {
    el.innerHTML = '<span class="rank">JOKER</span><span class="suit">🃏</span>';
  } else {
    el.innerHTML = `<span class="rank">${rankLabel(card.rank)}</span><span class="suit">${SUIT_SYMBOL[card.suit]}</span>`;
  }
  if (opts.small) el.classList.add('small');
  return el;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function send(event, payload) {
  socket.emit(event, payload, (res) => {
    if (res && !res.ok) toast(res.error);
  });
}

function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  $(screen).classList.remove('hidden');
}

// ---------- session ----------
const saved = JSON.parse(localStorage.getItem('fivecrowns') || '{}');
$('name').value = saved.name || '';
const urlCode = new URLSearchParams(location.search).get('room');
if (urlCode) $('code').value = urlCode.toUpperCase();

function saveSession(extra) {
  Object.assign(saved, extra);
  localStorage.setItem('fivecrowns', JSON.stringify(saved));
}

$('create').onclick = () => {
  saveSession({ name: $('name').value.trim() });
  send('create', { name: $('name').value });
};
$('join').onclick = () => {
  const code = $('code').value.trim().toUpperCase();
  saveSession({ name: $('name').value.trim() });
  const token = saved.code === code ? saved.token : undefined;
  send('join', { code, name: $('name').value, token });
};
$('code').addEventListener('keydown', (e) => e.key === 'Enter' && $('join').onclick());

socket.on('connect', () => {
  // Automatically rejoin after a refresh or dropped connection.
  if (saved.code && saved.token && (!urlCode || urlCode.toUpperCase() === saved.code)) {
    socket.emit('join', { code: saved.code, token: saved.token, name: saved.name }, () => {});
  }
});

socket.on('joined', ({ code, token }) => {
  saveSession({ code, token });
  history.replaceState(null, '', `?room=${code}`);
});

socket.on('state', (s) => {
  const prevRound = state && state.round;
  state = s;
  if (s.round !== prevRound) { handOrder = []; showHint = false; }
  render();
});

// ---------- lobby ----------
$('start').onclick = () => send('start');
$('copy-link').onclick = async () => {
  const link = `${location.origin}${location.pathname}?room=${state.code}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Invite link copied!');
  } catch {
    toast(link);
  }
};

// ---------- table actions ----------
$('deck').onclick = () => send('draw', { source: 'deck' });
$('discard-pile').onclick = () => send('draw', { source: 'discard' });
$('discard-btn').onclick = () => discard(false);
$('goout-btn').onclick = () => discard(true);
$('sort-btn').onclick = () => {
  sortMode = sortMode === 'suit' ? 'rank' : 'suit';
  sortHand();
  render();
};
$('hint-btn').onclick = () => { showHint = !showHint; render(); };

function discard(goOut) {
  if (selected === null) return toast('Tap a card in your hand to select it first');
  send('discard', { cardId: selected, goOut });
  selected = null;
}

function sortHand() {
  const byId = new Map(state.hand.map((c) => [c.id, c]));
  const key = (c) => {
    if (isWildCard(c)) return 1e6 + c.rank; // wilds at the end
    const s = SUIT_ORDER.indexOf(c.suit);
    return sortMode === 'suit' ? s * 100 + c.rank : c.rank * 100 + s;
  };
  handOrder = handOrder.slice().sort((a, b) => key(byId.get(a)) - key(byId.get(b)));
}

function syncHandOrder() {
  const ids = new Set(state.hand.map((c) => c.id));
  const fresh = handOrder.length === 0;
  handOrder = handOrder.filter((id) => ids.has(id));
  for (const c of state.hand) if (!handOrder.includes(c.id)) handOrder.push(c.id);
  if (fresh) sortHand();
  if (selected !== null && !ids.has(selected)) selected = null;
}

// ---------- rendering ----------
function render() {
  const s = state;
  $('room-label').textContent = s ? `Room ${s.code}` : '';
  if (!s) return show('home');
  if (s.phase === 'lobby') return renderLobby();
  show('table');
  syncHandOrder();
  renderStatus();
  renderOpponents();
  renderPiles();
  renderHand();
  renderHint();
  renderRoundOver();
  renderScoreboard();
  renderLog();
}

function renderLobby() {
  show('lobby');
  $('lobby-code').textContent = state.code;
  $('lobby-players').innerHTML = '';
  state.players.forEach((p, i) => {
    const li = document.createElement('li');
    li.textContent = p.name + (i === 0 ? ' (host)' : '') + (i === state.me ? ' — you' : '');
    $('lobby-players').appendChild(li);
  });
  $('start').classList.toggle('hidden', !state.isHost);
  $('start').disabled = state.players.length < 2;
  $('start').textContent = state.players.length < 2 ? 'Waiting for players…' : 'Start game';
  $('lobby-wait').classList.toggle('hidden', state.isHost);
}

function myTurn() {
  return state.phase === 'playing' && state.turn === state.me;
}

function renderStatus() {
  const s = state;
  const current = s.players[s.turn];
  let text = `Round ${s.round}/${s.totalRounds} · ${s.round + 2} cards · <b>${rankWord(s.wildRank)} & Jokers wild</b><br>`;
  if (s.phase === 'playing') {
    if (s.wentOut !== null) text += `👑 ${s.players[s.wentOut].name} went out — final turns! `;
    if (myTurn()) {
      text += s.turnStep === 'draw'
        ? '<span class="you">Your turn: draw from the deck or discard pile</span>'
        : '<span class="you">Your turn: select a card to discard</span>';
    } else {
      text += `Waiting for ${current.name}…`;
    }
  } else if (s.phase === 'roundOver') {
    text += 'Round over!';
  } else if (s.phase === 'gameOver') {
    text += 'Game over!';
  }
  $('status').innerHTML = text;
}

function renderOpponents() {
  const box = $('opponents');
  box.innerHTML = '';
  state.players.forEach((p, i) => {
    if (i === state.me) return;
    const el = document.createElement('div');
    el.className = 'opponent';
    if (i === state.turn && state.phase === 'playing') el.classList.add('active');
    if (!p.connected) el.classList.add('offline');
    el.innerHTML = `<div class="opp-name">${escapeHtml(p.name)}${i === state.dealer ? ' <span title="Dealer">🎴</span>' : ''}${i === state.wentOut ? ' 👑' : ''}</div>
      <div class="opp-cards">${'<span class="mini-back"></span>'.repeat(p.cardCount)}</div>
      <div class="muted">${p.cardCount} cards · ${p.total} pts${p.connected ? '' : ' · offline'}</div>`;
    box.appendChild(el);
  });
}

function renderPiles() {
  $('deck-count').textContent = state.deckCount;
  const canDraw = myTurn() && state.turnStep === 'draw';
  $('deck').classList.toggle('clickable', canDraw);
  const pile = $('discard-pile');
  pile.innerHTML = '';
  if (state.discardTop) {
    const c = cardEl(state.discardTop);
    if (canDraw) c.classList.add('clickable');
    pile.appendChild(c);
  } else {
    pile.innerHTML = '<div class="card empty"></div>';
  }
  const canDiscard = myTurn() && state.turnStep === 'discard';
  $('discard-btn').disabled = !canDiscard || selected === null;
  $('goout-btn').disabled = !canDiscard || selected === null || state.wentOut !== null;
  $('actions').classList.toggle('hidden', state.phase !== 'playing');
}

function renderHand() {
  const box = $('hand');
  box.innerHTML = '';
  const byId = new Map(state.hand.map((c) => [c.id, c]));
  for (const id of handOrder) {
    const card = byId.get(id);
    const el = cardEl(card);
    el.classList.add('clickable');
    if (id === selected) el.classList.add('selected');
    el.onclick = () => {
      selected = selected === id ? null : id;
      render();
    };
    // Drag to reorder (desktop)
    el.draggable = true;
    el.ondragstart = (e) => e.dataTransfer.setData('text/plain', String(id));
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (from === id) return;
      handOrder = handOrder.filter((x) => x !== from);
      handOrder.splice(handOrder.indexOf(id), 0, from);
      render();
    };
    box.appendChild(el);
  }
  box.classList.toggle('hidden', state.phase !== 'playing');
}

function arrangementEl(arr) {
  const wrap = document.createElement('div');
  wrap.className = 'arrangement';
  for (const meld of arr.melds) {
    const g = document.createElement('div');
    g.className = 'meld';
    for (const c of meld.cards) g.appendChild(cardEl(c, { small: true }));
    wrap.appendChild(g);
  }
  if (arr.leftover.length) {
    const g = document.createElement('div');
    g.className = 'meld leftover';
    for (const c of arr.leftover) g.appendChild(cardEl(c, { small: true }));
    wrap.appendChild(g);
  }
  return wrap;
}

function renderHint() {
  const box = $('hint');
  const visible = showHint && state.phase === 'playing';
  box.classList.toggle('hidden', !visible);
  $('hint-btn').textContent = showHint ? 'Hide melds' : 'Show melds';
  if (!visible) return;
  // With an extra drawn card, preview the hand minus the selected card.
  let cards = state.hand;
  if (cards.length > state.round + 2 && selected !== null) cards = cards.filter((c) => c.id !== selected);
  const arr = FiveCrowns.bestArrangement(cards, state.wildRank);
  box.innerHTML = `<div class="muted">Best grouping${cards.length < state.hand.length ? ' after discarding the selected card' : ''}: <b>${arr.points} pts</b> left over</div>`;
  box.appendChild(arrangementEl(arr));
}

function renderRoundOver() {
  const box = $('round-over');
  const s = state;
  const visible = s.phase === 'roundOver' || s.phase === 'gameOver';
  box.classList.toggle('hidden', !visible);
  if (!visible) return;
  box.innerHTML = '';
  const h = document.createElement('h2');
  if (s.phase === 'gameOver') {
    const low = Math.min(...s.players.map((p) => p.total));
    const winners = s.players.filter((p) => p.total === low).map((p) => p.name);
    h.textContent = `🏆 ${winners.join(' & ')} win${winners.length > 1 ? '' : 's'}!`;
  } else {
    h.textContent = `Round ${s.round} results`;
  }
  box.appendChild(h);
  for (const r of s.roundResults) {
    const row = document.createElement('div');
    row.className = 'result';
    row.innerHTML = `<div><b>${escapeHtml(r.name)}</b>: ${r.points === 0 ? '0 — out! 👑' : `+${r.points}`}</div>`;
    row.appendChild(arrangementEl(r));
    box.appendChild(row);
  }
  if (s.phase === 'roundOver') {
    if (s.isHost) {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = `Deal round ${s.round + 1}`;
      b.onclick = () => send('nextRound');
      box.appendChild(b);
    } else {
      box.insertAdjacentHTML('beforeend', '<p class="muted">Waiting for the host to deal the next round…</p>');
    }
  } else {
    const b = document.createElement('button');
    b.textContent = 'New game';
    b.onclick = () => {
      localStorage.removeItem('fivecrowns');
      location.href = location.pathname;
    };
    box.appendChild(b);
  }
}

function renderScoreboard() {
  const s = state;
  const rounds = Array.from({ length: s.totalRounds }, (_, i) => i + 1);
  let html = '<table><tr><th>Player</th>';
  html += rounds.map((r) => `<th class="${r === s.round ? 'cur' : ''}">${rankLabel(r + 2)}</th>`).join('');
  html += '<th>Total</th></tr>';
  s.players.forEach((p, i) => {
    html += `<tr class="${i === s.me ? 'me' : ''}"><td>${escapeHtml(p.name)}</td>`;
    html += rounds.map((r) => `<td>${p.scores[r - 1] ?? ''}</td>`).join('');
    html += `<td><b>${p.total}</b></td></tr>`;
  });
  $('scoreboard').innerHTML = html + '</table>';
}

function renderLog() {
  $('log').innerHTML = state.log.slice().reverse().map((l) => `<li>${escapeHtml(l)}</li>`).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

render();

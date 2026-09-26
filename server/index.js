'use strict';

const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Game, GameError } = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/melds.js', (req, res) => res.sendFile(path.join(__dirname, 'cards.js')));

const games = new Map(); // code -> Game

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (games.has(code));
  return code;
}

function broadcast(game) {
  for (const p of game.players) {
    if (p.connected) io.to(p.id).emit('state', game.viewFor(p.id));
  }
}

function cleanName(name) {
  const n = String(name || '').trim().slice(0, 20);
  if (!n) throw new GameError('Please enter your name');
  return n;
}

io.on('connection', (socket) => {
  let game = null;

  // Wrap handlers so rule violations are reported back to the caller.
  const on = (event, fn) =>
    socket.on(event, (payload = {}, ack) => {
      try {
        fn(payload);
        if (game) broadcast(game);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (!(err instanceof GameError)) console.error(err);
        const message = err instanceof GameError ? err.message : 'Something went wrong';
        if (typeof ack === 'function') ack({ ok: false, error: message });
      }
    });

  function enter(g, name, token) {
    const existing = token && g.players.find((p) => p.token === token);
    if (existing) {
      existing.id = socket.id;
      existing.connected = true;
      g.addLog(`${existing.name} reconnected`);
    } else {
      g.addPlayer(socket.id, crypto.randomUUID(), cleanName(name));
    }
    game = g;
    socket.join(g.code);
    const me = g.players.find((p) => p.id === socket.id);
    socket.emit('joined', { code: g.code, token: me.token });
  }

  on('create', ({ name }) => {
    cleanName(name);
    const g = new Game(newCode());
    games.set(g.code, g);
    enter(g, name);
  });

  on('join', ({ code, name, token }) => {
    const g = games.get(String(code || '').trim().toUpperCase());
    if (!g) throw new GameError('No game with that code');
    enter(g, name, token);
  });

  on('start', () => game && game.start(socket.id));
  on('draw', ({ source }) => game && game.draw(socket.id, source));
  on('discard', ({ cardId, goOut }) => game && game.discardCard(socket.id, cardId, !!goOut));
  on('nextRound', () => game && game.nextRound(socket.id));

  socket.on('disconnect', () => {
    if (!game) return;
    game.removePlayer(socket.id);
    if (game.players.every((p) => !p.connected)) {
      const code = game.code;
      // Keep abandoned games around briefly so players can refresh/reconnect.
      setTimeout(() => {
        const g = games.get(code);
        if (g && g.players.every((p) => !p.connected)) games.delete(code);
      }, 30 * 60 * 1000);
    } else {
      broadcast(game);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Five Crowns server running at http://localhost:${PORT}`);
});

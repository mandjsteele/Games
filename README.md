# 👑 Five Crowns Online

A browser version of the **Five Crowns** rummy-style card game that 2–7 people can play together online in real time.

## Play locally

```bash
npm install
npm start
```

Open http://localhost:3000, enter your name, and click **Create a new game**. Share the 4-letter room code (or the **Copy invite link** button) with friends. Once everyone has joined, the host clicks **Start game**.

To play with people on other networks, deploy the server somewhere public (see below).

## Rules implemented

- 116-card deck: two copies of 5 suits (★ ♥ ♣ ♠ ♦) with ranks 3–K, plus 6 Jokers.
- 11 rounds: round 1 deals 3 cards, round 11 deals 13.
- The rank equal to the number of cards dealt is wild (3s in round 1 … Kings in round 11). Jokers are always wild.
- On your turn, draw from the deck or the discard pile, then discard one card.
- Go out when every card left in your hand fits into **books** (3+ of the same rank) or **runs** (3+ consecutive cards of one suit). Wild cards can stand in for anything.
- After someone goes out, every other player gets one last turn.
- Cards left unmelded score against you: face value, J = 11, Q = 12, K = 13, wild rank = 20, Joker = 50. The server works out the best grouping for each hand automatically.
- Lowest total after 11 rounds wins.

## In-game help

- Tap a card to select it, then press **Discard** or **Go out 👑**.
- **Sort** switches between sorting by suit and by rank. On desktop you can also drag cards to reorder them.
- **Show melds** previews the best way to group your current hand and how many points it would leave.
- Refreshing the page or losing your connection rejoins your seat automatically.
- A ding plays when it's your turn, and a fanfare plays when someone goes out. Use the 🔊 button in the top corner to mute. (Browsers only allow sound after you've tapped or clicked the page once.)

## Deploying

This is a plain Node.js app (Express + Socket.IO) that listens on `$PORT`. It runs on any host that supports Node and WebSockets, such as Render, Railway, or Fly.io:

- Build command: `npm install`
- Start command: `npm start`

Game state is kept in memory, so restarting the server ends any games in progress.

## Development

```bash
npm test   # rules engine and full-game simulation tests
```

- `server/cards.js`: deck, wild cards, scoring, and the meld solver (shared with the browser as `/melds.js`)
- `server/game.js`: game state machine (rounds, turns, going out, scores)
- `server/index.js`: HTTP and Socket.IO server, rooms, and reconnection
- `public/`: browser client

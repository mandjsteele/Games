# Five Crowns Online

## Git workflow
- Commit and push all changes directly to the `Main` branch (capital M). Render deploys the live game from `Main`, so anything pushed elsewhere never goes live.
- Run `npm test` before pushing.

## Project
- `server/cards.js`: deck, wild cards, scoring and meld solver (also served to the browser as `/melds.js`)
- `server/game.js`: game state machine
- `server/index.js`: Express + Socket.IO server
- `public/`: browser client (`client.js`, `sounds.js`, `style.css`, `index.html`)

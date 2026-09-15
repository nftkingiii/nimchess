# NimChess

A mobile chess club built for Nimiq Pay. Play a bot, challenge a friend, solve a daily puzzle, and send an optional NIM tip after a good game.

## Features

- Three local bot difficulty levels using a worker-based chess engine, plus pass-and-play. Practice games recover after a reload in the same browser tab.
- Private friend links, server-validated moves, 3/5/10-minute clocks, increments, draw offers, resignation, rematches and reconnect polling.
- Eight original puzzle positions, daily rotation, hints, explanations, XP and NimRanks.
- Persistent browser profiles, selectable avatars and board palettes, club standings, game history and PGN replay/export.
- Official Nimiq Pay SDK connection plus standalone Nimiq Hub/Wallet fallback, signed challenge verification, disconnect and optional direct player tips.
- Original generated knight artwork, custom SVG pieces, mobile layout and keyboard focus states.

## Run

Node.js 24 is required for built-in SQLite.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open http://localhost:3001. For development, run `npm run server` and `npm run dev -- --port 5178` in separate terminals. Browser tests use port 5178 and an installed Microsoft Edge browser.

```sh
npm test
npm run typecheck
npx playwright test
```

## Hosting

Use one Node process and one replica. Set `NODE_ENV=production`, `PUBLIC_ORIGIN` to the exact HTTPS app origin, and `DATA_DIR` to a persistent mounted directory. `PORT` is supplied by Railway or defaults to 3001. The server serves `dist` and the API from the same origin. A persistent volume is required to retain profiles and games across redeploys. `railway.json` contains build/start configuration; no public deployment is claimed by this repository.

## Wallet behavior

Open the HTTPS application inside Nimiq Pay, or use the wallet dialog's standalone Nimiq Wallet option in a normal browser. Nimiq Pay uses the injected Mini App provider; standalone browsers use Nimiq Hub/Keyguard for signed-message authentication and approved NIM checkout. A signed, short-lived challenge proves control of the linked tipping address. Guest progress is browser scoped; wallet linking currently does not synchronize profiles across devices. Disconnect removes the application association; there is no documented SDK operation to disconnect the host wallet itself.

The documented Nimiq provider does not expose a network query. NimChess therefore does not infer mainnet or testnet from an address. Check the network, recipient, amount and fee in the native wallet before approving a tip. A returned transaction hash is shown as submitted, not confirmed. Native wallet interaction must be tested on a real phone; cryptographic unit tests do not establish device compatibility.

Tips are voluntary and paid directly to another player. There are no entry stakes, custody, prize pools or paid ratings. Club rating is recreational and is not a cheat-detection system. Puzzle answers are available to the client for hints; XP is recreational and has no financial value.

## Data and security

Opaque session tokens are kept in HttpOnly cookies; only hashes are stored in SQLite. Moves, participant permissions, clocks, puzzles and rating awards are checked server-side. JSON inputs are validated, API rates limited, and security headers enabled. No seed phrases or private keys are requested or stored. Back up the SQLite database and its WAL consistently before operating a public service.

## Research

The [official Cycle II showcase](https://miniappscompetition.com/submissions/cycle2) includes TeTe, whose description mentions chess among multiple skill challenges. NimChess is differentiated as a dedicated chess club; it is not claimed to be the first chess-related submission. The name is also used by an unrelated [Nim language library](https://github.com/tsoj/nimchess).

Integration references: [Nimiq Mini Apps](https://nimiq.dev/mini-apps/), [provider API](https://nimiq.dev/mini-apps/api-reference/nimiq-provider), [competition starter kit](https://miniappscompetition.com/starterkit).

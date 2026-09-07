# Canasino

Canasino is a premium on-chain casino experience for the Canopy ecosystem. The product is designed to feel like a real modern casino first—fast, social, animated and easy to understand—while making wallet approval, round state and verifiability visible instead of hiding the blockchain behind marketing copy.

## What is live in this branch

### Premium casino shell

- Dark charcoal / deep-forest visual system with gold accents
- Responsive desktop sidebar and mobile bottom navigation
- Animated hero and game artwork built in CSS
- Game-category filtering and premium game cards
- State-driven microanimations for wallet, transaction and live-round feedback
- `prefers-reduced-motion` support

### Bingo Live

Bingo is the real connected game in the current Canasino floor. Poker, Domino, Pool, Roulette and Crash are intentionally labeled **Coming Soon** until their game logic exists.

The Bingo experience includes:

- Live room templates from the existing Bingo game server
- 1–4 card selection with the same card-cost multipliers as Bingo Rush
- Real round creation
- FleetWallet connection, reconnect, balance and disconnect
- Wallet-signed `MessageJoinRoom` through `canopy_signAndSubmit`
- Visible transaction states: room ready → signature → submitted → confirmed
- Server registration after the wallet-signed join
- Real player card loading after registration
- Live ball stream over WebSocket
- Win/settlement state handling
- Round proof surface
- Real per-room WebSocket chat
- Desktop room-chat panel and mobile chat bottom sheet

## FleetWallet contract

Canasino follows the FleetWallet integration contract already used by `infoboy27/BingoRushMobile`:

- Injected provider: `window.fleet`
- Permissions: `account`, `balance`, `tx.write`
- Generic transaction method: `canopy_signAndSubmit`
- Bingo message: `join_room`
- Type URL: `type.googleapis.com/types.MessageJoinRoom`
- Fields: signer address, round ID, number of cards and amount

If the installed FleetWallet build does not expose `canopy_signAndSubmit`, Canasino stops the real-value flow and shows an explicit compatibility error instead of silently falling back to a fake transaction.

## Game-server contract

Default server:

```text
https://bingo.jfmcss.com
```

Used routes:

```text
GET  /rooms
POST /rounds
GET  /rounds/{id}/info
POST /rounds/{id}/register
GET  /rounds/{id}/card?address=...&num_cards=...
GET  /rounds/{id}/proof
WS   /ws/rounds/{id}
WS   /ws/rounds/{id}/chat
```

Override the server with:

```bash
VITE_BINGO_API_URL=https://your-bingo-server.example
```

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Brand

- Primary gold: `#D4AF37`
- Gold highlight: `#EED47D`
- Canopy green: `#77D53D`
- Background: `#090B0B`
- Token / ecosystem label: `CASN`
- Tagline: `Play. Win. On-chain.`

## Stack

- React
- Vite
- CSS
- FleetWallet injected provider
- FastAPI/HTTP Bingo game server integration
- WebSocket live rounds + room chat

## Implementation note

The `infoboy27/canopy` branch named `bingo-plugin` currently has no commits ahead of `main` and is substantially behind it, so it is not treated as an additional authoritative Bingo contract. The active frontend integration is aligned to the contract already present in `BingoRushMobile`.

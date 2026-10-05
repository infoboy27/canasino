# Dev wallet (local play-testing without the FleetWallet extension)

`dev_wallet.py` is a **dev-only** stand-in for FleetWallet. It signs transactions and
auth challenges with a throwaway BLS key against the **isolated local test chain
(chain 1)**; it refuses to start on any other chain id and is never part of a
production build (`src/dev/mockFleet.js` only loads under `vite dev`).

1. Run it next to the local test gameserver (needs `gameserver/` on the path, the same
   image as the test gameserver works) with `CANOPY_*` env pointing at the test node and
   the test gameserver's data volume mounted at `/app/data`. It listens on `:8094`.
2. Add to `.env.local` (git-ignored):
   ```
   VITE_BINGO_API_URL=http://localhost:8093
   VITE_WAGERING_ENABLED=1
   VITE_ALLOW_PRACTICE_OPPONENT=1
   VITE_OPERATOR_TOKEN=<test gameserver admin token>
   VITE_DEV_WALLET_URL=http://localhost:8094
   VITE_CANASINO_RPC=http://canopy-python:50002
   VITE_CANASINO_CHAIN_ID=1
   VITE_CANASINO_NETWORK_ID=1
   ```
3. `npm run dev`, click **Connect wallet**. The wallet is auto-funded with valueless test coins.

Never use real keys or a production gameserver URL here.

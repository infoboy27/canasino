# Canasino

Canasino is the React interface for the Canopy casino project. This branch is deliberately **read-only for wagering** while the audit blockers in wallet authorization, settlement and crash recovery are resolved.

## Current safety state

`WAGERING_PAUSED=true` is the required production posture.

- The browser does not create rounds, register players or open wagering WebSockets.
- Game cards and tables are labelled as previews, not as live products.
- FleetWallet can be detected and connected, but no wager transaction is requested.
- The game-server hardening candidate allows only the expiry/refund lifecycle while paused.
- Any proof shown by the interface is reported server data; it is not independently verified by the browser.

Do not remove the pause until the blocking items in [`audit/REPORT.md`](audit/REPORT.md) are implemented and independently re-tested.

## Architecture

The system spans three repositories/runtime sources:

- This repository: React/Vite frontend.
- `infoboy27/canasino-gameserver`: FastAPI game coordinator and Canopy bridge.
- `infoboy27/canopy`, `plugin/python`: on-chain casino state machine.

At audit time, production ran game-server branch `feature/roulette` at `e842785`. The active Canopy checkout was branch `development` at `cd4cd495` with local, uncommitted plugin changes. Those facts are evidence from the audit snapshot, not a promise that production still has that state.

## Read-only preview data

The default API is:

```text
https://bingo.jfmcss.com
```

To use another read-only endpoint:

```bash
VITE_BINGO_API_URL=https://your-bingo-server.example
```

If the API origin changes, update the deployment Content Security Policy too. The checked-in Nginx candidate currently permits only the default origin.

## Local development

Use Node.js 22:

```bash
npm ci
npm run dev
```

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The end-to-end suite builds the application and serves the generated `dist` directory with Vite Preview. It covers desktop and mobile layouts but does not authorize real-value transactions.

## Deployment candidate

[`deploy/nginx.conf`](deploy/nginx.conf) is a hardened static-serving candidate with SPA fallback and security headers. Its presence does not prove that the live proxy is using it. Deployment remains a separate, explicitly approved step.

## Audit artifacts

- Consolidated findings and release decision: [`audit/REPORT.md`](audit/REPORT.md)
- Reproducible cross-repository patches: `audit/patches/`
- Representative browser evidence: `audit/screenshots/`

## Production decision

**NOT READY FOR REAL-MONEY WAGERING.** The preview frontend is usable, but wallet-bound authorization, replay protection, durable settlement reconciliation and an unbiased commit/reveal protocol remain release blockers.

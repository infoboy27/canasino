# Canasino real-money implementation log

Started: 2026-09-08  
Safety rule: production remains paused; all chain tests use valueless tokens and dedicated keys.

## Baseline

- Frontend audit: `2eb59a3`; evidence/report: `8f7b4e2`.
- Game-server candidate: `audit/production-hardening` at `2f13780`, based on production `e842785`.
- Canopy plugin candidate: `audit/canasino-financial-hardening` at `166575f2`, based on production `cd4cd495`.
- Baseline gates: frontend 6 unit + 9 E2E; game-server 203; plugin 177; all passing.

## Delivery gates

| # | Workstream | Status | Definition of done |
|---:|---|---|---|
| 1 | Wallet-bound authorization | PARTIAL | Backend/frontend protocol and tests pass; FleetWallet method and real integration remain |
| 2 | Durable transaction reconciliation | PARTIAL | Persist-before-submit outbox, successful receipt/finality, restart-safe idempotency |
| 3 | Fair close/reveal randomness | NOT STARTED | Bets close before unpredictable entropy; deterministic settle; abort-safe refund/penalty |
| 4 | Signed Poker/Domino actions | NOT STARTED | Every ordered action bound to player, round, turn and prior state |
| 5 | Solvency/accounting invariants | NOT STARTED | Worst-case liabilities reserved; conservation and bounds proven under concurrency |
| 6 | Keys and secrets | NOT STARTED | External signer/KMS interface, rotation, encryption, multisig operations |
| 7 | Reproducible observable production | NOT STARTED | Immutable artifacts, SBOM, drift checks, metrics, alerts, backup/restore, kill switch |
| 8 | Valueless testnet and independent validation | NOT STARTED | Wallet-to-payout E2E, fault/race/load tests and external review evidence |

## Decisions

- Authentication and transaction authorization are separate: a session proves wallet control; every economic action is additionally bound to its exact payload and a unique operation ID.
- The game-server remains fail-closed until both wallet verification and the corresponding chain operation are implemented.
- Protocol/schema changes are introduced in the Canopy branch first and consumed by the game-server/frontend only after generated types and compatibility tests pass.
- Passing unit tests never constitutes production approval.

## Evidence log

- 2026-09-08: roadmap saved; implementation started with workstream 1.
- 2026-09-08: added `CANASINO-AUTH-V1`, persistent one-use challenges/grants, BLS address/signature verification, payload binding, expiry and rate limits. Game-server 210/210 and frontend 9/9 unit tests passed. Real FleetWallet `canopy_signMessage` support is still required.
- 2026-09-08: wallet-authorized Bingo/Roulette/Domino/Poker registrations now bind the grant to `operation_id`, exact request body and `tx_hash`; the game-server verifies signer, message type, network, chain, fields and confirmation depth before applying. Duplicate operation retries are idempotent, rejected receipts stay rejected and one chain hash cannot back two operations.
- 2026-09-08: added a persist-before-submit operator outbox. Signed transaction envelopes and locally computed canonical hashes survive a lost response/restart and exact-hash receipt lookup replaces the recent-sender-window inclusion heuristic. Business-state recovery between every individual funding/join step still needs fault-injection coverage, so workstream 2 remains partial.
- 2026-09-08: game-server candidate passed 224/224 isolated tests with `--network none`; frontend passed ESLint, TypeScript, production build and 10/10 unit tests. Production remained untouched and all temporary remote test images/directories were removed.

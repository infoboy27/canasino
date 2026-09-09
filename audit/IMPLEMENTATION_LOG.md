# Canasino real-money implementation log

Started: 2026-09-08  
Safety rule: production remains paused; all chain tests use valueless tokens and dedicated keys.

## Baseline

- Frontend audit: `2eb59a3`; evidence/report: `8f7b4e2`.
- Game-server candidate: `audit/production-hardening` at `2282731`, based on production `e842785`.
- Canopy plugin candidate: `audit/canasino-financial-hardening` at `ee3b4e6e`, based on production `cd4cd495`.
- FleetWallet candidate: `audit/canasino-message-auth` at `86102d3`, based on `86fb179`.
- Baseline gates: frontend 6 unit + 9 E2E; game-server 203; plugin 177; all passing.

## Delivery gates

| # | Workstream | Status | Definition of done |
|---:|---|---|---|
| 1 | Wallet-bound authorization | IMPLEMENTED; E2E PENDING | Backend/frontend/FleetWallet protocol and cross-language proof pass; interactive extension E2E remains |
| 2 | Durable transaction reconciliation | PARTIAL | Persist-before-submit outbox, successful receipt/finality, restart-safe idempotency |
| 3 | Fair close/reveal randomness | SPECIFIED; BLOCKING | Bets close before unpredictable entropy; deterministic settle; abort-safe refund/penalty |
| 4 | Signed Poker/Domino actions | IMPLEMENTED; E2E PENDING | Every ordered action bound to player, round, turn and prior state |
| 5 | Solvency/accounting invariants | IMPLEMENTED; STRESS PENDING | Worst-case liabilities reserved; conservation and bounds proven under concurrency |
| 6 | Keys and secrets | PARTIAL | External signer/KMS interface, rotation, encryption, multisig operations |
| 7 | Reproducible observable production | PARTIAL | Immutable artifacts, SBOM, drift checks, metrics, alerts, backup/restore, kill switch |
| 8 | Valueless testnet and independent validation | PARTIAL | Wallet-to-payout E2E, fault/race/load tests and external review evidence |

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
- 2026-09-08: cloned FleetWallet at `86fb179`, added strict canonical `canopy_signMessage` approval/signing and committed candidate `86102d3`. FleetWallet passed 48/48 tests; a Noble-generated proof verified with Python `blspy` (`CROSS_LANGUAGE_VERIFY=True`).
- 2026-09-08: live node was audited read-only at height `473478`, network `1`; the configured treasury held `84,800,028` base units and the chain reported 281 prior transactions. No transaction was submitted. This node is not considered valueless.
- 2026-09-08: Poker/Domino actions now consume a one-use wallet grant bound to UUID, player, round, sequence and SHA-256 of the exact prior public state. The state comparison and action application occur under one lock; stale/replayed state is rejected. Frontend helpers produce the same payload/resource contract.
- 2026-09-08: roulette now transfers a conservative worst-case liability reserve from treasury to escrow atomically with each accepted bet. Underfunded bets fail before acceptance; expiry refunds stakes and releases reserves. Bingo/Poker/Domino remain escrow-bounded. Plugin suite passed 177/177.
- 2026-09-08: added a verified external BLS signer interface over a local Unix socket. Real-money mode requires an external signer plus configured operator public identity and refuses SQLite operator-key fallback. Rotation/multisig governance remain pending.
- 2026-09-08: added backend chain-write kill switch (off by default for a real RPC), capability/Prometheus gauges, immutable build metadata, checksummed SQLite backup verification and removal of automatic production Git commits/pushes. Game-server suite passed 232/232 in an isolated container.
- 2026-09-08: launched a separate clean Canopy node using image digest `sha256:2340361...`, internal Docker network and isolated `/tmp/canasino-valueless-audit-20260908` data. It produced blocks with a new validator and Python plugin query returned HTTP 200. No host ports or production mounts were used; no transactions were submitted.
- 2026-09-08: frontend passed ESLint, TypeScript, 11/11 unit tests and production build. All changes remain local candidates; production is still paused and unchanged.

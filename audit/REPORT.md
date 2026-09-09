# Canasino — Full-stack security and production-readiness audit

Audit date: 2026-09-08

Decision: **NO-GO for real-money wagering**

Safe operating mode: **read-only product preview with `WAGERING_PAUSED=true`**

## 1. Executive summary

The frontend is now a coherent, responsive preview and its economic write paths fail closed. The game-server and Canopy plugin have separate, tested hardening candidates, but they are intentionally not deployed. The system is not ready to custody or move real value because the current protocol does not bind browser actions to wallet ownership, does not durably reconcile chain submissions after crashes, and lets the operator know the committed random seed before betting closes.

Scores reflect the audited snapshot, not future intent:

| Area | Score | Release interpretation |
|---|---:|---|
| Preview UX and responsive quality | 8/10 | Suitable for a clearly labelled, read-only demonstration |
| Frontend engineering quality | 8/10 | Automated lint, types, unit, build, E2E and accessibility gates pass |
| Game-server security | 4/10 | Candidate kill switch is useful; authorization and reconciliation protocol are incomplete |
| Blockchain/game integrity | 3/10 | Several accounting bugs are patched, but fairness and action authorization remain blockers |
| Real-money production readiness | 2/10 | **Do not enable deposits, wagers or payouts** |

No real wallet was asked to sign, no live wager was placed and no production service was redeployed during this audit.

## 2. Scope, sources of truth and drift

The audit covered the React frontend, the deployed game-server source/runtime and the active Canopy plugin source. The public game-server `master` branch was not representative of production; the correct comparison base is `feature/roulette`.

| Component | Audited source | Snapshot |
|---|---|---|
| Frontend | `C:\jfmcs\canasino`, branch `main` | base `e703237` plus this local audit work |
| Game-server production checkout | `/home/ubuntu/canasino` | `feature/roulette`, `e842785e209f0d191e7cf25b5670211222535936`, clean |
| Canopy production checkout | `/home/ubuntu/canasino/canopy` | `development`, `cd4cd49515eaa306c7cf22fe66222a3285e98289`, locally modified plugin plus untracked `plugin/python/release/` |
| Live containers | Remote Docker host | `canasino-gameserver`, `canopy-python`, `canasino-ui` and legacy UI remained running |

That Canopy worktree drift is itself a release blocker: a production rebuild is not reproducible until the local changes are reviewed, committed and tied to an immutable artifact digest.

## 3. Frontend findings and implemented fixes

Implemented in this repository:

- Added a global fail-closed wagering switch. All JSON writes and game WebSockets reject before calling `fetch`, `WebSocket` or FleetWallet while paused.
- Replaced unsafe floating-point wire parsing with exact integer token conversion and strict safe-integer validation.
- Validated remote room payloads, bounds and optional `0x` transaction-hash formatting.
- Removed misleading “Live”, “available now”, “verified” and real-round claims from reachable preview UI.
- Exposed proof data as unverified service-reported data and made transaction controls visibly disabled.
- Improved Bingo grid semantics, hidden-card labels, chat dialog state, filter grouping and the horizontal-scroll cue on mobile Roulette.
- Added deterministic unit/E2E tests and moved Playwright from the Vite development server to the generated production build.
- Added a restrictive Nginx configuration and CI validation for it.

Remaining frontend limitations:

- FleetWallet connection can be previewed, but a real extension/network/signature flow is **NOT VERIFIED**.
- The Content Security Policy permits only the default API origin; any deployment override must update `connect-src`.
- Automated accessibility checks passed, but a full keyboard/screen-reader session with real extension UI is **NOT VERIFIED**.
- Firefox, Safari/WebKit and physical-device coverage are **NOT VERIFIED**.

## 4. Game-server findings and candidate fixes

The tested candidate in `audit/patches/gameserver.patch`:

- Places every non-read HTTP action, card/hand disclosure route and WebSocket behind a constant-time operator bearer boundary.
- Returns an explicit `real_money_enabled: false` capability and never exposes the operator credential to the browser.
- Adds explicit CORS origins, request-body/time limits and defensive response headers.
- Adds in-process transition locks, SQLite serialization/idempotency safeguards and private database permissions.
- Pins runtime dependencies, runs the production image as a non-root user and adds a healthcheck.
- Corrects the audit Dockerfile so tests are copied and run against the exact candidate image.

This is a kill switch, not player authentication. It deliberately makes the current browser wagering flows unusable.

Blocking game-server defects still present:

- **GS-01 Critical — no wallet-bound session:** a caller-supplied address is not proof of ownership. Implement a domain-, chain-, nonce- and expiry-bound signed challenge, single-use server nonce and route/round-scoped authorization.
- **GS-02 Critical — chain/database crash window:** some flows submit to Canopy before durable local state is recorded. Implement a transactional outbox/state machine with idempotency keys and restart reconciliation.
- **GS-03 Critical — weak inclusion test:** transaction inclusion is inferred from a recent hash window and does not prove successful execution or adequate finality. Verify the canonical receipt/result, error code, height and chosen confirmation depth.
- **GS-04 Critical — server-triggered settlement:** WebSocket behavior can initiate settlement, and there is no explicit close-before-reveal phase.
- **GS-05 High — process-local concurrency:** locks do not protect multiple workers/replicas. Use database transactions/advisory locks or a single authoritative state-transition worker.
- **GS-06 High — secrets at rest:** operator private key, seeds and admin token remain in SQLite. Move them to a secrets/KMS boundary and encrypt sensitive round material.
- **GS-07 High — payout accounting:** balance deltas are an unreliable global signal. Persist and verify transaction-specific events/receipts.

## 5. Canopy/plugin findings and candidate fixes

The tested candidate in `audit/patches/plugin.patch`:

- Restricts room opening, faucet/reward, coin/gem issuance and cosmetic minting to the configured administrator.
- Revalidates stateless authorization in `DeliverTx`, preventing a direct-delivery bypass of `CheckTx`.
- Requires exact Bingo card costs, positive payout weights and a fixed line pattern.
- Adds checked arithmetic around escrows, treasury credits, payouts and refunds.
- Correctly handles the treasury also being a participant/winner in Bingo, Roulette, Domino and Poker.
- Adds financial regression tests and fixes Python 3.13-compatible test-loop helpers.
- Corrects package discovery, console entry point and coverage source from the nonexistent `plugin` package to `contract`.

Blocking protocol defects still present:

- **BC-01 Critical — operator-known randomness:** `SHA256(seed)` commits a seed already known by the operator. Without a close phase, the operator can selectively settle/expire and bettors can adapt to mempool reveals. Use a stateful open → closed → reveal lifecycle and entropy the operator cannot control alone (for example player commitments plus finalized-chain randomness).
- **BC-02 Critical — unsigned game actions:** Domino moves and Poker actions are supplied in the operator settlement log. Replay proves legality, not that either player authorized those choices. Put signed, ordered actions or equivalent commitments on chain.
- **BC-03 Critical — Roulette insolvency:** maximum liabilities are not reserved at bet acceptance across concurrent rounds. Reject bets unless treasury reserves cover worst-case payout and lock that liability until settle/expiry.
- **BC-04 High — execution concurrency unproven:** if the FSM invokes deliveries concurrently, read-modify-write balance transitions can double spend. Confirm serialized consensus execution or add a protocol-safe concurrency boundary.
- **BC-05 High — unbounded/centralized economics:** faucet/reward/purchase minting needs quotas, idempotency, governance/multisig and an auditable payment source.
- **BC-06 High — resource bounds:** participant/action-log caps and stricter rake policy are required before adversarial public use.
- **BC-07 High — signer/network/nonce integration:** these properties depend on the surrounding Canopy FSM and were not proven by isolated plugin tests.

## 6. Security and abuse checklist

| Control | Result | Notes |
|---|---|---|
| Browser economic writes fail closed | PASS | Unit tests prove no `fetch` or wallet call occurs while paused |
| Public write/WebSocket server routes fail closed | PASS in candidate | Operator boundary regression-tested; not deployed |
| Exact integer amounts | PASS in frontend/plugin candidate | Unsafe, rounded and overflow cases rejected |
| Duplicate round settlement/join protections | PARTIAL | Local idempotency tests pass; cross-process and crash cases remain |
| CORS and browser security headers | PASS in candidate | Nginx syntax validated; live adoption not verified |
| Dependency vulnerability scan | PASS | npm: 0 known vulnerabilities; captured Python environment: 0 after pip update |
| Wallet ownership and replay protection | FAIL | Critical blocker GS-01 |
| Unbiased randomness and reveal ordering | FAIL | Critical blocker BC-01 |
| Durable chain/local reconciliation | FAIL | Critical blocker GS-02/GS-03 |
| Treasury solvency reservation | FAIL | Critical blocker BC-03 |
| Secret management/KMS | FAIL | High-risk plaintext operational secrets remain |
| Rate limiting and DoS controls | PARTIAL | Body/time caps added; distributed rate limiting and state-size caps absent |

## 7. Verification evidence

All reported passes are from actual executions:

| Suite/check | Result |
|---|---:|
| Frontend ESLint | PASS |
| Frontend TypeScript check | PASS |
| Frontend unit tests | 6/6 PASS |
| Vite production build | PASS |
| Playwright production-preview E2E | 9/9 PASS |
| Responsive viewport checks | 1920×1080, 1440×900, 1366×768, 768×1024, 390×844 PASS |
| Axe WCAG A/AA/2.1 AA scans | No automated violations on landing plus four preview tables |
| npm audit | 0 known vulnerabilities |
| Game-server isolated Docker tests | 203/203 PASS, `--network none` |
| Candidate runtime identity | UID 999 (non-root) |
| Canopy plugin tests | 177/177 PASS |
| Editable plugin packaging/import | PASS |
| Nginx configuration test | PASS with `nginx:1.29.1-alpine` |
| Patch whitespace checks | PASS |

Representative before/after desktop, mobile and Roulette captures are in `audit/screenshots/`.

The following are **NOT VERIFIED** and must not be inferred from the passing suites: a real FleetWallet transaction; a real Canopy receipt and payout; crash recovery between chain submission and persistence; reorg/finality handling; concurrent multi-worker behavior; load/soak behavior; external penetration testing; or legal/regulatory approval.

## 8. Deployment and rollback plan

No candidate was deployed. The live health endpoint still returned HTTP success after testing, and audit-only containers/data were removed.

Recommended sequence after blockers are implemented:

1. Reconcile and commit the dirty Canopy production checkout; build every image from a reviewed commit and record its digest/SBOM.
2. Create a dedicated test chain with valueless tokens and dedicated keys. Never test the remaining protocol work with real balances.
3. Apply `plugin.patch` to `canopy@cd4cd495` and `gameserver.patch` to `canasino-gameserver@e842785`; resolve only explicit conflicts and rerun all suites.
4. Add wallet challenge/replay, close/reveal, receipt reconciliation and liability-reservation integration tests.
5. Back up the database and plugin state, record hashes and rehearse restore.
6. Deploy the plugin first to the test chain, then the game-server with `WAGERING_PAUSED=true`, then the static frontend.
7. Run smoke, negative-auth, restart/reconcile and test-token settlement scenarios. Keep the pause if any assertion fails.
8. Enable wagering only through a separately reviewed configuration change with monitoring and an immediate kill switch.

Rollback must restore the prior immutable image digests and the matching database/plugin snapshot together; rolling back only code after state-schema changes is unsafe.

## 9. Prioritized remediation backlog

Release gates, in order:

1. Wallet challenge/session binding and replay/idempotency protection.
2. Explicit betting close plus unbiased multi-party/finalized-chain randomness.
3. Durable submission outbox, successful receipt verification and restart reconciliation.
4. Signed/committed Domino and Poker player actions.
5. Roulette worst-case liability reservation and treasury invariant tests across rounds.
6. Consensus/FSM serialization proof and multi-worker race tests.
7. KMS/secrets migration, rotation procedure and removal of plaintext seeds/keys.
8. Participant/action/state-size caps, distributed rate limiting and conservative rake limits.
9. Reproducible immutable deployment, SBOM/signing and drift detection.
10. Independent security review, test-chain soak and jurisdiction-specific compliance review.

Acceptance requires executable tests for each item, not documentation alone.

## 10. Final release checklist and verdict

- [x] Preview copy is truthful and wagering controls are disabled.
- [x] Frontend quality gates and responsive/accessibility E2E pass.
- [x] Game-server and plugin hardening candidates are reproducible as patches.
- [x] Candidate unit suites pass without touching live value.
- [x] Production services were not redeployed and remain healthy.
- [ ] Wallet ownership, nonce, expiry, domain and replay protections pass integration tests.
- [ ] Close/reveal randomness is unbiased and front-running/selective-abort resistant.
- [ ] Chain receipts, finality, crash recovery and idempotent reconciliation pass fault injection.
- [ ] All player game actions are cryptographically authorized.
- [ ] Treasury liabilities are reserved and solvency invariants pass concurrent-round tests.
- [ ] Secrets are rotated into an approved secrets boundary.
- [ ] Clean commits, immutable images, backups, rollback and monitoring are verified in a dedicated test environment.
- [ ] Independent review signs off on the resulting protocol.

**Verdict:** the current frontend may be published only as a clearly labelled read-only preview. The game-server and plugin patches reduce immediate risk but do not make the platform safe for real money. Keep wagering paused and do not deploy the cross-repository candidates to production until every unchecked release gate above is closed.

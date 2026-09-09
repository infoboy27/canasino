# Fair randomness protocol v2

Status: required before real-money activation; not yet enforceable by the
current Canopy plugin interface.

## Threat model

Committing only to a server-chosen seed proves that the operator did not change
that seed, but the operator still knew every outcome before accepting bets and
can selectively abandon an unfavorable reveal. That is not sufficient for
money play.

## Required lifecycle

1. `OPEN`: publish the operator-secret commitment and immutable economic rules.
2. `CLOSED`: reject all later joins/bets/actions and commit the close height.
3. `ENTROPY_AVAILABLE`: obtain an unpredictable value that did not exist before
   `CLOSED` and that the contract can independently authenticate.
4. `SETTLED`: derive `SHA256("CANASINO-RNG-V2" || operator_secret || entropy ||
   round_id)` and replay the game deterministically.
5. `EXPIRED`: if the operator withholds its secret, any account can trigger
   deterministic refunds plus an operator bond penalty.

## Consensus requirement

The entropy must be available to plugin execution as consensus-authenticated
data, such as a finalized historical block hash/VDF output fixed at close. The
current plugin deliver request exposes height but not a verifiable historical
block hash or randomness value. Supplying a hash in the operator's settlement
message would remain operator-controlled and is explicitly forbidden.

Repository inspection confirms Canopy computes the prior block hash and tracks
VDF iterations in its consensus header, but the current `PluginBeginRequest`
wire message contains only `height`. The compatible upstream change should add
the finalized previous-block hash (and, if selected as protocol entropy, the
verified VDF output/iteration commitment) as new protobuf fields. A round-close
transaction must then fix a future entropy height; settlement may consume only
the value delivered by the FSM for that exact height. The casino plugin must
never query an unauthenticated HTTP endpoint or accept this value in an
operator-signed settlement payload.

The alternative is participant commit/reveal recorded on-chain, with a defined
deadline and penalty for every missing reveal. This requires new transaction
messages and round state in the plugin schema.

Until one of those mechanisms is implemented and independently replay-tested,
`fairRandomnessV2` remains false and `realMoneyEnabled` remains false regardless
of other environment settings.

---

# Option A — concrete design (in progress)

Chosen mechanism: **consensus block-hash entropy, delivered FSM -> plugin,
folded over a window of finalized blocks fixed after bet close, VDF-ready.**

## A.1 Entropy source

Recommendation (expert call, requested by the owner): fold a *window* of
finalized predecessor block hashes rather than a single hash, and reserve a
field for a VDF output that real-money launch can turn on without a schema
break.

Rationale:

- A single block hash lets the proposer at the entropy height see the pending
  value and skip its slot to grind for a better one. On a small testnet with
  few validators this is a real bias vector.
- A full VDF from day one is the strongest answer, but exposing and verifying
  the consensus VDF iteration/output across the plugin boundary and getting the
  timing parameters right is a large, error-prone addition that should not
  block the valueless E2E.
- Folding `ENTROPY_WINDOW` consecutive finalized hashes raises the grind cost
  multiplicatively: an attacker must control an unbroken run of proposers
  across the whole window, and a single honest proposer in it kills the grind.
  It is trivial to implement because the plugin already persists every
  finalized predecessor hash by height in `BeginBlock`.

## A.2 FSM -> plugin delivery (Canopy Go side)

`PluginBeginRequest` gains:

```
message PluginBeginRequest {
  uint64 height          = 1;
  bytes  last_block_hash  = 2; // finalized hash of block height-1, loaded by the FSM
  bytes  vdf_output       = 3; // reserved; empty until real-money hardening
}
```

- The FSM (`fsm/automatic.go` `BeginBlock`) loads block `height-1` from its own
  committed store and sets `last_block_hash` from `BlockHeader.Hash`. It never
  reads this from a request field, an operator payload, or an RPC.
- `vdf_output` stays empty in this phase. When populated later it is the
  consensus-verified VDF output for `height-1`; the plugin folds it in if
  present (see A.4), so turning it on is forwards-compatible.
- Height 0 (unit-test/default request) and height 1 (no predecessor) carry no
  hash and are accepted as-is. From height 2 on, a missing or wrong-length
  hash makes `BeginBlock` fail closed.

## A.3 Plugin entropy ledger

`BeginBlock` in the contract persists the FSM-authenticated predecessor hash:

- key: `CONSENSUS_ENTROPY_PREFIX (0x76 / 118) || be64(height-1)`
- value: the 32-byte hash (plus `vdf_output` when non-empty, length-prefixed)
- retention: prune entries older than `CONSENSUS_ENTROPY_RETENTION = 4096`
  blocks, which comfortably covers `ENTROPY_DELAY + ENTROPY_WINDOW +
  SETTLE_GRACE`.

The plugin only ever consumes values from this ledger, keyed by an exact
height range that a round-close transaction fixed in the past.

## A.4 Round lifecycle (per game: Bingo, Roulette, Domino, Poker)

Protocol constants (plugin):

| Constant | Value | Meaning |
|---|---:|---|
| `ENTROPY_DELAY_BLOCKS` | 8 | close_height -> first entropy block |
| `ENTROPY_WINDOW_BLOCKS` | 8 | number of finalized hashes folded |
| `SETTLE_GRACE_BLOCKS` | 720 | entropy_height -> expire deadline |

States: `OPEN -> CLOSED -> SETTLED`, or `OPEN/CLOSED -> EXPIRED`.

1. **`OPEN`** — `MessageOpen<Game>` unchanged except:
   - `commitment` stays `sha256(operator_secret)`.
   - new field `operator_bond`: the operator escrows this amount into a bond
     sub-account (`<game>_bond_address(round_id)`) atomically with open.
     Open fails if the operator can't fund it.
2. **`CLOSED`** — new `MessageClose<Game>(operator_address, round_id)`:
   - only the operator; round must be `OPEN`.
   - sets `status = CLOSED`, `close_height = H`,
     `entropy_start = H + ENTROPY_DELAY_BLOCKS`,
     `entropy_end = entropy_start + ENTROPY_WINDOW_BLOCKS - 1`.
   - all later `Join`/`Bet`/`RouletteBet` for the round are rejected
     (`status != OPEN`).
   - At `H`, none of the blocks `entropy_start..entropy_end` exist yet, so the
     entropy is not yet determined by anyone.
3. **`SETTLED`** — `MessageSettle<Game>` (reveals `operator_secret`, plus the
   move/action log for Domino/Poker) additionally requires:
   - round is `CLOSED`.
   - `current_height > entropy_end` (else `"entropy not yet available"`).
   - every hash for `entropy_start..entropy_end` is present in the entropy
     ledger (else fail closed).
   - `entropy = sha256("CANASINO-RNG-V2-ENTROPY" || h[entropy_start] || ... ||
     h[entropy_end] || vdf[entropy_start] || ... )` (vdf terms only when
     present).
   - `final_seed = sha256("CANASINO-RNG-V2" || operator_secret || entropy ||
     round_id)`.
   - the game replays from `final_seed` everywhere it currently uses the raw
     revealed seed (`draw_order`, `generate_cards`, `spin_number`, the Domino
     deal, the Poker deal).
   - on success the operator bond is returned to the operator.
4. **`EXPIRED`** — `MessageExpire<Game>` (callable by anyone), deadline is
   `max(opened_height + ROOM_EXPIRY_BLOCKS, entropy_end + SETTLE_GRACE_BLOCKS)`
   so a never-closed round still expires:
   - refund every stake exactly from its record (unchanged logic).
   - the operator bond is transferred to the treasury (operator deterrent).
     Optional caller incentive (a fixed slice of the bond to `caller_address`)
     is noted but off by default to preserve the current "caller receives
     nothing" convention.

## A.5 Trust properties

- The operator commits `operator_secret` before any bet and cannot change it.
- The entropy is a deterministic function of finalized consensus blocks that
  did not exist when bets closed; the operator cannot choose or predict it and
  cannot selectively abandon an unfavorable reveal without losing the bond and
  triggering deterministic refunds.
- The plugin authenticates the entropy itself (its own FSM-fed ledger); it
  never accepts a hash from the settlement message or any HTTP endpoint.
- Every outcome is replayable off-chain from
  `(operator_secret, round_id, close_height)` plus public chain data.

## A.6 Work breakdown

1. Finalize A.2 in Go: proto field(s), regenerate `lib/plugin.pb.go` with the
   pinned toolchain, `fsm/automatic.go`, a Go test for the load path.
2. Regenerate `plugin/python/contract/proto/*` with the pinned toolchain
   (minimal diff, no unrelated churn).
3. A.3 entropy ledger + read helper + prune, with tests.
4. Per game x4: `operator_bond` on open, `MessageClose<Game>` + state fields,
   settle rewrite to consume ledger entropy, expire rewrite to slash bond.
5. Replay test: open -> join/bet -> close -> advance blocks -> settle, and
   independently recompute `final_seed` and the outcome.
6. Container verification (`--network none`): plugin suite + Go suite green.
7. Flip nothing: `fairRandomnessV2` stays false until the game-server consumes
   the new lifecycle and the wallet->bet->payout E2E passes on the isolated
   node.

## A.7 Status

Done and verified in containers (16-core local Docker; no host toolchain):

- **A.2** — `PluginBeginRequest.last_block_hash` (field 2) + `vdf_output`
  (field 3, reserved/empty). `lib/plugin.pb.go` and
  `plugin/python/contract/proto/plugin_pb2.py` regenerated with the pinned
  toolchain (protoc 29.3 / protoc-gen-go v1.36.6 / grpcio-tools 1.60.x),
  minimal diff. `BeginBlock` takes `lastBlockHash []byte`; `ApplyBlock` passes
  the applying block header's `LastBlockHash` (same pattern as
  `EndBlock(proposerAddress)`) — no per-block indexer read. `go build ./...`,
  `go test ./fsm/ ./lib/` green; new `lib/plugin_test.go` round-trip test.
- **A.3** — entropy ledger in `contract.py`: `begin_block` persists
  `hash||vdf` keyed by predecessor height under prefix `0x76`, prunes beyond
  `CONSENSUS_ENTROPY_RETENTION=4096`, fails closed on a missing/short hash
  post-genesis. `_fold_consensus_entropy(start,end)` reads the window and folds
  `SHA256(RNG_V2_ENTROPY_DOMAIN || v[start] || ... || v[end])`, fails closed on
  any gap. `rng_v2_seed()` = `derive_seed(RNG_V2_SEED_DOMAIN, operator_secret,
  entropy, round_id)`. Plugin suite 182/182.

Not started:

- **A.4** — per-game `operator_bond` on open, `MessageClose<Game>` + round
  state fields, settle rewrite to consume ledger entropy, expire rewrite to
  slash the bond. Dispatch/config wiring. `tx.proto` regen.
- **A.5/A.6.5** — replay test.
- **A.6.6** — full container E2E on the isolated node.

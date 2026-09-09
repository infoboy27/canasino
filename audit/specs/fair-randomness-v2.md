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

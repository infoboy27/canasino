"""Valueless wallet -> roulette bet -> payout E2E for fair-randomness-v2.

Run only inside the internal ``canasino-valueless_valueless`` Docker network.
The operator key below is a public test fixture whose address is allowlisted
only by ``Dockerfile.a67-e2e``. Never fund or reuse it on another network.
"""

from __future__ import annotations

import hashlib
import json
import time

from blspy import BasicSchemeMPL

from gameserver import tx_pb2
from gameserver.chain import CanopyBridge, Key, ReceiptPending
from gameserver.roulette_rooms import RouletteManager


OPERATOR = Key(
    address="fa768c3cd0f8aa09e8572f298f6a2570eefbede3",
    public_key=(
        "99ae33746ecf0facb527647904f475534648909f6f027e57e96ea60fbdb38e15c"
        "88a8418c3b01e721cb7290e09cdf1fa"
    ),
    private_key="6e9445091107e31a73092040b7eb4b8ae624b52f408ed3425044a24970321940",
)
TREASURY = "4919006f0f09b382befcc08611052f6d62a5d36e"
BET_AMOUNT = 100_000


def deterministic_wallet(label: str, run_nonce: bytes) -> Key:
    seed = hashlib.sha256(b"CANASINO-A67-E2E-WALLET" + run_nonce + label.encode()).digest()
    private_key = BasicSchemeMPL.key_gen(seed)
    public_key = bytes(private_key.get_g1())
    return Key(
        address=hashlib.sha256(public_key).digest()[:20].hex(),
        public_key=public_key.hex(),
        private_key=bytes(private_key).hex(),
    )


def wait_receipt(bridge: CanopyBridge, tx_hash: str, signer: Key,
                 message_type: str, timeout: float = 180.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            return bridge.transaction_receipt(
                tx_hash, sender=signer.address, message_type=message_type,
            )
        except ReceiptPending:
            time.sleep(0.25)
    raise TimeoutError(f"{message_type} transaction {tx_hash} was not committed")


def submit_faucet(bridge: CanopyBridge, recipient: str, amount: int) -> str:
    message = tx_pb2.MessageFaucet(
        signer_address=OPERATOR.addr_bytes,
        recipient_address=bytes.fromhex(recipient),
        amount=amount,
    )
    return bridge.submit(OPERATOR, "faucet", message.SerializeToString())


def submit_bet(bridge: CanopyBridge, wallet: Key, round_id: bytes,
               bet_type: str, bet_number: int) -> str:
    message = tx_pb2.MessageRouletteBet(
        player_address=wallet.addr_bytes,
        round_id=round_id,
        bet_type=bet_type,
        bet_number=bet_number,
        amount=BET_AMOUNT,
    )
    return bridge.submit(wallet, "roulette_bet", message.SerializeToString())


def main() -> None:
    bridge = CanopyBridge(
        query_url="http://canopy:50002",
        admin_url="http://canopy:50003",
        plugin_url="http://canopy:50010",
        network_id=1,
        chain_id=1,
        finality_confirmations=1,
    )
    initial_height = bridge.height()
    run_nonce = f"{initial_height}:{time.time_ns()}".encode()
    wallets = {
        "red": deterministic_wallet("red", run_nonce),
        "black": deterministic_wallet("black", run_nonce),
        "zero": deterministic_wallet("zero", run_nonce),
    }

    # Batch the valueless mint transactions so the proof does not spend one
    # consensus block per setup account.
    funding = [
        (OPERATOR.address, 2_000_000),
        (TREASURY, 10_000_000),
        *((wallet.address, 500_000) for wallet in wallets.values()),
    ]
    funding_hashes = [submit_faucet(bridge, address, amount) for address, amount in funding]
    for tx_hash in funding_hashes:
        wait_receipt(bridge, tx_hash, OPERATOR, "faucet")

    assert bridge.account_balance(OPERATOR.address) >= 2_000_000
    assert bridge.account_balance(TREASURY) >= 10_000_000
    funded_balances = {
        name: bridge.account_balance(wallet.address) for name, wallet in wallets.items()
    }
    assert all(balance == 500_000 for balance in funded_balances.values())

    manager = RouletteManager(bridge, OPERATOR, operator_bond=1_000_000)
    round_state = manager.open_round(rake_bps=100)

    bet_specs = {
        "red": ("red", 0),
        "black": ("black", 0),
        "zero": ("straight", 0),
    }
    bet_hashes = {
        name: submit_bet(bridge, wallets[name], round_state.round_id, *spec)
        for name, spec in bet_specs.items()
    }
    for name, tx_hash in bet_hashes.items():
        wait_receipt(bridge, tx_hash, wallets[name], "roulette_bet")
        bet_type, bet_number = bet_specs[name]
        manager.register_external_bet(
            round_state.id_hex, wallets[name].address,
            bet_type, bet_number, BET_AMOUNT,
        )

    after_bet = {
        name: bridge.account_balance(wallet.address) for name, wallet in wallets.items()
    }
    assert all(after_bet[name] == funded_balances[name] - BET_AMOUNT for name in wallets)

    closed = manager.close_betting(round_state.id_hex)
    assert closed.close_tx_hash
    assert closed.close_height > 0
    assert closed.entropy_start == closed.close_height + 8
    assert closed.entropy_end == closed.close_height + 15

    height_before_wait = bridge.height()
    assert height_before_wait <= closed.entropy_end
    manager.prepare_outcome(round_state.id_hex, timeout=240.0)
    height_after_wait = bridge.height()
    assert height_after_wait >= closed.entropy_end + 1

    settled = manager.settle(round_state.id_hex)
    settle_receipt = bridge.transaction_receipt(
        settled["txHash"], sender=OPERATOR.address, message_type="settle_roulette",
    )
    assert settle_receipt["height"] > closed.entropy_end

    final_balances = {
        name: bridge.account_balance(wallet.address) for name, wallet in wallets.items()
    }
    if settled["spin"] == 0:
        expected_winner = "zero"
    else:
        expected_winner = settled["color"]
    payout_deltas = {
        name: final_balances[name] - after_bet[name] for name in wallets
    }
    failure_context = {
        "spin": settled["spin"],
        "expectedWinner": expected_winner,
        "payoutDeltas": payout_deltas,
        "managerPayouts": settled["payouts"],
        "closeHeight": closed.close_height,
        "entropyStart": closed.entropy_start,
        "entropyEnd": closed.entropy_end,
        "settleHeight": settle_receipt["height"],
    }
    assert final_balances[expected_winner] > after_bet[expected_winner], failure_context
    assert settled["payouts"][wallets[expected_winner].address] > 0, failure_context
    for name in wallets:
        if name != expected_winner:
            assert settled["payouts"][wallets[name].address] == 0, failure_context

    evidence = {
        "result": "PASS",
        "scope": "isolated-valueless-canopy",
        "initialHeight": initial_height,
        "roundId": round_state.id_hex,
        "wallets": {name: wallet.address for name, wallet in wallets.items()},
        "betTxHashes": bet_hashes,
        "closeTxHash": closed.close_tx_hash,
        "closeHeight": closed.close_height,
        "entropyStart": closed.entropy_start,
        "entropyEnd": closed.entropy_end,
        "heightBeforeEntropyWait": height_before_wait,
        "heightAfterEntropyWait": height_after_wait,
        "settleTxHash": settled["txHash"],
        "settleHeight": settle_receipt["height"],
        "spin": settled["spin"],
        "winner": expected_winner,
        "payoutDeltas": payout_deltas,
        "fundedBalances": funded_balances,
        "afterBetBalances": after_bet,
        "finalBalances": final_balances,
    }
    print(json.dumps(evidence, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

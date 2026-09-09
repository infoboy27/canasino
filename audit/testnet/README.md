# Isolated valueless Canopy testnet

This stack is the only approved target for destructive or value-moving E2E
tests. It must never mount `/home/ubuntu/canasino/canopy-data`, reuse the live
container, or publish its admin/query/plugin ports beyond `127.0.0.1`.

Safety properties:

- immutable locally-built `canopy-python` image digest containing the A.4
  Canopy/plugin candidate;
- a new named data volume, never the production data directory;
- an internal Docker network with no external peers;
- no host-published ports; E2E clients must join the internal Docker network;
- test-only 250 ms consensus phase timers (about two seconds per block);
- no automatic restart and no additional Linux capabilities.

Before a write test, record the container image ID, volume mount source,
network `Internal=true`, genesis/network IDs, initial account balances, and
the exact disposable test addresses. Stop immediately if any production path,
production address, or non-test peer appears.

Starting this compose file does not by itself authorize real-value tests.
Tokens created inside this isolated data volume are test fixtures only.

`bootstrap.sh` creates a disposable validator with the public test-only
password `valueless-test-only` and enables the Python plugin. This password is
never acceptable outside this isolated stack.

Run the A.6.7 wallet-to-payout proof from the repository root after building
the game-server audit image:

```sh
docker run --rm --network canasino-valueless_valueless \
  -v ./audit/testnet/e2e_wallet_bet_payout.py:/e2e.py:ro \
  canasino-gameserver-audit:a67 python /e2e.py
```

The script uses only locally generated valueless accounts, requires an actual
`MessageCloseRoulette` receipt, waits through `entropy_end + 1`, and verifies
the exact settlement receipt and winning wallet balance increase.

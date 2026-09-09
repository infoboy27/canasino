# Isolated valueless Canopy testnet

This stack is the only approved target for destructive or value-moving E2E
tests. It must never mount `/home/ubuntu/canasino/canopy-data`, reuse the live
container, or publish its admin/query/plugin ports beyond `127.0.0.1`.

Safety properties:

- immutable `canopy-python` image digest captured from the test host;
- a new named data volume, never the production data directory;
- an internal Docker network with no external peers;
- no host-published ports; E2E clients must join the internal Docker network;
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

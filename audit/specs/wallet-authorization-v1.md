# Wallet authorization protocol v1

Status: implemented and unit-tested in the frontend/game-server candidates; FleetWallet extension integration and real-chain E2E remain pending.

## Purpose

Prove control of a Canopy address and authorize exactly one off-chain operation. This grant never replaces the signed Canopy transaction required to move value.

## Challenge

`POST /auth/challenges` accepts `address`, `action`, `resource` and the SHA-256 hash of the canonical JSON operation payload. The server generates a UUID, a 256-bit nonce, issue/expiry timestamps and returns canonical UTF-8 JSON plus its hex encoding.

The signed document binds:

- protocol version `CANASINO-AUTH-V1`;
- expected domain;
- Canopy chain and network IDs;
- wallet address;
- action and resource;
- exact payload hash;
- unique challenge ID and nonce;
- issue and expiry time.

Only five outstanding challenges per address per minute are accepted. Challenges expire after 120 seconds.

## Wallet method

FleetWallet must expose:

```json
{
  "method": "canopy_signMessage",
  "params": [{ "messageHex": "<canonical UTF-8 bytes as hex>", "display": {} }]
}
```

It must display the domain, action and resource to the user and return:

```json
{ "publicKey": "<48-byte BLS public key hex>", "signature": "<96-byte BLS Basic signature hex>" }
```

The extension must sign the exact decoded `messageHex` bytes with Canopy's BLS12-381 Basic scheme. It must not accept a display object that differs from the signed bytes.

## Verification and grant

`POST /auth/verify` derives `SHA256(publicKey)[:20]`, compares that address to the challenge, verifies the BLS signature and atomically consumes the challenge. It returns a cryptographically random opaque grant. Only the SHA-256 token hash is stored.

The grant expires after 90 seconds and is atomically consumed only when address, action, resource and canonical payload hash all match. Failed mismatch attempts do not consume a valid grant. Successful grants cannot be replayed.

Wallet-funded registration bodies include a UUID `operation_id` and the normalized 32-byte `tx_hash`. After a grant is consumed, the server persists an operation state machine (`AUTHORIZED` → `PENDING` → `FINALIZED` → `APPLIED`, or terminal `REJECTED`). It accepts the registration only after `/v1/query/tx-by-hash` proves the exact signer, transaction type, network, chain, game fields and required confirmation depth. The same transaction hash cannot back another operation.

## Required integration tests before activation

- Real FleetWallet produces a signature accepted by the Python verifier.
- Modified domain, network, action, resource, amount, round or operation ID fails.
- Wallet B cannot complete Wallet A's challenge.
- Concurrent verify/consume attempts yield exactly one success.
- Expired challenges and grants fail across a process restart.
- A valid off-chain grant without a successful, finalized matching Canopy transaction cannot register a wager.

import { jsonGet, jsonSessionGet } from './api.js'
import { walletAuthorizedPost } from './auth.js'
import { moveSessionAuth } from './session.js'

// What this game service can do (e.g. whether the devnet house rival is available).
export const getCapabilities = () => jsonGet('/capabilities')

// Server-opened tables: the service returns the joinable one, opening it if needed. No
// operator credential is involved.
export const lobbyBingo = (roomId) => jsonGet(`/lobby/${'bingo'}/${encodeURIComponent(roomId)}`, { timeoutMs: 45000 })
export const lobbyRoulette = () => jsonGet('/lobby/roulette', { timeoutMs: 45000 })

// Opening a table / seating the house waits on a chain tx (~10 s on devnet).
const CHAIN_TX_TIMEOUT_MS = 60000

const tableOp = (address) => ({ address: address.toLowerCase(), operation_id: globalThis.crypto.randomUUID() })

/** Open a heads-up table with one wallet signature. */
export function openTableWithWallet(game, account) {
  return walletAuthorizedPost({
    path: `/${game}/rounds`, account, action: `${game}_create`, resource: `${game}-tables`,
    payload: tableOp(account.address), timeoutMs: CHAIN_TX_TIMEOUT_MS,
  })
}

/** Devnet aid: seat the house as your opponent; it plays server-side. */
export function seatHouseRival(game, roundId, account) {
  return walletAuthorizedPost({
    path: `/${game}/rounds/${encodeURIComponent(roundId)}/bot`, account, action: `${game}_bot`,
    resource: `${game}-bot:${roundId}`, payload: tableOp(account.address), timeoutMs: CHAIN_TX_TIMEOUT_MS,
  })
}

/**
 * Read your own private state with the table session. Falls back to the operator
 * bearer only on a local stack that has one (VITE_OPERATOR_TOKEN).
 */
export async function readPrivate(path, roundId, address, read, extra = {}) {
  const payload = { address: address.toLowerCase(), round_id: roundId, read, ...extra }
  const auth = await moveSessionAuth(roundId, payload)
  if (auth) return jsonSessionGet(path, auth.sessionId, auth.mac)
  return jsonGet(path, { operator: true })
}

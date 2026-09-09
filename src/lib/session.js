// Per-table move sessions: one FleetWallet signature when you sit down
// authorizes every move at that table for a bounded window, instead of a
// wallet prompt + challenge/verify round trip on every tile or bet.
//
// The wallet grant binds a server-issued secret to {address, round, scope,
// expiry}; each later move is MAC'd with that secret (HMAC-SHA256 over the
// canonical request body, which still includes the sequence and prior-state
// hash). If a session can't be opened, or expires, moves transparently fall
// back to the per-move grant path.

import { jsonWalletPost } from './api.js'
import { canonicalBytes, requestWalletGrant } from './auth.js'

const SCOPE = { domino: 'domino_move', poker: 'poker_action' }
const SESSION_TTL_SECONDS = 1800

const sessions = new Map() // roundId -> { id, key: CryptoKey, expiresAt }

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g) || [], (byte) => parseInt(byte, 16))
}

function live(entry) {
  return Boolean(entry && entry.expiresAt * 1000 > Date.now())
}

/**
 * Open a move session for a table. Best-effort: returns false (and moves keep
 * using per-move grants) if the wallet or game service declines.
 */
export async function openMoveSession(game, roundId, account) {
  const scope = SCOPE[game]
  if (!scope || !account?.address || sessions.has(roundId)) return live(sessions.get(roundId))
  try {
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
    const payload = { address: account.address, round_id: roundId, scope, expires_at: expiresAt }
    const grant = await requestWalletGrant({
      account, action: scope, resource: `move-session:${roundId}`, payload,
    })
    const res = await jsonWalletPost(`/${game}/rounds/${encodeURIComponent(roundId)}/session`, payload, grant)
    if (!/^[a-f0-9]{64}$/i.test(res?.sessionSecret || '') || typeof res?.sessionId !== 'string') {
      throw new Error('The game service returned an invalid session.')
    }
    const key = await crypto.subtle.importKey(
      'raw', hexToBytes(res.sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    sessions.set(roundId, { id: res.sessionId, key, expiresAt: Number(res.expiresAt) || expiresAt })
    return true
  } catch {
    return false
  }
}

export function hasMoveSession(roundId) {
  return live(sessions.get(roundId))
}

/**
 * Authenticator for one move, or null if there is no live session for the
 * round (caller then uses the per-move grant path).
 */
export async function moveSessionAuth(roundId, payload) {
  const entry = sessions.get(roundId)
  if (!live(entry)) return null
  const sig = await crypto.subtle.sign('HMAC', entry.key, canonicalBytes(payload))
  const mac = Array.from(new Uint8Array(sig), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { sessionId: entry.id, mac }
}

export function clearMoveSession(roundId) {
  sessions.delete(roundId)
}

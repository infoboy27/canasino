import { requireWagering } from './safety.js'

export const API_BASE = (import.meta.env?.VITE_BINGO_API_URL || 'https://bingo.jfmcss.com').replace(/\/$/, '')

export function statusMessage(status) {
  if (status === 401 || status === 403) return 'This operation requires verified wallet authorization. Wagering is currently paused.'
  if (status === 404) return 'This game or round is not available. Return to the lobby.'
  if (status === 409) return 'The round has changed. Refresh its status before continuing.'
  if (status === 425) return 'The transaction needs more confirmations. Check its status before retrying.'
  if (status === 429) return 'The game service is busy. Wait a moment before trying again.'
  if (status === 422) return 'The request was not accepted. Check the table and input.'
  return 'The game service is unavailable. Please try again later.'
}

export async function jsonGet(path, { timeoutMs = 10000, operator = false } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // The /card and /hand reveals are operator-gated (the address param is
  // trusted). In a production build there is no browser operator token, so
  // these stay 401 for end users; a local valueless stack sets VITE_OPERATOR_TOKEN.
  const headers = operator && OPERATOR_TOKEN ? { Authorization: `Bearer ${OPERATOR_TOKEN}` } : undefined
  try {
    const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers })
    if (!response.ok) {
      const error = Object.assign(new Error(statusMessage(response.status)), { status: response.status })
      throw error
    }
    try { return await response.json() } catch { throw new Error('The game service returned an invalid response.') }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The game service timed out. Please try again.', { cause: error })
    if (error instanceof TypeError) throw new Error('Could not reach the game service. Check your connection.', { cause: error })
    throw error
  } finally { clearTimeout(timer) }
}

// On-chain available balance (uCNPY). Used to fail an entry before the wallet
// signs a transaction that would be rejected on-chain for insufficient funds
// (which otherwise surfaces only as a never-resolving "needs confirmations").
export async function playerAvailable(address) {
  const w = await jsonGet(`/players/${encodeURIComponent(address)}/wallet`)
  const available = Number(w?.available)
  return Number.isFinite(available) ? available : null
}

export async function assertCanAfford(address, needed, label = 'this entry') {
  const available = await playerAvailable(address)
  if (available !== null && available < needed) {
    const short = ((needed - available) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })
    throw new Error(`Not enough CNPY for ${label}: short ${short} CNPY. Fund this wallet and try again.`)
  }
}

const PUBLIC_POSTS = new Set(['/auth/challenges', '/auth/verify'])

export async function jsonPublicPost(path, body, { timeoutMs = 10000 } = {}) {
  if (!PUBLIC_POSTS.has(path)) throw new Error('Public POST route is not allowlisted.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST', signal: controller.signal, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) throw Object.assign(new Error(statusMessage(response.status)), { status: response.status })
    try { return await response.json() } catch { throw new Error('The game service returned an invalid response.') }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The game service timed out. Please try again.', { cause: error })
    if (error instanceof TypeError) throw new Error('Could not reach the game service. Check your connection.', { cause: error })
    throw error
  } finally { clearTimeout(timer) }
}

const WALLET_POST = /^(?:\/(?:rounds\/[a-f0-9]{16}|(?:roulette|domino|poker)\/rounds\/[a-f0-9]{16})\/register|\/domino\/rounds\/[a-f0-9]{16}\/move|\/poker\/rounds\/[a-f0-9]{16}\/action)$/i

export async function jsonWalletPost(path, body, grant, { timeoutMs = 10000 } = {}) {
  requireWagering()
  if (!WALLET_POST.test(path) || typeof grant !== 'string' || grant.length < 32 || /\s/.test(grant)) {
    throw new Error('Invalid wallet-authorized operation.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST', signal: controller.signal, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Canasino-Wallet ${grant}` },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw Object.assign(new Error(statusMessage(response.status)), { status: response.status })
    try { return await response.json() } catch { throw new Error('The game service returned an invalid response.') }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The game service timed out. Check operation history before retrying.', { cause: error })
    if (error instanceof TypeError) throw new Error('Could not reach the game service. Check operation history before retrying.', { cause: error })
    throw error
  } finally { clearTimeout(timer) }
}

// Operator-scoped writes (round open/settle, custodial domino/poker join). In a
// production build this is a hard stub -- the backend's OperatorBoundary would
// reject an unauthenticated browser anyway, and the operator bearer must never
// ship to end users. A local valueless stack sets VITE_WAGERING_ENABLED and
// VITE_OPERATOR_TOKEN in .env.local to drive the full lifecycle from the
// browser against the isolated Canopy node.
const OPERATOR_TOKEN = String(import.meta.env?.VITE_OPERATOR_TOKEN ?? '')

// A local valueless stack with an operator token can seat a custodial
// "practice opponent" so heads-up games (Domino/Poker) are playable solo.
// This is impossible in a production build -- no operator token ships -- and
// is additionally opt-in via VITE_ALLOW_PRACTICE_OPPONENT.
export const PRACTICE_OPPONENT =
  Boolean(OPERATOR_TOKEN) &&
  ['1', 'true'].includes(String(import.meta.env?.VITE_ALLOW_PRACTICE_OPPONENT ?? '').toLowerCase())

/**
 * @returns {Promise<{roundId?: string, round_id?: string, rakeBps?: number, minBet?: number, maxBet?: number, settled?: object}>}
 */
export async function jsonPost(path, body = {}) {
  requireWagering()
  if (!OPERATOR_TOKEN) throw new Error('Verified wallet sessions are not implemented')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST', signal: controller.signal, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPERATOR_TOKEN}` },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw Object.assign(new Error(statusMessage(response.status)), { status: response.status })
    try { return await response.json() } catch { throw new Error('The game service returned an invalid response.') }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The game service timed out. Please try again.', { cause: error })
    if (error instanceof TypeError) throw new Error('Could not reach the game service. Check your connection.', { cause: error })
    throw error
  } finally { clearTimeout(timer) }
}

export function websocket(path) {
  requireWagering()
  return new WebSocket(`${API_BASE.replace(/^http/, 'ws')}${path}`)
}

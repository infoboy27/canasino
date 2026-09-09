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

export async function jsonGet(path, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal, credentials: 'omit', cache: 'no-store' })
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

/**
 * Legacy write response shape, retained for review of the disabled game flows.
 * @returns {Promise<{roundId?: string, round_id?: string, rakeBps?: number, minBet?: number, maxBet?: number, settled?: object}>}
 */
export async function jsonPost(_path, _body = {}) {
  // The current backend trusts public addresses for player actions. Do not
  // send privileged credentials to the browser or silently retry writes.
  requireWagering()
  throw new Error('Verified wallet sessions are not implemented')
}

export function websocket(path) {
  requireWagering()
  return new WebSocket(`${API_BASE.replace(/^http/, 'ws')}${path}`)
}

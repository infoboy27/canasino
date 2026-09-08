export const API_BASE = import.meta.env.VITE_BINGO_API_URL || 'https://bingo.jfmcss.com'

// Mirrors bingo.js's friendlyStatusMessage/apiError -- the same status codes
// mean the same things across both games since they share one game server.
function friendlyStatusMessage(status) {
  if (status === 429) return 'The wheel is busy with pending rounds right now. Try again in a moment.'
  if (status === 422) return 'That bet was not accepted by the game server. Check the amount and try again.'
  if (status >= 500) return 'The game server is having trouble right now. Try again in a moment.'
  return null
}

function apiError(method, path, status) {
  const err = new Error(friendlyStatusMessage(status) || `${method} ${path} -> ${status}`)
  err.status = status
  return err
}

async function jsonGet(path) {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) throw apiError('GET', path, response.status)
  return response.json()
}

async function jsonPost(path, body = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw apiError('POST', path, response.status)
  return response.json()
}

export function openRouletteRound() {
  return jsonPost('/roulette/rounds')
}

export function getRouletteRoundInfo(roundId) {
  return jsonGet(`/roulette/rounds/${roundId}/info`)
}

export function registerRouletteBet(roundId, address, betType, betNumber, amount) {
  return jsonPost(`/roulette/rounds/${roundId}/register`, {
    address,
    bet_type: betType,
    bet_number: betNumber,
    amount,
  })
}

export function getRouletteProof(roundId) {
  return jsonGet(`/roulette/rounds/${roundId}/proof`)
}

function websocket(path) {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  return new WebSocket(`${wsBase}${path}`)
}

export function openRouletteSocket(roundId) {
  return websocket(`/ws/roulette/${roundId}`)
}

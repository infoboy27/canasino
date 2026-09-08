export const API_BASE = import.meta.env.VITE_BINGO_API_URL || 'https://bingo.jfmcss.com'

function friendlyStatusMessage(status) {
  if (status === 429) return 'Too many tables open right now. Try again in a moment.'
  if (status === 422) return 'That move was not accepted. Refresh the table and try again.'
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

async function jsonPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw apiError('POST', path, response.status)
  return response.json()
}

export function openDominoRound() {
  return jsonPost('/domino/rounds')
}

export function joinDominoTable(roundId) {
  return jsonPost(`/domino/rounds/${roundId}/join`)
}

export function registerDominoJoin(roundId, address) {
  return jsonPost(`/domino/rounds/${roundId}/register`, { address })
}

export function getDominoRoundInfo(roundId) {
  return jsonGet(`/domino/rounds/${roundId}/info`)
}

export function getDominoRound(roundId) {
  return jsonGet(`/domino/rounds/${roundId}`)
}

export function getDominoHand(roundId, address) {
  return jsonGet(`/domino/rounds/${roundId}/hand?address=${encodeURIComponent(address)}`)
}

export function postDominoMove(roundId, address, action, tile, end) {
  return jsonPost(`/domino/rounds/${roundId}/move`, { address, action, tile: tile || null, end: end || null })
}

export function getDominoProof(roundId) {
  return jsonGet(`/domino/rounds/${roundId}/proof`)
}

function websocket(path) {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  return new WebSocket(`${wsBase}${path}`)
}

export function openDominoSocket(roundId) {
  return websocket(`/ws/domino/${roundId}`)
}

export const API_BASE = import.meta.env.VITE_BINGO_API_URL || 'https://bingo.jfmcss.com'

function friendlyStatusMessage(status) {
  if (status === 429) return 'Too many tables open right now. Try again in a moment.'
  if (status === 422) return 'That action was not accepted. Refresh the table and try again.'
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

export function openPokerRound() {
  return jsonPost('/poker/rounds')
}

export function joinPokerTable(roundId) {
  return jsonPost(`/poker/rounds/${roundId}/join`)
}

export function registerPokerJoin(roundId, address) {
  return jsonPost(`/poker/rounds/${roundId}/register`, { address })
}

export function getPokerRoundInfo(roundId) {
  return jsonGet(`/poker/rounds/${roundId}/info`)
}

export function getPokerRound(roundId) {
  return jsonGet(`/poker/rounds/${roundId}`)
}

export function getPokerHand(roundId, address) {
  return jsonGet(`/poker/rounds/${roundId}/hand?address=${encodeURIComponent(address)}`)
}

export function postPokerAction(roundId, address, action, amount = 0) {
  return jsonPost(`/poker/rounds/${roundId}/action`, { address, action, amount })
}

export function getPokerProof(roundId) {
  return jsonGet(`/poker/rounds/${roundId}/proof`)
}

function websocket(path) {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  return new WebSocket(`${wsBase}${path}`)
}

export function openPokerSocket(roundId) {
  return websocket(`/ws/poker/${roundId}`)
}

export const API_BASE = import.meta.env.VITE_BINGO_API_URL || 'https://bingo.jfmcss.com'

// Human-readable messages for the status codes a player can actually hit --
// a raw "POST /rounds -> 429" is a debug string, not something to show
// someone who just wants to play.
function friendlyStatusMessage(status) {
  if (status === 429) return 'This table is full of pending games right now. Try another room, or wait a moment and retry.'
  if (status === 422) return 'That request was not accepted by the game server. Try again from the lobby.'
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

export async function getRooms() {
  const rooms = await jsonGet('/rooms')
  return rooms.map((room) => ({
    id: room.id,
    name: room.name,
    emoji: room.emoji || '◆',
    entryFee: Number(room.entryFee ?? room.entry_fee ?? 0),
    capacity: Number(room.capacity ?? 0),
    difficulty: room.difficulty || 'Standard',
    advertisedPrize: Number(room.advertisedPrize ?? room.advertised_prize ?? 0),
    rakeBps: Number(room.rakeBps ?? room.rake_bps ?? 0),
  }))
}

export function createRound(room) {
  return jsonPost('/rounds', {
    room: room.id,
    entry_fee: room.entryFee,
    rake_bps: room.rakeBps,
  })
}

export function getRoundInfo(roundId) {
  return jsonGet(`/rounds/${roundId}/info`)
}

export function registerRound(roundId, address, numCards) {
  return jsonPost(`/rounds/${roundId}/register`, {
    address,
    num_cards: numCards,
  })
}

export function getCard(roundId, address, numCards) {
  return jsonGet(`/rounds/${roundId}/card?address=${encodeURIComponent(address)}&num_cards=${numCards}`)
}

export function getRoundProof(roundId) {
  return jsonGet(`/rounds/${roundId}/proof`)
}

export const CARD_COST_MULTIPLIER_BPS = {
  1: 10000,
  2: 18000,
  3: 25000,
  4: 32000,
}

export function entryCost(baseEntry, numCards) {
  const multiplier = CARD_COST_MULTIPLIER_BPS[numCards] || 10000
  return Math.round((Number(baseEntry) * multiplier) / 10000)
}

function websocket(path) {
  const wsBase = API_BASE.replace(/^http/, 'ws')
  return new WebSocket(`${wsBase}${path}`)
}

export function openRoundSocket(roundId) {
  return websocket(`/ws/rounds/${roundId}`)
}

export function openChatSocket(roundId) {
  return websocket(`/ws/rounds/${roundId}/chat`)
}

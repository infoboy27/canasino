import { jsonGet, jsonPost, websocket } from './api.js'
import { cardCost, wireAmount } from './amounts.js'
import { walletAuthorizedPost, walletOperation } from './auth.js'

export async function getRooms() {
  const rooms = await jsonGet('/rooms')
  if (!Array.isArray(rooms)) throw new Error('The game service returned an invalid room list.')
  return rooms.map((room) => {
    if (!room || typeof room !== 'object' || typeof room.id !== 'string' || !room.id) throw new Error('The game service returned an invalid room.')
    const rakeBps = wireAmount(room.rakeBps ?? room.rake_bps ?? 0)
    if (rakeBps > 10_000) throw new Error('The game service returned an invalid room rake.')
    return {
      id: room.id,
      name: typeof room.name === 'string' && room.name ? room.name : room.id,
      emoji: typeof room.emoji === 'string' ? room.emoji : '◆',
      entryFee: wireAmount(room.entryFee ?? room.entry_fee ?? 0),
      capacity: wireAmount(room.capacity ?? 0),
      difficulty: typeof room.difficulty === 'string' ? room.difficulty : 'Standard',
      advertisedPrize: wireAmount(room.advertisedPrize ?? room.advertised_prize ?? 0),
      rakeBps,
    }
  })
}

export function createRound(room) {
  return jsonPost('/rounds', {
    room: room.id,
    entry_fee: room.entryFee,
    rake_bps: room.rakeBps,
  })
}

export function getRoundInfo(roundId) {
  return jsonGet(`/rounds/${encodeURIComponent(roundId)}/info`)
}

export function registerRound(roundId, address, numCards, txHash) {
  const path = `/rounds/${encodeURIComponent(roundId)}/register`
  const payload = walletOperation(address, txHash, { num_cards: numCards })
  return walletAuthorizedPost({ path, account: { address }, action: 'join_room', resource: `round:${roundId}`, payload })
}

export function getCard(roundId, address, numCards) {
  return jsonGet(`/rounds/${encodeURIComponent(roundId)}/card?address=${encodeURIComponent(address)}&num_cards=${numCards}`, { operator: true })
}

export function getRoundProof(roundId) {
  return jsonGet(`/rounds/${encodeURIComponent(roundId)}/proof`)
}

export const CARD_COST_MULTIPLIER_BPS = {
  1: 10000,
  2: 18000,
  3: 25000,
  4: 32000,
}

export function entryCost(baseEntry, numCards) {
  return cardCost(baseEntry, numCards)
}

export function openRoundSocket(roundId) {
  return websocket(`/ws/rounds/${encodeURIComponent(roundId)}`)
}

export function openChatSocket(roundId) {
  return websocket(`/ws/rounds/${encodeURIComponent(roundId)}/chat`)
}

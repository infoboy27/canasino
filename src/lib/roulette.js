import { jsonGet, jsonPost, websocket } from './api.js'
import { walletAuthorizedPost, walletOperation } from './auth.js'

export function openRouletteRound() {
  return jsonPost('/roulette/rounds')
}

export function getRouletteRoundInfo(roundId) {
  return jsonGet(`/roulette/rounds/${encodeURIComponent(roundId)}/info`)
}

export function registerRouletteBet(roundId, address, betType, betNumber, amount, txHash) {
  const path = `/roulette/rounds/${encodeURIComponent(roundId)}/register`
  const payload = walletOperation(address, txHash, { bet_type: betType, bet_number: betNumber, amount })
  return walletAuthorizedPost({ path, account: { address }, action: 'roulette_bet', resource: `roulette-round:${roundId}`, payload })
}

export function getRouletteProof(roundId) {
  return jsonGet(`/roulette/rounds/${encodeURIComponent(roundId)}/proof`)
}

export function openRouletteSocket(roundId) {
  return websocket(`/ws/roulette/${encodeURIComponent(roundId)}`)
}

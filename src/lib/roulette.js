import { jsonGet, jsonPost, websocket } from './api.js'

export function openRouletteRound() {
  return jsonPost('/roulette/rounds')
}

export function getRouletteRoundInfo(roundId) {
  return jsonGet(`/roulette/rounds/${encodeURIComponent(roundId)}/info`)
}

export function registerRouletteBet(roundId, address, betType, betNumber, amount) {
  return jsonPost(`/roulette/rounds/${encodeURIComponent(roundId)}/register`, {
    address,
    bet_type: betType,
    bet_number: betNumber,
    amount,
  })
}

export function getRouletteProof(roundId) {
  return jsonGet(`/roulette/rounds/${encodeURIComponent(roundId)}/proof`)
}

export function openRouletteSocket(roundId) {
  return websocket(`/ws/roulette/${encodeURIComponent(roundId)}`)
}

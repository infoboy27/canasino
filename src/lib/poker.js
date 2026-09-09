import { jsonGet, jsonPost, websocket } from './api.js'
import { walletAuthorizedPost, walletOperation } from './auth.js'

export function openPokerRound() {
  return jsonPost('/poker/rounds')
}

export function joinPokerTable(roundId) {
  return jsonPost(`/poker/rounds/${encodeURIComponent(roundId)}/join`)
}

export function registerPokerJoin(roundId, address, txHash) {
  const path = `/poker/rounds/${encodeURIComponent(roundId)}/register`
  const payload = walletOperation(address, txHash)
  return walletAuthorizedPost({ path, account: { address }, action: 'join_poker', resource: `poker-round:${roundId}`, payload })
}

export function getPokerRoundInfo(roundId) {
  return jsonGet(`/poker/rounds/${encodeURIComponent(roundId)}/info`)
}

export function getPokerRound(roundId) {
  return jsonGet(`/poker/rounds/${encodeURIComponent(roundId)}`)
}

export function getPokerHand(roundId, address) {
  return jsonGet(`/poker/rounds/${encodeURIComponent(roundId)}/hand?address=${encodeURIComponent(address)}`)
}

export function postPokerAction(roundId, address, action, amount = 0) {
  return jsonPost(`/poker/rounds/${encodeURIComponent(roundId)}/action`, { address, action, amount })
}

export function getPokerProof(roundId) {
  return jsonGet(`/poker/rounds/${encodeURIComponent(roundId)}/proof`)
}

export function openPokerSocket(roundId) {
  return websocket(`/ws/poker/${encodeURIComponent(roundId)}`)
}

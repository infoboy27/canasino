import { jsonGet, jsonPost, websocket } from './api.js'
import { walletAction, walletAuthorizedPost, walletOperation } from './auth.js'

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

export function postPokerAction(roundId, address, actionContext, action, amount = 0) {
  const path = `/poker/rounds/${encodeURIComponent(roundId)}/action`
  const payload = walletAction(address, actionContext, { action, amount })
  return walletAuthorizedPost({
    path, account: { address }, action: 'poker_action',
    resource: `poker-action:${roundId}:${payload.sequence}`, payload,
  })
}

export function getPokerProof(roundId) {
  return jsonGet(`/poker/rounds/${encodeURIComponent(roundId)}/proof`)
}

export function openPokerSocket(roundId) {
  return websocket(`/ws/poker/${encodeURIComponent(roundId)}`)
}

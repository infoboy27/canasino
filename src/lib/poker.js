import { jsonGet, jsonPost, jsonSessionPost, websocket } from './api.js'
import { walletAction, walletAuthorizedPost, walletOperation } from './auth.js'
import { moveSessionAuth } from './session.js'

export function openPokerRound() {
  return jsonPost('/poker/rounds')
}

// Seat a custodial "practice opponent" (operator-funded, operator-signed).
// Local valueless stacks only -- see PRACTICE_OPPONENT in ./api.js.
export function addPokerOpponent(roundId) {
  return jsonPost(`/poker/rounds/${encodeURIComponent(roundId)}/join`)
}

// Drive the practice opponent's action. The operator bearer bypasses the
// per-action wallet grant, so no sequence/state hash is needed.
export function botPokerAction(roundId, address, action, amount = 0) {
  return jsonPost(`/poker/rounds/${encodeURIComponent(roundId)}/action`, {
    address, action, amount,
  })
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
  return jsonGet(`/poker/rounds/${encodeURIComponent(roundId)}/hand?address=${encodeURIComponent(address)}`, { operator: true })
}

export async function postPokerAction(roundId, address, actionContext, action, amount = 0) {
  const path = `/poker/rounds/${encodeURIComponent(roundId)}/action`
  const payload = walletAction(address, actionContext, { action, amount })
  const auth = await moveSessionAuth(roundId, payload)
  if (auth) return jsonSessionPost(path, payload, auth.sessionId, auth.mac)
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

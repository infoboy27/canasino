import { jsonGet, jsonPost, websocket } from './api.js'
import { walletAction, walletAuthorizedPost, walletOperation } from './auth.js'

export function openDominoRound() {
  return jsonPost('/domino/rounds')
}

// Seat a custodial "practice opponent" (operator-funded, operator-signed).
// Local valueless stacks only -- see PRACTICE_OPPONENT in ./api.js.
export function addDominoOpponent(roundId) {
  return jsonPost(`/domino/rounds/${encodeURIComponent(roundId)}/join`)
}

// Drive the practice opponent's turn. The operator bearer bypasses the
// per-move wallet grant (authorize_wallet_action returns False for it), so
// no sequence/state hash is needed.
export function botDominoMove(roundId, address, action, tile, end) {
  return jsonPost(`/domino/rounds/${encodeURIComponent(roundId)}/move`, {
    address, action, tile: tile || null, end: end || null,
  })
}

export function registerDominoJoin(roundId, address, txHash) {
  const path = `/domino/rounds/${encodeURIComponent(roundId)}/register`
  const payload = walletOperation(address, txHash)
  return walletAuthorizedPost({ path, account: { address }, action: 'join_domino', resource: `domino-round:${roundId}`, payload })
}

export function getDominoRoundInfo(roundId) {
  return jsonGet(`/domino/rounds/${encodeURIComponent(roundId)}/info`)
}

export function getDominoRound(roundId) {
  return jsonGet(`/domino/rounds/${encodeURIComponent(roundId)}`)
}

export function getDominoHand(roundId, address) {
  return jsonGet(`/domino/rounds/${encodeURIComponent(roundId)}/hand?address=${encodeURIComponent(address)}`, { operator: true })
}

export function postDominoMove(roundId, address, actionContext, action, tile, end) {
  const path = `/domino/rounds/${encodeURIComponent(roundId)}/move`
  const payload = walletAction(address, actionContext, {
    action, tile: tile || null, end: end || null,
  })
  return walletAuthorizedPost({
    path, account: { address }, action: 'domino_move',
    resource: `domino-move:${roundId}:${payload.sequence}`, payload,
  })
}

export function getDominoProof(roundId) {
  return jsonGet(`/domino/rounds/${encodeURIComponent(roundId)}/proof`)
}

export function openDominoSocket(roundId) {
  return websocket(`/ws/domino/${encodeURIComponent(roundId)}`)
}

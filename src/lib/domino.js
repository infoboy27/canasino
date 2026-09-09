import { jsonGet, jsonPost, websocket } from './api.js'
import { walletAuthorizedPost, walletOperation } from './auth.js'

export function openDominoRound() {
  return jsonPost('/domino/rounds')
}

export function joinDominoTable(roundId) {
  return jsonPost(`/domino/rounds/${encodeURIComponent(roundId)}/join`)
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
  return jsonGet(`/domino/rounds/${encodeURIComponent(roundId)}/hand?address=${encodeURIComponent(address)}`)
}

export function postDominoMove(roundId, address, action, tile, end) {
  return jsonPost(`/domino/rounds/${encodeURIComponent(roundId)}/move`, { address, action, tile: tile || null, end: end || null })
}

export function getDominoProof(roundId) {
  return jsonGet(`/domino/rounds/${encodeURIComponent(roundId)}/proof`)
}

export function openDominoSocket(roundId) {
  return websocket(`/ws/domino/${encodeURIComponent(roundId)}`)
}

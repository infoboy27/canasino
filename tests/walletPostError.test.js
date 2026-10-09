import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walletPostErrorMessage, statusMessage } from '../src/lib/api.js'

test('a chain-rejected tx shows the chain reason', () => {
  const body = { detail: { code: 'receipt_invalid', message: 'transaction failed on chain: player already joined' } }
  const message = walletPostErrorMessage(422, body)
  assert.match(message, /player already joined/)
  assert.doesNotMatch(message, /transaction failed on chain/)
})

test('other errors keep the generic mapping', () => {
  assert.equal(walletPostErrorMessage(425, null), statusMessage(425))
  assert.equal(walletPostErrorMessage(409, { detail: 'x' }), statusMessage(409))
  assert.equal(walletPostErrorMessage(422, { detail: { code: 'other', message: 'm' } }), statusMessage(422))
  assert.equal(walletPostErrorMessage(422, undefined), statusMessage(422))
})

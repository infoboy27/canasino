// A 425 retry must reuse the operation id for the same tx, or the server answers
// 409 "transaction hash already belongs to another operation".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walletOperation } from '../src/lib/auth.js'

const ADDR = '9ddb1fe7e9539e08e035118f15f50b2c089485e3'
const TX_A = 'a'.repeat(64)
const TX_B = 'b'.repeat(64)

test('same address and tx hash reuse one operation id', () => {
  const first = walletOperation(ADDR, TX_A, { num_cards: 1 })
  const retry = walletOperation(ADDR, '0x' + TX_A.toUpperCase(), { num_cards: 1 })
  assert.equal(first.operation_id, retry.operation_id)
})

test('a different tx hash gets a different operation id', () => {
  assert.notEqual(walletOperation(ADDR, TX_A).operation_id, walletOperation(ADDR, TX_B).operation_id)
})

test('rejects a malformed receipt', () => {
  assert.throws(() => walletOperation(ADDR, 'nope'), /Invalid wallet transaction receipt/)
})

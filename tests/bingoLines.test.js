import test from 'node:test'
import assert from 'node:assert/strict'
import { cardProgress, columnNumbers, flattenCard, LINES } from '../src/lib/bingoLines.js'

// Row-major 5x5; the centre (index 12) is the FREE space, whatever number is printed there.
const card = [
  [1, 16, 31, 46, 61],
  [2, 17, 32, 47, 62],
  [3, 18, 0, 48, 63],
  [4, 19, 34, 49, 64],
  [5, 20, 35, 50, 65],
]

test('there are twelve lines', () => assert.equal(LINES.length, 12))

test('flattens nested or flat cards', () => {
  assert.equal(flattenCard(card).length, 25)
  assert.deepEqual(flattenCard(card.flat()), flattenCard(card))
  assert.deepEqual(flattenCard(null), [])
})

test('the free centre counts as marked and progress shrinks as numbers land', () => {
  assert.equal(cardProgress(card, []).toGo, 4) // centre alone sits on a row, a column and both diagonals
  assert.equal(cardProgress(card, [2, 3, 4]).toGo, 2)    // column 0 still lacks 1 and 5
  assert.equal(cardProgress(card, [1, 2, 3, 4]).toGo, 1) // ...and now only 5
})

test('a completed row is reported as the winning line', () => {
  const done = cardProgress(card, [1, 16, 31, 46, 61])
  assert.equal(done.toGo, 0)
  assert.deepEqual(done.winningLine, [0, 1, 2, 3, 4])
})

test('a diagonal through the free space wins with four calls', () => {
  const p = cardProgress(card, [1, 17, 49, 65])
  assert.equal(p.toGo, 0)
  assert.deepEqual(p.winningLine, [0, 6, 12, 18, 24])
})

test('no line, no winner', () => {
  const p = cardProgress(card, [1, 17, 64])
  assert.equal(p.winningLine, null)
  assert.ok(p.toGo >= 1)
})

test('column ranges follow B-I-N-G-O', () => {
  assert.deepEqual(columnNumbers(0).slice(0, 2), [1, 2])
  assert.equal(columnNumbers(4).at(-1), 75)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { bestHand, compareRanks, describeRank, rankFive } from '../src/lib/pokerEval.js'

const c = (s) => s.split(' ').map((x) => [x[0], x[1]])
const name = (s) => bestHand(c(s)).name

test('names every category', () => {
  assert.equal(name('As Ks Qs Js Ts 2d 3c'), 'Royal flush')
  assert.equal(name('9h 8h 7h 6h 5h Ad Kc'), 'Straight flush, Nine high')
  assert.equal(name('Qs Qh Qd Qc 2s 3h 9d'), 'Four Queens')
  assert.equal(name('Ks Kh Kd 9c 9s 2h 3d'), 'Full house, Kings full of Nines')
  assert.equal(name('As 9s 7s 4s 2s Kh Qd'), 'Flush, Ace high')
  assert.equal(name('9s 8h 7d 6c 5s 2h Kd'), 'Straight, Nine high')
  assert.equal(name('7s 7h 7d Kc 9s 2h 3d'), 'Three Sevens')
  assert.equal(name('Js Jh 4d 4c 9s 2h Kd'), 'Two pair, Jacks and Fours')
  assert.equal(name('6s 6h Ad 4c 9s 2h Kd'), 'Pair of Sixes')
  assert.equal(name('As Qh 9d 4c 7s 2h Kd'), 'Ace high')
})

test('the wheel is a five-high straight and loses to a six-high straight', () => {
  const wheel = bestHand(c('As 2h 3d 4c 5s 9h Kd'))
  assert.equal(wheel.name, 'Straight, Five high')
  assert.ok(compareRanks(rankFive(c('6s 5h 4d 3c 2s')), wheel.rank) > 0)
})

test('picks the five cards that actually play', () => {
  const hand = bestHand(c('As Ah Ad Kc Ks 2h 3d'))
  assert.equal(hand.name, 'Full house, Aces full of Kings')
  assert.deepEqual(hand.cards.map(([r]) => r).sort(), ['A', 'A', 'A', 'K', 'K'])
})

test('kickers decide otherwise equal hands', () => {
  const a = bestHand(c('As Ah Kd 9c 5s 2h 3d')).rank
  const b = bestHand(c('Ac Ad Qd 9h 5d 2s 3h')).rank
  assert.ok(compareRanks(a, b) > 0)
  assert.equal(compareRanks(a, a), 0)
})

test('needs five cards', () => {
  assert.equal(bestHand(c('As Ah Kd 9c')), null)
  assert.equal(describeRank([0, 14]), 'Ace high')
})

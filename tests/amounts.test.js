import test from 'node:test'
import assert from 'node:assert/strict'
import { cardCost, parseTokens, formatTokens, wireAmount } from '../src/lib/amounts.js'
import { getRooms } from '../src/lib/bingo.js'
import { jsonGet, jsonPost } from '../src/lib/api.js'
import { canopySignAndSubmit } from '../src/lib/fleet.js'

test('decimal amounts use exact integer arithmetic', () => {
  assert.equal(parseTokens('0.000001'), 1)
  assert.equal(parseTokens('1.000001'), 1000001)
  assert.equal(parseTokens('0.29'), 290000)
  assert.equal(formatTokens('18446744073709551615'), '18446744073709.551615')
  assert.equal(cardCost(101, 2), 181)
  assert.equal(cardCost(101, 3), 252)
})
test('rejects invalid, rounded, excessive and unsafe amounts', () => {
  for (const input of ['1e3', '-1', 'NaN', 'Infinity', '0.0000001', '', '9007199254.740992']) assert.throws(() => parseTokens(input))
  for (const input of [NaN, Infinity, 1.2, -1, true, 9007199254740992]) assert.throws(() => wireAmount(input))
  for (const cards of [0, 5, true, 2.5, '2']) assert.throws(() => cardCost(100, cards))
})
test('paused writes cannot reach fetch or wallet provider', async () => {
  let calls = 0
  const previous = globalThis.fetch
  globalThis.fetch = async () => { calls++; throw new Error('unexpected write') }
  try {
    await assert.rejects(jsonPost('/rounds', {}), /paused/)
    await assert.rejects(canopySignAndSubmit({ messageName: 'join_room' }), /paused/)
    assert.equal(calls, 0)
  } finally { globalThis.fetch = previous }
})
test('HTTP failures and malformed JSON have safe messages', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('secret stack', {status:500})
    await assert.rejects(jsonGet('/rooms'), /unavailable/)
    globalThis.fetch = async () => new Response('not json', {status:200})
    await assert.rejects(jsonGet('/rooms'), /invalid response/)
    globalThis.fetch = async () => new Response('{}', {status:200})
    await assert.rejects(getRooms(), /invalid room list/)
    globalThis.fetch = async (_url, {signal}) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted','AbortError'))))
    await assert.rejects(jsonGet('/rooms', {timeoutMs:5}), /timed out/)
  } finally { globalThis.fetch = previous }
})

test('refund requests reject wrong networks and malformed wallet responses', async () => {
  const previous=globalThis.window
  let calls=0
  globalThis.window={fleet:{isFleetWallet:true,request:async()=>{calls++;return {}}}}
  const params={messageName:'expire_room',rpcUrl:'https://attacker.invalid/rpc',chainId:406,networkId:1,fields:[{number:2,type:'bytes',value:'ab'.repeat(8)}]}
  try {
    await assert.rejects(canopySignAndSubmit(params),/Unrecognized/)
    assert.equal(calls,0)
    params.rpcUrl='https://casino.val-a.grad.dev.app.canopynetwork.org/rpc'
    await assert.rejects(canopySignAndSubmit(params),/status is unknown/)
    assert.equal(calls,1)
  } finally { globalThis.window=previous }
})

test('wallet transaction hashes accept an optional 0x prefix and normalize it', async () => {
  const previous=globalThis.window
  globalThis.window={fleet:{isFleetWallet:true,request:async()=>`0x${'ab'.repeat(32)}`}}
  try {
    const result=await canopySignAndSubmit({
      messageName:'expire_room', rpcUrl:'https://casino.val-a.grad.dev.app.canopynetwork.org/rpc',
      chainId:406, networkId:1, fields:[{number:2,type:'bytes',value:'ab'.repeat(8)}],
    })
    assert.equal(result.txHash,'ab'.repeat(32))
  } finally { globalThis.window=previous }
})

// Base units are integers. Decimal input is parsed as text, never multiplied
// using floating point. The current game-server JSON contract uses numbers,
// so fail closed above MAX_SAFE_INTEGER until it supports decimal strings.
export function baseUnits(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Amount is not a safe integer')
  if (!['string', 'number', 'bigint'].includes(typeof value) || !/^\d+$/.test(String(value))) throw new Error('Invalid amount')
  const amount = BigInt(value)
  if (amount > 18446744073709551615n) throw new Error('Amount exceeds uint64')
  return amount
}

export function wireAmount(value) {
  const amount = baseUnits(value)
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount exceeds the supported API range')
  return Number(amount)
}

export function parseTokens(value) {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(String(value).trim())
  if (!match) throw new Error('Enter an amount with at most six decimal places')
  return wireAmount(BigInt(match[1]) * 1000000n + BigInt((match[2] || '').padEnd(6, '0')))
}

export function formatTokens(value = 0) {
  const amount = baseUnits(value)
  const fraction = (amount % 1000000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${amount / 1000000n}${fraction ? `.${fraction}` : ''}`
}

export function cardCost(baseEntry, numCards) {
  const multipliers = { 1: 10000n, 2: 18000n, 3: 25000n, 4: 32000n }
  if (!Number.isInteger(numCards) || !multipliers[numCards]) throw new Error('Choose 1 to 4 cards')
  // Match engine.economy: floor, not Math.round.
  return wireAmount(baseUnits(baseEntry) * multipliers[numCards] / 10000n)
}

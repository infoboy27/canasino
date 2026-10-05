// Hold'em hand evaluation for the showdown reveal (names + the five cards that
// actually play). Mirrors engine/poker.py `hand_rank` exactly so what the UI
// announces always agrees with what the plugin decided; the chain stays the
// authority on who won -- this only explains it.
const RANKS = '23456789TJQKA'
const VALUE = Object.fromEntries([...RANKS].map((r, i) => [r, i + 2]))
const NAME = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' }
const plural = (v) => (v === 6 ? 'Sixes' : `${NAME[v]}s`)

/** Comparable score for exactly five [rank, suit] cards: a higher array wins. */
export function rankFive(cards) {
  const ranks = cards.map(([r]) => VALUE[r]).sort((a, b) => b - a)
  const isFlush = new Set(cards.map(([, s]) => s)).size === 1
  const unique = [...new Set(ranks)].sort((a, b) => b - a)
  let straightHigh = null
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0]
    else if (unique.join() === '14,5,4,3,2') straightHigh = 5 // wheel: the ace plays low
  }
  const counts = new Map()
  ranks.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1))
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const pattern = groups.map(([, c]) => c).join('')

  if (straightHigh && isFlush) return [8, straightHigh]
  if (pattern === '41') return [7, groups[0][0], groups[1][0]]
  if (pattern === '32') return [6, groups[0][0], groups[1][0]]
  if (isFlush) return [5, ...ranks]
  if (straightHigh) return [4, straightHigh]
  if (pattern === '311') return [3, groups[0][0], ...[groups[1][0], groups[2][0]].sort((a, b) => b - a)]
  if (pattern === '221') return [2, ...[groups[0][0], groups[1][0]].sort((a, b) => b - a), groups[2][0]]
  if (pattern === '2111') return [1, groups[0][0], ...[groups[1][0], groups[2][0], groups[3][0]].sort((a, b) => b - a)]
  return [0, ...ranks]
}

export function compareRanks(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0)
    if (d) return d
  }
  return 0
}

export function describeRank(rank) {
  const [category, a, b] = rank
  switch (category) {
    case 8: return a === 14 ? 'Royal flush' : `Straight flush, ${NAME[a]} high`
    case 7: return `Four ${plural(a)}`
    case 6: return `Full house, ${plural(a)} full of ${plural(b)}`
    case 5: return `Flush, ${NAME[a]} high`
    case 4: return `Straight, ${NAME[a]} high`
    case 3: return `Three ${plural(a)}`
    case 2: return `Two pair, ${plural(a)} and ${plural(b)}`
    case 1: return `Pair of ${plural(a)}`
    default: return `${NAME[a]} high`
  }
}

/** Best five of up to seven cards: { rank, cards, name }. */
export function bestHand(cards) {
  if (cards.length < 5) return null
  let best = null
  const pick = (start, chosen) => {
    if (chosen.length === 5) {
      const rank = rankFive(chosen)
      if (!best || compareRanks(rank, best.rank) > 0) best = { rank, cards: [...chosen] }
      return
    }
    for (let i = start; i < cards.length; i++) { chosen.push(cards[i]); pick(i + 1, chosen); chosen.pop() }
  }
  pick(0, [])
  return { ...best, name: describeRank(best.rank) }
}

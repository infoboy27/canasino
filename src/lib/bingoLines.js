// Line logic for the 5x5 Bingo card, mirroring engine/rules.py `LINES` (5 rows, 5 columns,
// 2 diagonals; the centre is a FREE space). Used only to explain progress in the UI -- who
// actually won is decided by the game service and re-checked by the chain.
const SIZE = 5
export const CENTER = 12

const range = [0, 1, 2, 3, 4]
export const LINES = [
  ...range.map((r) => range.map((c) => r * SIZE + c)),
  ...range.map((c) => range.map((r) => r * SIZE + c)),
  range.map((i) => i * SIZE + i),
  range.map((i) => i * SIZE + (SIZE - 1 - i)),
]

/** Flatten whatever the API gives (rows of 5, or already flat) to 25 numbers, row-major. */
export function flattenCard(card) {
  if (!Array.isArray(card)) return []
  return (Array.isArray(card[0]) ? card.flat() : card).slice(0, SIZE * SIZE).map(Number)
}

/** Marked cells, how far the closest line is, and the first complete line (if any). */
export function cardProgress(card, called) {
  const flat = flattenCard(card)
  const drawn = called instanceof Set ? called : new Set([...called].map(Number))
  const marked = new Set(flat.map((n, i) => (i === CENTER || drawn.has(n) ? i : -1)).filter((i) => i >= 0))
  let toGo = SIZE
  let winningLine = null
  for (const line of LINES) {
    const missing = line.filter((i) => !marked.has(i)).length
    if (missing < toGo) toGo = missing
    if (missing === 0 && !winningLine) winningLine = line
  }
  return { marked, toGo, winningLine }
}

export const LETTERS = ['B', 'I', 'N', 'G', 'O']
/** B 1-15, I 16-30, N 31-45, G 46-60, O 61-75. */
export const columnNumbers = (columnIndex) => Array.from({ length: 15 }, (_, i) => columnIndex * 15 + i + 1)

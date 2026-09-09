// Deliberately no environment-variable escape hatch. Reopening requires the
// wallet authorization and on-chain betting-close protocol fixes documented
// in audit/REPORT.md.
export const WAGERING_PAUSED = true
export const PAUSE_MESSAGE = 'Wagering is paused while wallet authorization and game integrity are being secured. You can explore the tables; no new bets are accepted.'
export function requireWagering() {
  if (WAGERING_PAUSED) throw new Error(PAUSE_MESSAGE)
}

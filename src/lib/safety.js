// Wagering is paused by default. It stays paused for every build unless
// VITE_WAGERING_ENABLED is explicitly set at build/dev time -- an opt-in for a
// local valueless stack wired to the isolated Canopy node (see
// audit/testnet/ and audit/specs/fair-randomness-v2.md). Production builds do
// not set it, so the audited preview posture is unchanged. Reopening for real
// still requires the wallet authorization + on-chain close/reveal work in
// audit/REPORT.md landing and being reviewed.
export const WAGERING_PAUSED =
  String(import.meta.env?.VITE_WAGERING_ENABLED ?? '').toLowerCase() !== '1' &&
  String(import.meta.env?.VITE_WAGERING_ENABLED ?? '').toLowerCase() !== 'true'
export const PAUSE_MESSAGE = 'Wagering is paused while wallet authorization and game integrity are being secured. You can explore the tables; no new bets are accepted.'
export function requireWagering() {
  if (WAGERING_PAUSED) throw new Error(PAUSE_MESSAGE)
}

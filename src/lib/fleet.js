import { formatTokens, wireAmount } from './amounts.js'
import { requireWagering } from './safety.js'
export const WALLET_METHOD_MISSING = 'WALLET_METHOD_MISSING'

export function hasFleet() {
  return typeof window !== 'undefined' && Boolean(window.fleet?.isFleetWallet)
}

export function waitForFleet(timeoutMs = 700) {
  if (hasFleet()) return Promise.resolve(true)

  return new Promise((resolve) => {
    let done = false
    let timer
    const initialized = () => finish(hasFleet())
    const finish = (value) => {
      if (done) return
      done = true
      window.removeEventListener('fleet#initialized', initialized)
      window.clearTimeout(timer)
      resolve(value)
    }

    window.addEventListener('fleet#initialized', initialized)
    timer = window.setTimeout(() => finish(hasFleet()), timeoutMs)
  })
}

function normalizeAccount(account) {
  if (!account?.address) return null
  if (typeof account.address !== 'string' || !/^(0x)?[a-fA-F0-9]{40}$/.test(account.address)) throw new Error('FleetWallet returned an invalid Canopy address')
  return {
    ...account,
    address: account.address.replace(/^0x/, '').toLowerCase(),
  }
}

export async function connectFleet() {
  if (!hasFleet()) throw new Error('FleetWallet not detected')

  const account = await window.fleet.connect({
    permissions: ['account', 'balance', 'tx.write'],
    label: 'Canasino',
    network: 'canopy',
  })

  return normalizeAccount(account)
}

export async function restoreFleet() {
  if (!hasFleet() || !window.fleet?.getAccount) return null
  try {
    return normalizeAccount(await window.fleet.getAccount())
  } catch {
    return null
  }
}

export async function disconnectFleet() {
  try {
    await window.fleet?.disconnect?.()
  } catch {
    // Disconnect is best-effort. The UI always clears local state.
  }
}

export async function getFleetBalance() {
  if (!hasFleet() || !window.fleet?.getBalance) return null
  try {
    return await window.fleet.getBalance()
  } catch {
    return null
  }
}

export async function canopySignAndSubmit(params) {
  if (params.messageName !== 'expire_room') requireWagering()
  if (!hasFleet()) throw new Error('FleetWallet not detected')
  const rpc = new URL(params.rpcUrl)
  if (rpc.href.replace(/\/$/, '') !== 'https://casino.val-a.grad.dev.app.canopynetwork.org/rpc' || params.chainId !== 406 || params.networkId !== 1) throw new Error('Unrecognized Canasino network. Transaction blocked.')
  for (const field of params.fields) {
    if (field.type === 'uint64') wireAmount(field.value)
    if (field.number === 2 && !/^[a-fA-F0-9]{16,128}$/.test(field.value)) throw new Error('Invalid round identifier')
  }

  try {
    const result = await window.fleet.request({
      method: 'canopy_signAndSubmit',
      params: [params],
    })

    const normalized = typeof result === 'string' ? { txHash: result } : result
    const txHash = typeof normalized?.txHash === 'string' ? normalized.txHash.replace(/^0x/i, '') : ''
    if (!/^[a-fA-F0-9]{64}$/.test(txHash)) throw new Error('Wallet submission status is unknown. Check wallet history before retrying.')
    return { ...normalized, txHash }
  } catch (error) {
    if (
      error?.code === 4200 ||
      /unsupported|unknown method|not.*support/i.test(String(error?.message || ''))
    ) {
      const unsupported = Object.assign(new Error(WALLET_METHOD_MISSING), { code: WALLET_METHOD_MISSING })
      throw unsupported
    }
    throw error
  }
}

export async function joinBingoRound({ roundId, numCards, amount, rpcUrl, chainId, networkId }) {
  return canopySignAndSubmit({
    messageName: 'join_room',
    typeUrl: 'type.googleapis.com/types.MessageJoinRoom',
    fields: [
      { number: 1, type: 'bytes', fromSigner: true },
      { number: 2, type: 'bytes', value: roundId },
      { number: 3, type: 'uint64', value: numCards },
      { number: 4, type: 'uint64', value: amount },
    ],
    rpcUrl,
    chainId,
    networkId,
    fee: 10000,
    display: {
      title: 'Join Canasino Bingo room',
      lines: [
        { label: 'Room', value: `${roundId.slice(0, 8)}…` },
        { label: 'Stake', value: `${formatTokens(amount)} CNPY` },
      ],
    },
  })
}

export async function joinDominoTable({ roundId, amount, rpcUrl, chainId, networkId }) {
  return canopySignAndSubmit({
    messageName: 'join_domino',
    typeUrl: 'type.googleapis.com/types.MessageJoinDomino',
    fields: [
      { number: 1, type: 'bytes', fromSigner: true },
      { number: 2, type: 'bytes', value: roundId },
      { number: 3, type: 'uint64', value: amount },
    ],
    rpcUrl,
    chainId,
    networkId,
    fee: 10000,
    display: {
      title: 'Join Canasino Domino table',
      lines: [
        { label: 'Table', value: `${roundId.slice(0, 8)}…` },
        { label: 'Stake', value: `${formatTokens(amount)} CNPY` },
      ],
    },
  })
}

export async function joinPokerTable({ roundId, amount, rpcUrl, chainId, networkId }) {
  return canopySignAndSubmit({
    messageName: 'join_poker',
    typeUrl: 'type.googleapis.com/types.MessageJoinPoker',
    fields: [
      { number: 1, type: 'bytes', fromSigner: true },
      { number: 2, type: 'bytes', value: roundId },
      { number: 3, type: 'uint64', value: amount },
    ],
    rpcUrl,
    chainId,
    networkId,
    fee: 10000,
    display: {
      title: 'Join Canasino Poker table',
      lines: [
        { label: 'Table', value: `${roundId.slice(0, 8)}…` },
        { label: 'Buy-in', value: `${formatTokens(amount)} CNPY` },
      ],
    },
  })
}

export async function placeRouletteBet({ roundId, betType, betNumber, amount, rpcUrl, chainId, networkId }) {
  return canopySignAndSubmit({
    messageName: 'roulette_bet',
    typeUrl: 'type.googleapis.com/types.MessageRouletteBet',
    fields: [
      { number: 1, type: 'bytes', fromSigner: true },
      { number: 2, type: 'bytes', value: roundId },
      { number: 3, type: 'string', value: betType },
      { number: 4, type: 'uint64', value: betNumber },
      { number: 5, type: 'uint64', value: amount },
    ],
    rpcUrl,
    chainId,
    networkId,
    fee: 10000,
    display: {
      title: 'Place a Canasino Roulette bet',
      lines: [
        { label: 'Bet', value: betType === 'straight' ? `Straight ${betNumber}` : betType },
        { label: 'Stake', value: `${formatTokens(amount)} CNPY` },
      ],
    },
  })
}

// Refunds every escrowed entry for a round the operator never settled.
// On-chain, this is only accepted once the room has passed its expiry
// height (roughly an hour of blocks after it opened) -- anyone can call
// it, they just pay their own tx fee and receive nothing themselves.
// Calling it too early fails on-chain with a clear "not yet expired"
// error, which the caller should surface as-is rather than hide.
export async function expireRoom({ roundId, rpcUrl, chainId, networkId }) {
  return canopySignAndSubmit({
    messageName: 'expire_room',
    typeUrl: 'type.googleapis.com/types.MessageExpireRoom',
    fields: [
      { number: 1, type: 'bytes', fromSigner: true },
      { number: 2, type: 'bytes', value: roundId },
    ],
    rpcUrl,
    chainId,
    networkId,
    fee: 10000,
    display: {
      title: 'Refund abandoned Canasino room',
      lines: [
        { label: 'Room', value: `${roundId.slice(0, 8)}…` },
      ],
    },
  })
}

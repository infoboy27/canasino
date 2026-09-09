import { jsonPublicPost, jsonWalletPost } from './api.js'
import { hasFleet } from './fleet.js'
import { requireWagering } from './safety.js'

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

export async function payloadHash(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(payload)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function requestWalletGrant({ account, action, resource, payload }) {
  if (!hasFleet()) throw new Error('FleetWallet not detected')
  if (!account?.address || !/^[a-f0-9]{40}$/.test(account.address)) throw new Error('Invalid wallet account')
  const hash = await payloadHash(payload)
  const challenge = await jsonPublicPost('/auth/challenges', {
    address: account.address, action, resource, payload_hash: hash,
  })
  if (!/^[a-f0-9]{32}$/i.test(challenge?.challengeId?.replaceAll('-', '') || '') ||
      !/^(?:[a-f0-9]{2})+$/i.test(challenge?.messageHex || '')) {
    throw new Error('The game service returned an invalid wallet challenge.')
  }
  let proof
  try {
    proof = await window.fleet.request({
      method: 'canopy_signMessage',
      params: [{
        messageHex: challenge.messageHex,
        display: { title: 'Authorize one Canasino operation', lines: [
          { label: 'Action', value: action }, { label: 'Resource', value: resource },
        ] },
      }],
    })
  } catch (error) {
    if (error?.code === 4200 || /unsupported|unknown method|not.*support/i.test(String(error?.message || ''))) {
      throw new Error('This FleetWallet build does not support secure message authorization.', { cause: error })
    }
    throw error
  }
  if (!/^[a-f0-9]{96}$/i.test(proof?.publicKey || '') || !/^[a-f0-9]{192}$/i.test(proof?.signature || '')) {
    throw new Error('FleetWallet returned an invalid authorization proof.')
  }
  const result = await jsonPublicPost('/auth/verify', {
    challenge_id: challenge.challengeId,
    public_key: proof.publicKey,
    signature: proof.signature,
  })
  if (typeof result?.grant !== 'string' || result.grant.length < 32 || result.singleUse !== true) {
    throw new Error('The game service returned an invalid authorization grant.')
  }
  return result.grant
}

export async function walletAuthorizedPost({ path, account, action, resource, payload }) {
  requireWagering()
  const grant = await requestWalletGrant({ account, action, resource, payload })
  return jsonWalletPost(path, payload, grant)
}

export function walletOperation(address, txHash, fields = {}) {
  const normalizedHash = typeof txHash === 'string' ? txHash.replace(/^0x/i, '').toLowerCase() : ''
  if (!/^[a-f0-9]{40}$/.test(address) || !/^[a-f0-9]{64}$/.test(normalizedHash)) {
    throw new Error('Invalid wallet transaction receipt.')
  }
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('Secure operation IDs are unavailable.')
  return { address, operation_id: globalThis.crypto.randomUUID(), tx_hash: normalizedHash, ...fields }
}

export function walletAction(address, actionContext, fields = {}) {
  const sequence = actionContext?.sequence
  const stateHash = actionContext?.stateHash?.toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(address) || !Number.isSafeInteger(sequence) || sequence < 0 ||
      !/^[a-f0-9]{64}$/.test(stateHash || '')) {
    throw new Error('Invalid signed-action state context.')
  }
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('Secure operation IDs are unavailable.')
  return { address, operation_id: globalThis.crypto.randomUUID(), sequence, state_hash: stateHash, ...fields }
}

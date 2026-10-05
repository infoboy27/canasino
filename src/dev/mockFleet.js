// DEV-ONLY stand-in for the FleetWallet extension. Loaded exclusively by `vite dev`
// (import.meta.env.DEV) when VITE_DEV_WALLET_URL points at the local signer service
// (devwallet/dev_wallet.py), which signs with a throwaway key on the ISOLATED test chain.
// It is compiled out of production builds.
export function installMockFleet(url) {
  const call = async (method, params = []) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params }) })
    const body = await res.json()
    if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code })
    return body.result
  }
  window.fleet = {
    isFleetWallet: true,
    connect: () => call('connect'),
    getAccount: () => call('getAccount'),
    getBalance: () => call('getBalance'),
    disconnect: async () => {},
    request: ({ method, params }) => call(method, params),
  }
  window.dispatchEvent(new Event('fleet#initialized'))
}

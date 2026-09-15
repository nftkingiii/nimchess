/** Nimiq Pay wallet boundary. No private keys or auth tokens are stored here. */

export type WalletNetwork = 'mainnet' | 'testnet' | 'unknown'

export type WalletConnection = {
  address: string
  publicKey: string
  signature: string
  network: WalletNetwork
  provider: 'pay' | 'hub'
}

type NimiqProvider = {
  listAccounts(): Promise<unknown>
  sign(message: string): Promise<unknown>
  sendBasicTransaction(args: {
    recipient: string
    value: number
    fee?: number
    validityStartHeight?: number
  }): Promise<unknown>
}

let providerPromise: Promise<NimiqProvider> | null = null
let currentConnection: WalletConnection | null = null
let currentProvider: 'pay' | 'hub' | null = null

function hasInjectedPayProvider(): boolean {
  return typeof window !== 'undefined' && 'nimiq' in window
}

function hex(value: unknown, field: string): string {
  if (typeof value === 'string' && /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0)
    return value.toLowerCase()
  if (value instanceof Uint8Array)
    return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('')
  throw new Error(`Wallet returned an invalid ${field}.`)
}

function hubHex(value: unknown, field: string): string {
  return hex(value, field)
}

function providerError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('error' in value)) return null
  const error = (value as { error?: { message?: unknown } }).error
  return typeof error?.message === 'string' ? error.message : 'Wallet request failed.'
}

async function getProvider(): Promise<NimiqProvider> {
  if (typeof window === 'undefined') throw new Error('Open NimChess inside Nimiq Pay.')
  if (!providerPromise) {
    // The SDK waits for Nimiq Pay to inject window.nimiq. Keep this import at the boundary.
    providerPromise = import('@nimiq/mini-app-sdk')
      .then(({ init }) => init({ timeout: 10_000 }))
      .catch(() => {
        // A failed provider initialization must be retryable after the user opens Pay.
        providerPromise = null
        throw new Error('Open NimChess inside Nimiq Pay to connect your wallet. You can keep playing here without connecting.')
      })
  }
  return providerPromise
}

/** Connects the selected Nimiq Pay account by signing a server-issued challenge. */
export async function connectWallet(challenge: string): Promise<WalletConnection> {
  if (typeof challenge !== 'string' || challenge.length < 16 || challenge.length > 4096)
    throw new Error('Invalid wallet challenge.')

  const provider = await getProvider()
  const accountsResult = await provider.listAccounts()
  const accountsError = providerError(accountsResult)
  if (accountsError) throw new Error(accountsError)
  if (!Array.isArray(accountsResult) || typeof accountsResult[0] !== 'string' || !accountsResult[0])
    throw new Error('No Nimiq account was returned.')

  const signedResult = await provider.sign(challenge)
  const signingError = providerError(signedResult)
  if (signingError) throw new Error(signingError)
  if (!signedResult || typeof signedResult !== 'object') throw new Error('Wallet returned no signature.')
  const signed = signedResult as { publicKey?: unknown; signature?: unknown }
  const publicKey = hex(signed.publicKey, 'public key')
  const signature = hex(signed.signature, 'signature')
  if (publicKey.length !== 64 || signature.length !== 128) throw new Error('Wallet returned malformed signature data.')

  // Nimiq Pay currently exposes no documented mainnet/testnet method on the Nimiq provider.
  // Never infer a network from an address; the server must treat this as unknown until it has
  // an independently configured network assertion.
  currentProvider = 'pay'
  currentConnection = { address: accountsResult[0], publicKey, signature, network: 'unknown', provider: 'pay' }
  return currentConnection
}

/** Connects a standalone browser wallet through Nimiq Hub/Keyguard. */
export async function connectWalletWithHub(challenge: string): Promise<WalletConnection> {
  if (typeof challenge !== 'string' || challenge.length < 16 || challenge.length > 4096)
    throw new Error('Invalid wallet challenge.')

  const { default: HubApi } = await import('@nimiq/hub-api')
  const hub = new HubApi('https://hub.nimiq.com')
  const signed = await hub.signMessage({ appName: 'NimChess', message: challenge }) as {
    signer?: unknown
    signerPublicKey?: unknown
    signature?: unknown
  }
  if (!signed || typeof signed.signer !== 'string' || !signed.signer)
    throw new Error('Nimiq Wallet returned no account.')
  const publicKey = hubHex(signed.signerPublicKey, 'public key')
  const signature = hubHex(signed.signature, 'signature')
  if (publicKey.length !== 64 || signature.length !== 128)
    throw new Error('Nimiq Wallet returned malformed signature data.')

  currentProvider = 'hub'
  currentConnection = { address: signed.signer, publicKey, signature, network: 'unknown', provider: 'hub' }
  return currentConnection
}

/** Sends a user-authorized NIM tip. Native Nimiq Pay confirmation is always required. */
export async function sendTip(recipient: string, amountNim: number): Promise<string> {
  if (typeof recipient !== 'string' || recipient.trim().length < 20 || recipient.length > 80)
    throw new Error('Invalid Nimiq recipient.')
  if (!Number.isFinite(amountNim) || amountNim <= 0 || amountNim * 100_000 > Number.MAX_SAFE_INTEGER)
    throw new Error('Tip amount must be a positive, safe NIM amount.')
  const luna = Math.round(amountNim * 100_000)
  if (luna / 100_000 !== amountNim) throw new Error('Tip amount supports at most five decimal places.')

  if (currentProvider === 'hub') {
    const { default: HubApi } = await import('@nimiq/hub-api')
    const hub = new HubApi('https://hub.nimiq.com')
    const result = await hub.checkout({ appName: 'NimChess', recipient: recipient.trim(), value: luna }) as { hash?: unknown }
    if (!result || typeof result.hash !== 'string' || !result.hash)
      throw new Error('Nimiq Wallet returned no transaction hash.')
    return result.hash
  }

  if (currentProvider === null && !hasInjectedPayProvider()) {
    const { default: HubApi } = await import('@nimiq/hub-api')
    const hub = new HubApi('https://hub.nimiq.com')
    const result = await hub.checkout({ appName: 'NimChess', recipient: recipient.trim(), value: luna }) as { hash?: unknown }
    if (!result || typeof result.hash !== 'string' || !result.hash)
      throw new Error('Nimiq Wallet returned no transaction hash.')
    return result.hash
  }

  const provider = await getProvider()
  // A page reload clears our in-memory signature association. Re-requesting accounts
  // lets Nimiq Pay perform its native account/permission flow before the tip; it does
  // not recreate a server-authenticated connection or claim that one exists.
  if (!currentConnection) {
    const accountsResult = await provider.listAccounts()
    const accountsError = providerError(accountsResult)
    if (accountsError) throw new Error(accountsError)
    if (!Array.isArray(accountsResult) || typeof accountsResult[0] !== 'string' || !accountsResult[0])
      throw new Error('Connect a Nimiq wallet before sending a tip.')
  }
  const result = await provider.sendBasicTransaction({ recipient: recipient.trim(), value: luna })
  const error = providerError(result)
  if (error) throw new Error(error)
  if (typeof result !== 'string' || !result) throw new Error('Wallet returned no transaction hash.')
  return result
}

/** Clears only this tab's wallet association; Nimiq Pay itself has no SDK disconnect API. */
export function clearWalletAssociation(): void {
  currentConnection = null
  currentProvider = null
}

export const disconnectWallet = clearWalletAssociation

export function getWalletConnection(): WalletConnection | null {
  return currentConnection
}

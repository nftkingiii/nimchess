/** Server-side Nimiq Pay challenge verification. Never trust a client-supplied address alone. */

import { Address, BufferUtils, Hash, PublicKey, Signature } from '@nimiq/core'

const SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

function bytes(value: string, expected: number, field: string): Uint8Array {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${expected * 2}}$`, 'i').test(value))
    throw new Error(`Invalid ${field}.`)
  const output = new Uint8Array(expected)
  for (let i = 0; i < expected; i++) output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16)
  return output
}

/**
 * Verifies the exact Nimiq Keyguard message format:
 * sha256("\\x16Nimiq Signed Message:\\n" + message.length + message).
 * Also derives the address from the public key and compares it to the claimed address.
 */
export function verifyWalletSignature(
  challenge: string,
  publicKeyHex: string,
  signatureHex: string,
  address: string,
): boolean {
  if (typeof challenge !== 'string' || challenge.length < 16 || challenge.length > 4096) return false
  try {
    // Use the package parsers rather than constructors: current @nimiq/core WASM
    // constructors do not take ownership of raw bytes safely in Node.
    bytes(publicKeyHex, 32, 'public key')
    bytes(signatureHex, 64, 'signature')
    const publicKey = PublicKey.fromHex(publicKeyHex)
    const signature = Signature.fromHex(signatureHex)
    // Nimiq's message length is the UTF-8 byte length, not JavaScript UTF-16 code units.
    const messageLength = new TextEncoder().encode(challenge).byteLength
    const data = BufferUtils.fromUtf8(`${SIGNED_MESSAGE_PREFIX}${messageLength}${challenge}`)
    const digest = Hash.computeSha256(data)
    if (!publicKey.verify(signature, digest)) return false

    const derived = publicKey.toAddress()
    const claimed = Address.fromString(address)
    return derived.equals(claimed)
  } catch {
    return false
  }
}

export { SIGNED_MESSAGE_PREFIX }

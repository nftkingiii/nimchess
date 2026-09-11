import test from 'node:test'
import assert from 'node:assert/strict'
import { BufferUtils, Hash, PrivateKey, PublicKey, Signature } from '@nimiq/core'
import { SIGNED_MESSAGE_PREFIX, verifyWalletSignature } from './wallet-verification.js'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function signedFixture(challenge: string) {
  const privateKey = PrivateKey.generate()
  const publicKey = PublicKey.derive(privateKey)
  const address = publicKey.toAddress().toUserFriendlyAddress()
  const byteLength = new TextEncoder().encode(challenge).byteLength
  const digest = Hash.computeSha256(
    BufferUtils.fromUtf8(`${SIGNED_MESSAGE_PREFIX}${byteLength}${challenge}`),
  )
  const signature = Signature.create(privateKey, publicKey, digest)
  return {
    challenge,
    address,
    publicKey: publicKey.toHex(),
    signature: signature.toHex(),
  }
}

test('accepts an exact Nimiq signed challenge and matching derived address', () => {
  const fixture = signedFixture('NimChess login • 42')
  assert.equal(
    verifyWalletSignature(fixture.challenge, fixture.publicKey, fixture.signature, fixture.address),
    true,
  )
})

test('rejects a changed challenge', () => {
  const fixture = signedFixture('NimChess login challenge')
  assert.equal(
    verifyWalletSignature('NimChess changed challenge', fixture.publicKey, fixture.signature, fixture.address),
    false,
  )
})

test('rejects a changed signature', () => {
  const fixture = signedFixture('NimChess login challenge')
  const changed = `${fixture.signature.slice(0, -2)}${fixture.signature.endsWith('00') ? '01' : '00'}`
  assert.equal(
    verifyWalletSignature(fixture.challenge, fixture.publicKey, changed, fixture.address),
    false,
  )
})

test('rejects an address that is not derived from the signing public key', () => {
  const fixture = signedFixture('NimChess login challenge')
  const otherPrivateKey = PrivateKey.generate()
  const otherAddress = PublicKey.derive(otherPrivateKey).toAddress().toUserFriendlyAddress()
  assert.notEqual(otherAddress, fixture.address)
  assert.equal(
    verifyWalletSignature(fixture.challenge, fixture.publicKey, fixture.signature, otherAddress),
    false,
  )
})

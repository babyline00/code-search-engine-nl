import { test, expect, describe } from 'bun:test'
import { sha256Hex } from '../sha256'

describe('sha256Hex', () => {
  // NIST FIPS 180-4 test vectors
  test('empty string → known empty digest', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
  test('"abc" → known abc digest', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
  test('"a" → known single-a digest', () => {
    expect(sha256Hex('a')).toBe(
      'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    )
  })
  test('deterministic — same input twice yields identical output', () => {
    const a = sha256Hex('how does useState work?')
    const b = sha256Hex('how does useState work?')
    expect(a).toBe(b)
  })
  test('different inputs → different digests', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'))
  })
  test('output is always 64 lowercase hex chars', () => {
    expect(sha256Hex('x')).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256Hex('the quick brown fox jumps over the lazy dog')).toMatch(
      /^[0-9a-f]{64}$/,
    )
  })
  test('handles multi-byte UTF-8 input', () => {
    const h = sha256Hex('你好, world')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    // deterministic
    expect(sha256Hex('你好, world')).toBe(h)
  })
})

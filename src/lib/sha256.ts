/**
 * SHA-256 helper for explanation cache keys.
 *
 * Web Crypto's `crypto.subtle.digest` is async-only and unavailable in some
 * Bun/edge runtimes during unit tests. We therefore implement a portable
 * SHA-256 over UTF-8 bytes using a compact reference algorithm so the cache
 * key derivation is fully deterministic and testable with no IO.
 */

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n))
}

/**
 * Compute the SHA-256 hex digest of a UTF-8 string.
 * Pure, synchronous, no globals — safe in unit tests.
 */
export function sha256Hex(input: string): string {
  const bytes = utf8Encode(input)
  // Pre-processing: padding + 64-bit length (big-endian)
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while ((bytes.length % 64) !== 56) bytes.push(0)
  // 64-bit length (we only use the low 32 bits since inputs are tiny)
  for (let i = 0; i < 4; i++) bytes.push(0)
  bytes.push((bitLen >>> 24) & 0xff)
  bytes.push((bitLen >>> 16) & 0xff)
  bytes.push((bitLen >>> 8) & 0xff)
  bytes.push(bitLen & 0xff)

  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  for (let off = 0; off < bytes.length; off += 64) {
    const W = new Array<number>(64).fill(0)
    for (let i = 0; i < 16; i++) {
      W[i] =
        (bytes[off + i * 4] << 24) |
        (bytes[off + i * 4 + 1] << 16) |
        (bytes[off + i * 4 + 2] << 8) |
        bytes[off + i * 4 + 3]
      W[i] >>>= 0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3)
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10)
      W[i] = ((W[i - 16] + s0 + W[i - 7] + s1) >>> 0)
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)
      const mj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + mj) >>> 0
      h = g; g = f; f = e
      e = (d + t1) >>> 0
      d = c; c = b; b = a
      a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('')
}

function utf8Encode(str: string): number[] {
  const out: number[] = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6))
      out.push(0x80 | (c & 0x3f))
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // surrogate pair
      const lo = str.charCodeAt(++i)
      c = 0x10000 + ((c & 0x3ff) << 10) + (lo & 0x3ff)
      out.push(0xf0 | (c >> 18))
      out.push(0x80 | ((c >> 12) & 0x3f))
      out.push(0x80 | ((c >> 6) & 0x3f))
      out.push(0x80 | (c & 0x3f))
    } else {
      out.push(0xe0 | (c >> 12))
      out.push(0x80 | ((c >> 6) & 0x3f))
      out.push(0x80 | (c & 0x3f))
    }
  }
  return out
}

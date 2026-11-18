import { test, expect, describe } from 'bun:test'
import {
  hashingEmbed,
  cosine,
  serializeVector,
  deserializeVector,
  EMBED_DIM,
} from '../embeddings'

describe('hashingEmbed', () => {
  test('returns a fixed-length Float32Array', () => {
    const v = hashingEmbed('export function foo() {}')
    expect(v).toBeInstanceOf(Float32Array)
    expect(v.length).toBe(EMBED_DIM)
  })
  test('empty input -> zero vector', () => {
    const v = hashingEmbed('')
    expect(v.every((x) => x === 0)).toBe(true)
  })
  test('identical text -> identical vector (deterministic)', () => {
    expect(hashingEmbed('const x = 1')).toEqual(hashingEmbed('const x = 1'))
  })
  test('cosine of identical vectors = 1', () => {
    const a = hashingEmbed('function foo() { return 1 }')
    expect(cosine(a, a)).toBeCloseTo(1, 5)
  })
  test('cosine of overlapping code > cosine of disjoint code', () => {
    const a = hashingEmbed('export function useState(initial) { return [state] }')
    const b = hashingEmbed('const [state, setState] = useState(0)')
    const c = hashingEmbed('def fetch(url): return requests.get(url)')
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c))
  })
  test('normalised (L2 norm = 1)', () => {
    const a = hashingEmbed('export const Button = () => <button/>')
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 4)
  })
})

describe('serialize / deserialize', () => {
  test('round-trips a vector', () => {
    const v = hashingEmbed('hello world')
    const s = serializeVector(v)
    const v2 = deserializeVector(s)
    expect(Array.from(v2)).toEqual(Array.from(v))
  })
})

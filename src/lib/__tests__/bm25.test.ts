import { test, expect, describe } from 'bun:test'
import { BM25Index } from '../bm25'
import { tokenize } from '../tokenizer'

// Code-specific corpus: each chunk is a short snippet from a different
// language/framework, so a natural-language-ish query for a React API surfaces
// the React chunk first.
const corpus = [
  'export function useState(initial) { const [state, setState] = pair; return [state, setState] }',
  'const app = express(); app.get("/", (req, res) => res.send("hi"))',
  'def get(url): return requests.get(url).json()',
  'func main() { r := gin.New(); r.Run(":8080") }',
  'pub fn parse(s: &str) -> usize { s.len() }',
].map((text, i) => ({ id: `c${i}`, tokens: tokenize(text) }))

describe('BM25Index (code-specific)', () => {
  test('query "useState" ranks the React chunk first', () => {
    const idx = new BM25Index(corpus)
    const hits = idx.search('useState')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].id).toBe('c0')
  })
  test('query "express" ranks the Express chunk first', () => {
    const idx = new BM25Index(corpus)
    const hits = idx.search('express middleware')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].id).toBe('c1')
  })
  test('query "rust parse" ranks the Rust chunk first', () => {
    const idx = new BM25Index(corpus)
    const hits = idx.search('rust parse str')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].id).toBe('c4')
  })
  test('no matches -> empty result', () => {
    const idx = new BM25Index(corpus)
    expect(idx.search('zzzznonexistent')).toEqual([])
  })
  test('topK limit is respected', () => {
    const idx = new BM25Index(corpus)
    const hits = idx.search('get', 2)
    expect(hits.length).toBeLessThanOrEqual(2)
  })
  test('empty corpus -> empty result', () => {
    const idx = new BM25Index([])
    expect(idx.search('foo')).toEqual([])
    expect(idx.size).toBe(0)
  })
})

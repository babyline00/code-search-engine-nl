import { test, expect, describe } from 'bun:test'
import {
  buildExplanationPrompt,
  getExplainProvider,
  explanationQueryHash,
  __setExplainProviderForTest,
  type ExplainProvider,
} from '../ai'

const SAMPLE = `export function useToggle(initial = false) {
  const [on, setOn] = useState(initial)
  return [on, () => setOn(!on)]
}`

describe('buildExplanationPrompt', () => {
  test('returns a non-empty string', () => {
    const p = buildExplanationPrompt(SAMPLE, 'how does this hook work')
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(50)
  })
  test('asks the LLM to explain in 2-3 sentences', () => {
    const p = buildExplanationPrompt(SAMPLE, 'how does this hook work')
    expect(p.toLowerCase()).toContain('2-3 sentences')
  })
  test('mentions the query context', () => {
    const q = 'how does this hook work'
    const p = buildExplanationPrompt(SAMPLE, q)
    expect(p).toContain(q)
  })
  test('includes the snippet (inside a code fence)', () => {
    const p = buildExplanationPrompt(SAMPLE, 'how does this hook work')
    expect(p).toContain('```')
    expect(p).toContain('useToggle')
  })
  test('truncates extremely long snippets', () => {
    const huge = 'x = 1\n'.repeat(5000)
    const p = buildExplanationPrompt(huge, 'q')
    expect(p).toContain('truncated')
    expect(p.length).toBeLessThan(huge.length + 1000)
  })
})

describe('getExplainProvider (mock)', () => {
  class MockExplain implements ExplainProvider {
    async explain(_snippet: string, _query: string): Promise<string> {
      return 'mock explanation text'
    }
  }
  test('returns the injected mock provider', async () => {
    __setExplainProviderForTest(new MockExplain())
    const provider = getExplainProvider()
    const out = await provider.explain('x = 1', 'what is this')
    expect(out).toBe('mock explanation text')
    __setExplainProviderForTest(null)
  })
})

describe('explanationQueryHash', () => {
  test('is deterministic and 64 hex chars', () => {
    const h = explanationQueryHash('how does useState work')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(explanationQueryHash('how does useState work')).toBe(h)
  })
  test('different queries → different hashes', () => {
    expect(explanationQueryHash('a')).not.toBe(explanationQueryHash('b'))
  })
})

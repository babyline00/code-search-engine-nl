/**
 * AI explanation layer for the "Explain this snippet" button.
 *
 * `buildExplanationPrompt(snippet, query)` produces a prompt that asks the
 * model for a 2-3 sentence explanation that explicitly references the user's
 * search-query context. The provider is pluggable:
 *   - ZaiProvider: uses the in-sandbox `z-ai-web-dev-sdk` chat completion.
 *   - MockProvider: deterministic echo, used when no LLM is configured (tests,
 *     offline dev) so the UI stays demoable without a network round-trip.
 */
import { sha256Hex } from './sha256'

export interface ExplainProvider {
  explain(snippet: string, query: string): Promise<string>
}

/**
 * Build the explanation prompt sent to the LLM. Pure & deterministic so the
 * unit test can assert that it (a) asks for 2-3 sentences, (b) references the
 * query context, and (c) includes the snippet.
 */
export function buildExplanationPrompt(snippet: string, query: string): string {
  const trimmedSnippet =
    snippet.length > 4000 ? snippet.slice(0, 4000) + '\n// …(truncated)' : snippet
  return [
    'You are a senior software engineer helping another developer understand a code snippet.',
    `The developer searched for: "${query}".`,
    'Explain the snippet below in 2-3 sentences. Mention how it relates to the search query context, name the key function/class/variable, and surface the core idea.',
    'Do not invent details that are not present in the code. Keep it concise and technical.',
    '',
    '```',
    trimmedSnippet,
    '```',
  ].join('\n')
}

let cachedProvider: ExplainProvider | null = null

class ZaiProvider implements ExplainProvider {
  async explain(snippet: string, query: string): Promise<string> {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const prompt = buildExplanationPrompt(snippet, query)
    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      thinking: { type: 'disabled' },
    } as any)
    // The SDK can return a string, a JSON object, or a ReadableStream.
    if (typeof completion === 'string') return completion
    const obj = completion as any
    const content = obj?.choices?.[0]?.message?.content
    if (typeof content === 'string' && content.length > 0) return content
    const body = obj?.body ?? obj?._body
    if (body && typeof body.getReader === 'function') {
      return await consumeStream(body as ReadableStream<Uint8Array>)
    }
    return ''
  }
}

class MockProvider implements ExplainProvider {
  async explain(snippet: string, query: string): Promise<string> {
    const firstLine = snippet.split('\n').find((l) => l.trim().length > 0) ?? ''
    return (
      `[mock explanation] For your query "${query}", this snippet begins with: ` +
      `"${firstLine.slice(0, 80)}". It appears to define a small unit of ` +
      `code (function/class/expression) that is relevant to the query terms. ` +
      `(No live LLM configured — set ZAI_API_KEY to enable real explanations.)`
    )
  }
}

async function consumeStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let out = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const obj = JSON.parse(payload)
        const delta = obj?.choices?.[0]?.delta?.content
        if (typeof delta === 'string') out += delta
      } catch {
        // partial JSON — ignore
      }
    }
  }
  return out
}

export function getExplainProvider(): ExplainProvider {
  if (cachedProvider) return cachedProvider
  if (process.env.CSE_DISABLE_LLM === '1' || process.env.PKC_DISABLE_LLM === '1') {
    cachedProvider = new MockProvider()
    return cachedProvider
  }
  try {
    cachedProvider = new ZaiProvider()
  } catch (e) {
    console.warn('[ai] ZaiProvider unavailable, using MockProvider:', (e as Error).message)
    cachedProvider = new MockProvider()
  }
  return cachedProvider
}

/** Test-only. */
export function __setExplainProviderForTest(p: ExplainProvider | null) {
  cachedProvider = p
}

/** Cache key = sha256(query). Used by the /api/explain route for DB lookup. */
export function explanationQueryHash(query: string): string {
  return sha256Hex(query)
}

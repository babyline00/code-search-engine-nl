import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getExplainProvider, explanationQueryHash } from '@/lib/ai'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const chunkId: string = (body?.chunkId ?? '').toString().trim()
  const query: string = (body?.query ?? '').toString().trim()
  if (!chunkId || !query) {
    return NextResponse.json(
      { error: 'chunkId and query are required' },
      { status: 400 },
    )
  }

  const queryHash = explanationQueryHash(query)

  // Cache lookup: Explanation row keyed by (chunkId, queryHash)
  const cached = await db.explanation.findUnique({
    where: { chunkId_queryHash: { chunkId, queryHash } },
  })
  if (cached) {
    return NextResponse.json({
      chunkId,
      query,
      explanation: cached.explanation,
      cached: true,
    })
  }

  // Miss: load the chunk content, call LLM, persist
  const chunk = await db.codeChunk.findUnique({ where: { id: chunkId } })
  if (!chunk) {
    return NextResponse.json({ error: 'chunk not found' }, { status: 404 })
  }

  const provider = getExplainProvider()
  let explanation: string
  try {
    explanation = (await provider.explain(chunk.content, query)).trim()
  } catch (e) {
    return NextResponse.json(
      { error: 'explanation provider failed', detail: (e as Error).message },
      { status: 502 },
    )
  }
  if (!explanation) {
    explanation = '(The model returned no content for this snippet.)'
  }

  const saved = await db.explanation.create({
    data: { chunkId, queryHash, query, explanation },
  })

  return NextResponse.json({
    chunkId,
    query,
    explanation: saved.explanation,
    cached: false,
  })
}

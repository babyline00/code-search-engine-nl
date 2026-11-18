import { NextRequest, NextResponse } from 'next/server'
import { retrieve } from '@/lib/retrieval'
import { ensureSeeded } from '@/lib/seeder'
import { db } from '@/lib/db'
import { buildGitHubFileUrl } from '@/lib/url-builder'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query: string = (body?.query ?? '').toString().trim()
  const filterLanguages: string[] | undefined = Array.isArray(body?.filterLanguages)
    ? body.filterLanguages.filter((l: unknown) => typeof l === 'string' && l.length > 0)
    : undefined
  const filterRepoIds: string[] | undefined = Array.isArray(body?.filterRepoIds)
    ? body.filterRepoIds.filter((r: unknown) => typeof r === 'string' && r.length > 0)
    : undefined

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  // Auto-seed on first search if DB is empty
  await ensureSeeded()

  const hits = await retrieve(query, { filterLanguages, filterRepoIds, topK: 12 })

  // Persist a SearchLog row (filters as JSON for replay/analytics)
  const filters = {
    ...(filterLanguages ? { languages: filterLanguages } : {}),
    ...(filterRepoIds ? { repoIds: filterRepoIds } : {}),
  }
  await db.searchLog
    .create({
      data: {
        query,
        resultsCount: hits.length,
        filters: Object.keys(filters).length ? JSON.stringify(filters) : null,
      },
    })
    .catch(() => {
      /* SearchLog is best-effort; never fail a search because of it */
    })

  const results = hits.map((h) => ({
    chunkId: h.chunkId,
    repo: {
      id: h.repoId,
      owner: h.repoOwner,
      name: h.repoName,
      url: h.repoUrl,
      defaultBranch: h.repoDefaultBranch,
    },
    filePath: h.filePath,
    language: h.language,
    symbolName: h.symbolName,
    startLine: h.startLine,
    endLine: h.endLine,
    content: h.content,
    githubUrl: buildGitHubFileUrl(
      { owner: h.repoOwner, name: h.repoName, defaultBranch: h.repoDefaultBranch },
      h.filePath,
      { startLine: h.startLine, endLine: h.endLine },
    ),
    scores: {
      bm25: Number(h.bm25Score.toFixed(4)),
      vector: Number(h.vectorScore.toFixed(4)),
      fused: Number(h.fusedScore.toFixed(4)),
    },
  }))

  return NextResponse.json({ query, results })
}

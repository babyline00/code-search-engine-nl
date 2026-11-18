import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seeder'

export const runtime = 'nodejs'

/** GET /api/stats — corpus overview for the header / landing strip. */
export async function GET() {
  await ensureSeeded()
  const [repos, files, chunks, explanations, searchCount] = await Promise.all([
    db.repo.count(),
    db.codeFile.count(),
    db.codeChunk.count(),
    db.explanation.count(),
    db.searchLog.count(),
  ])
  // Per-language chunk breakdown for the filter sidebar counts
  const langRows = await db.codeChunk.groupBy({
    by: ['language'],
    _count: { id: true },
  })
  const languages = langRows
    .map((r) => ({ language: r.language, count: r._count.id }))
    .sort((a, b) => b.count - a.count)
  return NextResponse.json({
    repos,
    files,
    chunks,
    explanations,
    searchCount,
    languages,
  })
}

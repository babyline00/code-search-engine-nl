import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seeder'

export const runtime = 'nodejs'

/** GET /api/repos — list indexed repos with per-repo file/chunk counts. */
export async function GET() {
  await ensureSeeded()
  const repos = await db.repo.findMany({
    orderBy: [{ owner: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { files: true } } },
  })
  // Chunk counts per repo (one extra query — cheap at MVP scale)
  const chunkCounts = await db.codeChunk.groupBy({
    by: ['repoId'],
    _count: { id: true },
  })
  const chunkMap = new Map(chunkCounts.map((c) => [c.repoId, c._count.id]))
  return NextResponse.json({
    repos: repos.map((r) => ({
      id: r.id,
      owner: r.owner,
      name: r.name,
      url: r.url,
      description: r.description,
      defaultBranch: r.defaultBranch,
      importedAt: r.importedAt,
      files: r._count.files,
      chunks: chunkMap.get(r.id) ?? 0,
    })),
  })
}

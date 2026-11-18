/**
 * Retrieval service over the indexed code corpus.
 *
 * Loads all CodeChunks (+ their File + Repo) into memory on first use and
 * rebuilds when the corpus signature changes (new seed run). For the MVP
 * scale (30-50 files → a few hundred chunks) in-memory hybrid retrieval is
 * the right call; this seam is where you'd swap in pgvector / Tantivy / a
 * hosted retrieval service for "10k+ repos".
 */
import { db } from '@/lib/db'
import { tokenize } from '@/lib/tokenizer'
import { BM25Index } from '@/lib/bm25'
import {
  getEmbeddingProvider,
  cosine,
  deserializeVector,
  type EmbeddingProvider,
} from '@/lib/embeddings'
import { fuseHits, type SearchHit } from '@/lib/hybrid-search'

export interface RetrievedCodeChunk {
  chunkId: string
  fileId: string
  repoId: string
  repoOwner: string
  repoName: string
  repoUrl: string
  repoDefaultBranch: string
  filePath: string
  language: string
  symbolName: string | null
  startLine: number
  endLine: number
  content: string
  bm25Score: number
  vectorScore: number
  fusedScore: number
}

const TOP_K = 12

interface CorpusState {
  chunkIds: string[]
  fileIds: string[]
  repoIds: string[]
  repoOwners: string[]
  repoNames: string[]
  repoUrls: string[]
  repoBranches: string[]
  filePaths: string[]
  languages: string[]
  symbolNames: (string | null)[]
  startLines: number[]
  endLines: number[]
  contents: string[]
  tokens: string[][]
  vectors: Float32Array[]
  bm25: BM25Index
  signature: string
}

let corpusState: CorpusState | null = null

async function computeCorpusSignature(): Promise<string> {
  const count = await db.codeChunk.count()
  const latest = await db.codeChunk.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return `${count}:${latest?.id ?? ''}`
}

async function loadCorpus(provider: EmbeddingProvider): Promise<CorpusState> {
  const chunks = await db.codeChunk.findMany({
    include: {
      file: { select: { path: true, language: true } },
      repo: { select: { owner: true, name: true, url: true, defaultBranch: true } },
    },
    orderBy: { id: 'asc' },
  })

  const s: CorpusState = {
    chunkIds: [], fileIds: [], repoIds: [], repoOwners: [], repoNames: [],
    repoUrls: [], repoBranches: [], filePaths: [], languages: [], symbolNames: [],
    startLines: [], endLines: [], contents: [], tokens: [], vectors: [],
    bm25: new BM25Index([]),
    signature: '',
  }

  for (const c of chunks) {
    s.chunkIds.push(c.id)
    s.fileIds.push(c.fileId)
    s.repoIds.push(c.repoId)
    s.repoOwners.push(c.repo.owner)
    s.repoNames.push(c.repo.name)
    s.repoUrls.push(c.repo.url)
    s.repoBranches.push(c.repo.defaultBranch)
    s.filePaths.push(c.file.path)
    s.languages.push(c.language)
    s.symbolNames.push(c.symbolName)
    s.startLines.push(c.startLine)
    s.endLines.push(c.endLine)
    s.contents.push(c.content)
    try {
      s.tokens.push(JSON.parse(c.tokens) as string[])
    } catch {
      s.tokens.push(tokenize(c.content))
    }
    try {
      s.vectors.push(deserializeVector(c.embedding))
    } catch {
      s.vectors.push(await provider.embed(c.content))
    }
  }
  s.bm25 = new BM25Index(s.tokens.map((t, i) => ({ id: s.chunkIds[i], tokens: t })))
  s.signature = await computeCorpusSignature()
  return s
}

async function getCorpus(): Promise<CorpusState> {
  const sig = await computeCorpusSignature()
  if (corpusState && corpusState.signature === sig) {
    return corpusState
  }
  const provider = getEmbeddingProvider()
  corpusState = await loadCorpus(provider)
  return corpusState
}

/** Force a reload on next access — called after seeding. */
export function invalidateCorpus() {
  corpusState = null
}

export interface RetrieveOptions {
  filterLanguages?: string[]
  filterRepoIds?: string[]
  topK?: number
}

export async function retrieve(
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedCodeChunk[]> {
  const topK = opts.topK ?? TOP_K
  const corpus = await getCorpus()
  if (!corpus.chunkIds.length) return []

  const langFilter =
    opts.filterLanguages && opts.filterLanguages.length > 0
      ? new Set(opts.filterLanguages.map((l) => l.toLowerCase()))
      : null
  const repoFilter =
    opts.filterRepoIds && opts.filterRepoIds.length > 0
      ? new Set(opts.filterRepoIds)
      : null

  // Build the filtered index slice
  const filteredIdx: number[] = []
  for (let i = 0; i < corpus.chunkIds.length; i++) {
    if (langFilter && !langFilter.has(corpus.languages[i].toLowerCase())) continue
    if (repoFilter && !repoFilter.has(corpus.repoIds[i])) continue
    filteredIdx.push(i)
  }
  if (!filteredIdx.length) return []

  const bm25Hits = (() => {
    const filteredDocs = filteredIdx.map((i) => ({
      id: corpus.chunkIds[i],
      tokens: corpus.tokens[i],
    }))
    const sub = new BM25Index(filteredDocs)
    return sub.search(query, topK * 2)
  })()

  const provider = getEmbeddingProvider()
  const qVec = await provider.embed(query)

  const vecHits = filteredIdx
    .map((i) => ({
      id: corpus.chunkIds[i],
      score: cosine(qVec, corpus.vectors[i]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 2)

  const fused: SearchHit[] = fuseHits(
    bm25Hits.map((h) => ({ id: h.id, score: h.score })),
    vecHits.map((h) => ({ id: h.id, score: h.score })),
    { topK },
  )

  const idToIdx = new Map(corpus.chunkIds.map((id, i) => [id, i]))
  return fused.map((f): RetrievedCodeChunk => {
    const i = idToIdx.get(f.id)!
    return {
      chunkId: corpus.chunkIds[i],
      fileId: corpus.fileIds[i],
      repoId: corpus.repoIds[i],
      repoOwner: corpus.repoOwners[i],
      repoName: corpus.repoNames[i],
      repoUrl: corpus.repoUrls[i],
      repoDefaultBranch: corpus.repoBranches[i],
      filePath: corpus.filePaths[i],
      language: corpus.languages[i],
      symbolName: corpus.symbolNames[i],
      startLine: corpus.startLines[i],
      endLine: corpus.endLines[i],
      content: corpus.contents[i],
      bm25Score: f.bm25Score,
      vectorScore: f.vectorScore,
      fusedScore: f.fusedScore,
    }
  })
}

export interface CorpusStats {
  repos: number
  files: number
  chunks: number
}

export async function corpusStats(): Promise<CorpusStats> {
  const [repos, files, chunks] = await Promise.all([
    db.repo.count(),
    db.codeFile.count(),
    db.codeChunk.count(),
  ])
  return { repos, files, chunks }
}

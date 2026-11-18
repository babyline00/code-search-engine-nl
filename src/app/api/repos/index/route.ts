import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * POST /api/repos/index — STRETCH goal for MVP.
 *
 * Indexing a brand-new public repo on demand (clone → chunk → embed → insert)
 * is a documented stretch goal. For MVP we ship a 501 so the UI can show the
 * affordance without pretending the backend is wired up.
 *
 * Planned implementation: POST body `{ url }` → resolve owner/repo/branch →
 * shallow clone via `git archive`/tarball → walk tree → reuse `seedDatabase()`
 * internals per-file → `invalidateCorpus()`.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'On-demand repo indexing is a stretch goal (not implemented in MVP).',
      hint: 'Pre-indexed repos are seeded automatically from scripts/sample-repos/ on first search.',
    },
    { status: 501 },
  )
}

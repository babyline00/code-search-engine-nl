#!/usr/bin/env bun
/**
 * Idempotent seed entry point.
 *
 * Reads every file under scripts/sample-repos/ (matched against the manifest
 * in src/lib/seeder.ts), chunks + tokenises + embeds each file, and inserts
 * Repo / CodeFile / CodeChunk rows into the SQLite DB. Re-running skips repos
 * that are already present and refreshes files for repos that are present.
 *
 * Usage:
 *   bun run seed
 *   (or: bun run scripts/seed.ts)
 *
 * Env: DATABASE_URL must point at an absolute SQLite path — see .env.
 * The package.json `seed` script already inlines `DATABASE_URL="$(pwd)/db/custom.db"`.
 */
import { seedDatabase } from '../src/lib/seeder'
import { corpusStats } from '../src/lib/retrieval'

async function main() {
  console.log('[seed] starting…')
  const result = await seedDatabase()
  console.log(
    `[seed] repos touched=${result.repos} (skipped=${result.skippedRepos}) ` +
      `files=${result.files} chunks=${result.chunks}`,
  )
  const stats = await corpusStats()
  console.log(
    `[seed] corpus now: ${stats.repos} repos · ${stats.files} files · ${stats.chunks} chunks`,
  )
  console.log('[seed] done.')
}

main().catch((e) => {
  console.error('[seed] failed:', e)
  process.exit(1)
})

/**
 * Database seeder.
 *
 * Walks `scripts/sample-repos/<owner>-<repo>/...` on disk, chunks every file
 * with the language-aware chunker, tokenises + embeds each chunk, and inserts
 * Repo → CodeFile → CodeChunk rows.
 *
 * Idempotent: re-running skips repos already present (matched by
 * `owner+name`) and refreshes files/chunks for repos that are present. Safe
 * to call from `bun run seed` and from `ensureSeeded()` on the first
 * `/api/search` request when the DB is empty.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { db } from './db'
import { detectLanguage } from './language-detect'
import { chunkCode } from './chunker'
import { tokenize } from './tokenizer'
import {
  getEmbeddingProvider,
  serializeVector,
} from './embeddings'
import { invalidateCorpus } from './retrieval'

export interface RepoManifestEntry {
  owner: string
  repo: string
  branch: string
  description: string
  /** Directory name under scripts/sample-repos/. Defaults to `${owner}-${repo}`. */
  dir?: string
}

export const REPO_MANIFEST: RepoManifestEntry[] = [
  { owner: 'axios', repo: 'axios', branch: 'master', description: 'Promise-based HTTP client for the browser and node.js' },
  { owner: 'chatwoot', repo: 'chatwoot', branch: 'develop', description: 'Open-source customer engagement suite, an alternative to Intercom/Zendesk' },
  { owner: 'clap-rs', repo: 'clap', branch: 'master', description: 'A full-featured, fast command-line argument parser for Rust' },
  { owner: 'd3', repo: 'd3', branch: 'main', description: 'Bring data to life with SVG, Canvas and HTML' },
  { owner: 'django', repo: 'django', branch: 'main', description: 'The web framework for perfectionists with deadlines (Python)' },
  { owner: 'expressjs', repo: 'express', branch: 'master', description: 'Fast, unopinionated, minimalist web framework for Node.js' },
  { owner: 'facebook', repo: 'react', branch: 'main', description: 'The library for web and native user interfaces (React)' },
  { owner: 'gin-gonic', repo: 'gin', branch: 'master', description: 'Gin is a HTTP web framework written in Go' },
  { owner: 'golang-jwt', repo: 'jwt', branch: 'main', description: 'Go implementation of JSON Web Tokens' },
  { owner: 'pallets', repo: 'flask', branch: 'main', description: 'The Python micro framework for building web applications' },
  { owner: 'pallets', repo: 'jinja', branch: 'main', description: 'A very fast and expressive Python template engine' },
  { owner: 'pallets', repo: 'werkzeug', branch: 'main', description: 'The comprehensive WSGI web application library (Python)' },
  { owner: 'pmndrs', repo: 'zustand', branch: 'main', description: 'Bear necessities for state management in React' },
  { owner: 'pytest-dev', repo: 'pytest', branch: 'main', description: 'The pytest framework makes it easy to write small tests (Python)' },
  { owner: 'rayon-rs', repo: 'rayon', branch: 'master', description: 'Rayon: A data parallelism library for Rust' },
  { owner: 'semantic-release', repo: 'semantic-release', branch: 'master', description: 'Fully automated version management and package publishing' },
  { owner: 'shadcn-ui', repo: 'ui', branch: 'main', description: 'Beautifully designed components built with Radix UI and Tailwind CSS' },
  { owner: 'tanstack', repo: 'react-query', branch: 'main', description: 'Powerful asynchronous state management for React' },
  { owner: 'tanstack', repo: 'table', branch: 'main', description: 'Headless UI for building powerful tables & datagrids' },
  { owner: 'trpc', repo: 'trpc', branch: 'main', description: 'Move Fast and Break Nothing — end-to-end typesafe APIs' },
  { owner: 'unjs', repo: 'ofetch', branch: 'main', description: 'A better fetch experience for Node.js, browser and workers' },
  { owner: 'vercel', repo: 'swr', branch: 'main', description: 'React Hooks for Data Fetching' },
  { owner: 'vuejs', repo: 'core', branch: 'main', description: 'Vue.js — the progressive JavaScript framework' },
  { owner: 'withastro', repo: 'astro', branch: 'main', description: 'The web framework for content-driven websites' },
]

function sampleRoot(): string {
  const cwdPath = path.resolve(process.cwd(), 'scripts/sample-repos')
  if (fs.existsSync(cwdPath)) return cwdPath
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const rel = path.resolve(here, '../../scripts/sample-repos')
    if (fs.existsSync(rel)) return rel
  } catch {
    /* ignore — ESM __dirname unavailable */
  }
  return cwdPath
}

function walkDir(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length) {
    const cur = stack.pop()!
    for (const name of fs.readdirSync(cur)) {
      const full = path.join(cur, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) stack.push(full)
      else out.push(full)
    }
  }
  return out
}

export interface SeedResult {
  repos: number
  files: number
  chunks: number
  skippedRepos: number
}

export async function seedDatabase(): Promise<SeedResult> {
  const root = sampleRoot()
  if (!fs.existsSync(root)) {
    return { repos: 0, files: 0, chunks: 0, skippedRepos: 0 }
  }
  const provider = getEmbeddingProvider()
  let filesInserted = 0
  let chunksInserted = 0
  let reposTouched = 0
  let skippedRepos = 0

  for (const entry of REPO_MANIFEST) {
    const dirName = entry.dir ?? `${entry.owner}-${entry.repo}`
    const dir = path.resolve(root, dirName)
    if (!fs.existsSync(dir)) {
      skippedRepos += 1
      continue
    }
    const url = `https://github.com/${entry.owner}/${entry.repo}`
    // Idempotent upsert of the Repo row
    let repo = await db.repo.findUnique({
      where: { owner_name: { owner: entry.owner, name: entry.repo } },
    })
    if (!repo) {
      repo = await db.repo.create({
        data: {
          owner: entry.owner,
          name: entry.repo,
          url,
          description: entry.description,
          defaultBranch: entry.branch,
        },
      })
    } else {
      // refresh metadata in case the manifest changed
      await db.repo.update({
        where: { id: repo.id },
        data: {
          url,
          description: entry.description,
          defaultBranch: entry.branch,
        },
      })
    }
    reposTouched += 1

    const files = walkDir(dir)
    for (const absPath of files) {
      const relPath = path.relative(dir, absPath).split(path.sep).join('/')
      const content = fs.readFileSync(absPath, 'utf8')
      const language = detectLanguage(relPath)
      const lineCount = content.replace(/\r\n/g, '\n').split('\n').length

      let file = await db.codeFile.findUnique({
        where: { repoId_path: { repoId: repo.id, path: relPath } },
      })
      if (file) {
        // Refresh: wipe old chunks, then update file meta
        await db.codeChunk.deleteMany({ where: { fileId: file.id } })
        file = await db.codeFile.update({
          where: { id: file.id },
          data: { language, content, lineCount },
        })
      } else {
        file = await db.codeFile.create({
          data: { repoId: repo.id, path: relPath, language, content, lineCount },
        })
      }
      filesInserted += 1

      const chunks = chunkCode(content, language)
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]
        const tokens = tokenize(c.content)
        const vec = await provider.embed(c.content)
        await db.codeChunk.create({
          data: {
            fileId: file.id,
            repoId: repo.id,
            ordinal: c.ordinal,
            symbolName: c.symbolName,
            startLine: c.startLine,
            endLine: c.endLine,
            content: c.content,
            tokens: JSON.stringify(tokens),
            embedding: serializeVector(vec),
            language,
          },
        })
        chunksInserted += 1
      }
    }
  }

  invalidateCorpus()
  return {
    repos: reposTouched,
    files: filesInserted,
    chunks: chunksInserted,
    skippedRepos,
  }
}

/**
 * Auto-seed on first /api/search call if the DB is empty. Safe to call on
 * every request — it short-circuits when at least one repo is present.
 */
export async function ensureSeeded(): Promise<void> {
  const count = await db.repo.count()
  if (count > 0) return
  await seedDatabase()
}

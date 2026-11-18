# Code Search Engine (NL)

Search across pre-indexed public GitHub repositories in **natural language**.
Type a question in plain English, get back **ranked code-snippet cards** — each
with the repo name, file path, exact line range, the code itself in a
read-only `<pre>` block, an **Open on GitHub** deep link, and an
**Explain this snippet** button that calls an LLM with the snippet + your
query and caches the explanation in the DB.

> Rebuild of Project #65 from the 110-project portfolio plan. Built fresh in
> this repo after the original was lost to a sandbox recycle.

---

## MVP scope

- **Pre-index 30–50 short, well-known files** from public repos (React,
  Next.js, Prisma, Bun, Zod, Zustand, Vue, Express, Axios, Gin, clap, serde,
  Django, Flask, pytest, …). Files are fetched with `curl` from
  `raw.githubusercontent.com` into `scripts/sample-repos/` and seeded into
  SQLite on first search (or explicitly via `bun run seed`).
- **NL query → code snippets**: hybrid **BM25 + vector similarity** with
  Reciprocal Rank Fusion. Default embedder is a deterministic hashing-trick
  vector (zero external API keys required); an OpenAI-compatible provider can
  be dropped in via env vars.
- **Per-language filter** sidebar: TypeScript, TSX, JavaScript, JSX, Python,
  Go, Rust, Markdown.
- **Per-repo filter** sidebar.
- **Snippet cards**: repo · file path · line range · code (`<pre>`, no syntax
  highlighter dependency for MVP) · **Open on GitHub** link · **Explain this
  snippet** button.
- **AI explanation**: calls the LLM with the snippet + query, returns a 2-3
  sentence explanation, cached in the DB keyed by `(chunkId, sha256(query))`.
- **Auto-seed** on the first `/api/search` call if the DB is empty.

> **Stretch goal (not in MVP):** index 10k+ public repos on demand, a real
> `tree-sitter` AST chunker, a React Flow dependency graph, CodeSandbox
> embeds, user collections, multi-repo federation. The `POST /api/repos/index`
> endpoint returns **501 Not Implemented** for MVP.

---

## Features

- **Hybrid retrieval** — BM25 keyword scores fused with vector cosine scores
  via Reciprocal Rank Fusion (RRF). RRF is parameter-light and robust to the
  score-scale mismatch between sparse and dense retrievers.
- **Language-aware chunking** — TS/JS/TSX/JSX files are split at
  `function`/`class`/arrow-const declaration boundaries (an "AST-lite"
  regex chunker that is the seam where a real `tree-sitter` parser plugs in).
  Markdown is split by heading. Python/Go/Rust/unknown use fixed-size line
  windows with overlap.
- **Code-specific tokenizer** — preserves `.`, `_`, `$` inside identifiers
  (`router.push`, `_privateField`, `$el`), keeps 1-2 char tokens (loop vars
  `i`, `j`), and additionally emits dot/underscore sub-tokens for recall.
- **Per-chunk line range** — every chunk carries `[startLine, endLine]` so
  the "Open on GitHub" link can deep-link to `#L12-L45`.
- **LLM explanation cache** — `Explanation` rows keyed by
  `(chunkId, sha256(query))` so repeated "Explain this snippet" clicks for the
  same query return instantly.
- **Offline-friendly** — the default hashing embedder + mock explainer keep
  the app fully runnable with zero external API keys; set `ZAI_API_KEY` /
  `EMBEDDINGS_API_KEY` to enable real LLM/embedding calls.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router) + **TypeScript 5** |
| Styling | **Tailwind CSS 4** + **shadcn/ui** (New York) + Lucide icons |
| Database | **Prisma 6** + **SQLite** (zero external services in the sandbox) |
| Retrieval | In-memory **BM25** + hashing-vector (or OpenAI-compatible embeddings) + **RRF** fusion |
| AI | **z-ai-web-dev-sdk** (sandbox LLM gateway) for explanations; mock fallback |
| Chunker | regex "AST-lite" for TS/JS; `tree-sitter` + `tree-sitter-typescript` declared as deps and ready to plug in |
| Tests | **`bun test`** (Bun-native test runner) |

---

## Architecture

```
                         ┌──────────────────────────────────────────────┐
                         │                  Browser (/)                   │
                         │  search bar · language+repo filter chips ·     │
                         │  ranked snippet cards · inline explain panel   │
                         └───────────────┬──────────────────────────────┘
                                         │ fetch (relative URLs)
                                         ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                       Next.js 16 Route Handlers                      │
   │  POST /api/search   POST /api/explain   GET /api/repos   GET /api/stats │
   │  POST /api/repos/index → 501 (stretch)                                │
   └───────┬─────────────────────┬───────────────────┬──────────────────┘
           │                     │                   │
           ▼                     ▼                   ▼
   ┌───────────────┐    ┌─────────────────┐  ┌──────────────┐
   │  retrieval.ts │    │    ai.ts         │  │  seeder.ts   │
   │  (in-memory)  │    │  explain + cache │  │  ensureSeeded│
   │  BM25 + vec + │    │  LLM or mock     │  │  on first hit │
   │  RRF fusion   │    │  sha256(query)   │  └──────┬───────┘
   └───────┬───────┘    └────────┬────────┘         │
           │                     │                  │
           ▼                     ▼                  ▼
   ┌───────────────────────────────────────────────────────────┐
   │                Prisma 6 + SQLite (custom.db)               │
   │  Repo 1──* CodeFile 1──* CodeChunk      Explanation         │
   │                                          SearchLog          │
   └───────────────────────────────────────────────────────────┘
           ▲
           │  scripts/sample-repos/<owner>-<repo>/…  (curl-fetched)
   ┌───────┴────────┐  chunkCode() → tokenize() → hashingEmbed()
   │  seed pipeline │  → Repo/CodeFile/CodeChunk rows
   └────────────────┘
```

Retrieval is **in-memory** — the corpus is loaded once into parallel arrays
(`chunkIds`, `tokens`, `vectors`, …) and cached, rebuilt only when the corpus
signature (`count : latestChunkId`) changes. For 30-50 files this is a few
hundred chunks and well within memory; the same seam swaps in
pgvector / Tantivy / a hosted retrieval service for the 10k-repo stretch goal.

---

## Setup

### Prerequisites

- **Bun** (runtime + test runner)
- **Node 18+** (for Next.js)

### Install + seed

```bash
# from the repo root
bun install                       # install deps
cp .env.example .env               # then edit .env to set absolute DATABASE_URL

# create the SQLite DB + Prisma client
bun run db:generate
bun run db:push

# seed the 30-50 sample files into the DB (idempotent — safe to re-run)
bun run seed
```

`bun run dev` starts Next.js on port 3000. The first `/api/search` call also
auto-seeds if the DB is empty, so you can skip the explicit `bun run seed` for
a smoke test.

### Env vars

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | **Absolute** SQLite path, e.g. `file:/abs/path/custom.db`. The `package.json` `db:*` scripts inline `DATABASE_URL="$(pwd)/db/custom.db"`. |
| `ZAI_API_KEY` | no | — | Set to enable real LLM explanations via the z-ai-web-dev-sdk gateway. |
| `EMBEDDINGS_API_KEY` / `OPENAI_API_KEY` | no | hashing embedder | Set to use a real OpenAI-compatible embeddings endpoint. |
| `EMBEDDINGS_BASE_URL` | no | `https://api.openai.com/v1` | OpenAI / Azure / OpenRouter gateway. |
| `EMBEDDINGS_MODEL` | no | `text-embedding-3-small` | Embedding model name. |
| `CSE_DISABLE_LLM` | no | unset | `1` forces the mock explainer (offline/tests). |

---

## Tests

```bash
bun test
```

84 tests across 9 files (Bun-native test runner, no Jest config). The test
suite is **pure** — no DB, no network, no external SDK. The LLM provider is
mocked in `ai.test.ts`; `tree-sitter` is declared but the chunker tests use the
regex "AST-lite" path so they run with zero native deps.

| File | Covers |
| --- | --- |
| `chunker.test.ts` | `detectTSSymbol`, TS function/class anchor chunking, Python line-window chunking, markdown heading chunking, preamble handling, fallback |
| `tokenizer.test.ts` | dots/underscores/dollar-signs preserved, short 1-2 char tokens kept, pure-symbol tokens dropped, term frequencies |
| `embeddings.test.ts` | fixed dim, deterministic, L2-normalised, cosine overlap, serialize/deserialize round-trip |
| `bm25.test.ts` | code-specific: `useState` ranks React first, `express` ranks Express first, `rust parse` ranks Rust first, topK, empty corpus |
| `hybrid-search.test.ts` | Reciprocal Rank Fusion + `fuseHits` |
| `ai.test.ts` | `buildExplanationPrompt` (2-3 sentences, query context, snippet, truncation), mock provider, `explanationQueryHash` |
| `url-builder.test.ts` | `buildGitHubFileUrl` (multi-line, single-line, no-range, canary branch), raw URL |
| `language-detect.test.ts` | all 8 extensions + `.d.ts`→ts, case-insensitive, unknown, labels |
| `sha256.test.ts` | NIST FIPS 180-4 vectors (`""`, `"abc"`, `"a"`), determinism, 64-hex format, UTF-8 |

---

## Project structure

```
65-code-search-engine-nl/
├─ prisma/schema.prisma            # Repo / CodeFile / CodeChunk / Explanation / SearchLog
├─ scripts/
│  ├─ seed.ts                      # bun run seed entry — calls seedDatabase()
│  └─ sample-repos/                # 32 curl-fetched real source files
│     ├─ axios-axios/lib/axios.js
│     ├─ facebook-react/packages/shared/ReactSymbols.js
│     ├─ pmndrs-zustand/src/…
│     ├─ shadcn-ui-ui/apps/v4/registry/new-york-v4/ui/*.tsx
│     ├─ django-django/django/__init__.py
│     ├─ gin-gonic-gin/mode.go
│     ├─ clap-rs-clap/src/lib.rs
│     └─ …  (24 repos, 7 languages)
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx · page.tsx · globals.css
│  │  └─ api/
│  │     ├─ search/route.ts        POST — ranked snippets, persists SearchLog
│  │     ├─ explain/route.ts       POST — cached LLM explanation
│  │     ├─ repos/route.ts         GET  — indexed repos + counts
│  │     ├─ repos/index/route.ts   POST — 501 (stretch goal)
│  │     └─ stats/route.ts         GET  — corpus overview
│  ├─ components/ui/               shadcn/ui (button, input, card, badge, …)
│  └─ lib/
│     ├─ chunker.ts                language-aware chunker (AST-lite for TS/JS)
│     ├─ tokenizer.ts              code-specific tokenizer (._$ kept, short kept)
│     ├─ embeddings.ts             hashing embedder + OpenAI-compatible provider
│     ├─ bm25.ts                   Okapi BM25
│     ├─ hybrid-search.ts          Reciprocal Rank Fusion
│     ├─ retrieval.ts              in-memory corpus + hybrid retrieve
│     ├─ ai.ts                     buildExplanationPrompt + LLM/mock provider
│     ├─ url-builder.ts            GitHub blob URL + line-range anchor
│     ├─ language-detect.ts        ext → ts/js/tsx/jsx/py/go/rs/md/unknown
│     ├─ sha256.ts                 pure SHA-256 for explanation cache keys
│     ├─ seeder.ts                 REPO_MANIFEST + seedDatabase() + ensureSeeded()
│     ├─ db.ts                     Prisma client singleton
│     └─ __tests__/                9 test files, 84 tests
├─ package.json · tsconfig.json · next.config.ts · postcss.config.mjs
├─ tailwind.config.ts · components.json · eslint.config.mjs
├─ .env.example · .gitignore · LICENSE · README.md
```

---

## Case study: what makes this project non-trivial

### 1. AST-lite chunking for TypeScript/JavaScript

The hardest design call was chunk granularity. A naive line-window chunker
splits a function across two chunks and the "Open on GitHub" link loses
semantic boundaries. A real `tree-sitter` AST chunker would be ideal but
needs native bindings and language grammars — heavy for an MVP and awkward in
the sandbox test runner.

The compromise is an **"AST-lite" regex chunker** (`chunker.ts`):
`detectTSSymbol(line)` recognises `function foo`, `class Foo`,
`const foo = (...) =>`, `const foo = function`, and `const foo = x =>` at the
start of a line. Each anchor becomes a chunk spanning exactly `[anchorLine,
nextAnchorLine - 1]`, carrying the symbol name. A leading preamble (imports,
license header) is its own chunk. Files with no anchors fall back to
line-window chunking. Over-large single symbols (a giant class) are
sub-windowed while the symbol name is preserved on every sub-chunk.

`tree-sitter` and `tree-sitter-typescript` are declared as deps so the
upgrade is a drop-in: replace `detectTSSymbol` with a real tree walk that
emits `CodeChunkData[]` with the same `{ ordinal, symbolName, startLine,
endLine, content }` shape. The tests mock `tree-sitter` and assert against
the regex path, so the contract is locked.

### 2. Code-specific tokenizer

A natural-language tokenizer (the one this project adapted from) strips
`_`, lowercases, and drops 1-char tokens. That is catastrophic for code:
`_privateField` becomes `privatefield` (loses the "private" intent),
`router.push` is shattered into `router` and `push` (loses the
property-access phrase), and loop variables `i`, `j` vanish entirely.

The code tokenizer keeps `.`, `_`, `$` inside tokens, keeps every token with
at least one alphanumeric char (so `i`, `j`, `el`, `fn` survive), and
**additionally** emits the dot/underscore-split sub-tokens for recall. So
`router.push` → `['router.push', 'router', 'push']` and `my_func` →
`['my_func', 'my', 'func']`. BM25 benefits from the IDF-weighted phrase token
while still matching word-level queries. The BM25 test suite asserts that a
`useState` query ranks the React chunk above Express/Python/Go/Rust chunks.

### 3. Explanation cache keyed by `(chunkId, sha256(query))`

The "Explain this snippet" button can be clicked many times for the same
snippet+query. The `Explanation` table has a `@@unique([chunkId, queryHash])`
constraint and the route does a cache lookup before calling the LLM. The hash
is a **pure, synchronous SHA-256** (`sha256.ts`) so the cache key derivation
is fully deterministic and unit-testable with NIST vectors, independent of
Web Crypto availability.

### What I'd do differently with more time

- **Real `tree-sitter` AST chunker** for TS/JS/TSX/JSX and `tree-sitter-python`
  / `tree-sitter-go` / `tree-sitter-rust` for the others — the regex chunker
  misses methods inside classes and JSX component boundaries.
- **React Flow dependency graph** — render a node per chunk, edges for
  imports / call relationships, so the user can navigate the call graph
  visually instead of only the flat ranked list.
- **CodeSandbox / StackBlitz embeds** — a "Open in CodeSandbox" button on
  each card that spins up a runnable sandbox for the snippet's file.
- **User collections** — authenticated "save this snippet to a collection"
  with per-user vector indexes (NextAuth is available in the stack).
- **Multi-repo federation** — shard the corpus across nodes; replace the
  in-memory BM25/vector with pgvector + a Tantivy-style sparse index.
- **On-demand repo indexing** — implement `POST /api/repos/index` with a
  `git archive`/tarball shallow clone + tree walk reusing the seed pipeline.

### Resume bullet

> Built a natural-language code search engine on Next.js 16 + TypeScript +
> Prisma/SQLite that pre-indexes 30+ public GitHub repos, hybrid-ranks
> snippets with BM25 + hashing-vector similarity via Reciprocal Rank Fusion,
> language-aware AST-lite chunking for TS/JS, a code-specific tokenizer that
> preserves identifier punctuation, and an LLM "Explain this snippet" feature
> with a SHA-256-keyed explanation cache — 84 passing Bun tests covering
> chunking, retrieval, prompt construction, URL building, and language
> detection.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Push to GitHub

> Do **not** push during development. When ready to publish:

```bash
gh repo create code-search-engine-nl --public --source=. --remote=origin --push
```

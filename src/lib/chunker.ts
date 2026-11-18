/**
 * Code-aware chunker.
 *
 * Strategy per language:
 *  - ts / js / tsx / jsx: anchor-based "AST-lite" chunking. Top-level
 *    `function` / `class` / arrow-const declarations are detected by regex
 *    and each becomes its own chunk carrying the symbol name and exact line
 *    range. A leading preamble (imports, license header) is its own chunk.
 *    This is the seam where a real `tree-sitter` AST would plug in — the
 *    deps are declared in package.json but tests mock tree-sitter, so the
 *    regex implementation is the production path for MVP.
 *  - md: heading-based chunking (each `#`-section is a chunk).
 *  - py / go / rs / unknown: fixed-size line windows with overlap.
 *
 * All chunks are 1-indexed by line and include their exact `[startLine,endLine]`
 * range so the UI can render "Open on GitHub" anchors like `#L12-L45`.
 */

export interface CodeChunkData {
  ordinal: number
  symbolName: string | null
  startLine: number
  endLine: number
  content: string
}

const DEFAULT_WINDOW_LINES = 40
const DEFAULT_OVERLAP_LINES = 5
const MAX_CHUNK_LINES = 150

/**
 * Detect a top-level TypeScript/JavaScript symbol declaration on a line.
 * Returns the symbol name, or null if the line is not an anchor.
 *
 * Recognised forms:
 *   function foo(
 *   async function foo(
 *   export function foo(
 *   class Foo
 *   export default class Foo
 *   const foo = (...) =>  ...
 *   const foo = async (...) => ...
 *   const foo = function ...
 *   const foo = x => ...
 */
export function detectTSSymbol(line: string): string | null {
  let m = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/)
  if (m) return m[1]
  m = line.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/)
  if (m) return m[1]
  m = line.match(
    /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
  )
  if (m) return m[1]
  m = line.match(
    /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\w+\s*=>/,
  )
  if (m) return m[1]
  m = line.match(
    /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function\b/,
  )
  if (m) return m[1]
  return null
}

/** Split a TS/JS/TSX/JSX source into anchor-based chunks. */
function chunkAnchoredTS(content: string): CodeChunkData[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const anchors: { line: number; name: string }[] = []
  lines.forEach((line, i) => {
    const name = detectTSSymbol(line)
    if (name) anchors.push({ line: i + 1, name })
  })
  if (anchors.length === 0) {
    return lineWindowChunks(lines, DEFAULT_WINDOW_LINES, DEFAULT_OVERLAP_LINES)
  }
  const chunks: CodeChunkData[] = []
  // Preamble (imports/comments before the first declaration)
  if (anchors[0].line > 1) {
    const body = lines.slice(0, anchors[0].line - 1).join('\n').trimEnd()
    if (body.trim().length > 0) {
      chunks.push({
        ordinal: 0,
        symbolName: null,
        startLine: 1,
        endLine: anchors[0].line - 1,
        content: body,
      })
    }
  }
  // One chunk per anchor: from its line to the line before the next anchor
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].line
    const end = i + 1 < anchors.length ? anchors[i + 1].line - 1 : lines.length
    const raw = lines.slice(start - 1, end).join('\n').trimEnd()
    if (raw.trim().length === 0) continue
    // Hard-cap: if a single symbol is enormous (e.g. a giant class), split it
    // into line windows while keeping the symbol name on every sub-chunk.
    const lineCount = end - start + 1
    if (lineCount > MAX_CHUNK_LINES) {
      const sub = lineWindowChunks(
        lines.slice(start - 1, end),
        DEFAULT_WINDOW_LINES,
        DEFAULT_OVERLAP_LINES,
      )
      for (const s of sub) {
        chunks.push({
          ...s,
          symbolName: anchors[i].name,
          startLine: start + s.startLine - 1,
          endLine: start + s.endLine - 1,
        })
      }
    } else {
      chunks.push({
        ordinal: 0,
        symbolName: anchors[i].name,
        startLine: start,
        endLine: end,
        content: raw,
      })
    }
  }
  chunks.forEach((c, i) => (c.ordinal = i + 1))
  return chunks
}

/**
 * Fixed-size line-window chunker with overlap. Used for languages we don't
 * parse with anchors (py / go / rs / unknown) and as a fallback.
 */
export function lineWindowChunks(
  lines: string[],
  size: number = DEFAULT_WINDOW_LINES,
  overlap: number = DEFAULT_OVERLAP_LINES,
): CodeChunkData[] {
  const total = lines.length
  if (total === 0) return []
  const chunks: CodeChunkData[] = []
  let start = 0
  let ordinal = 0
  while (start < total) {
    const end = Math.min(start + size, total)
    const body = lines.slice(start, end).join('\n').trimEnd()
    if (body.trim().length > 0) {
      ordinal += 1
      chunks.push({
        ordinal,
        symbolName: null,
        startLine: start + 1,
        endLine: end,
        content: body,
      })
    }
    if (end >= total) break
    start = Math.max(start + 1, end - overlap)
  }
  return chunks
}

/** Split markdown into heading-bounded chunks (heading text becomes symbolName). */
export function splitByHeadingMd(content: string): CodeChunkData[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const anchors: { line: number; name: string }[] = []
  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.*)$/)
    if (m) anchors.push({ line: i + 1, name: m[2].trim() })
  })
  if (anchors.length === 0) {
    return lineWindowChunks(lines, DEFAULT_WINDOW_LINES, DEFAULT_OVERLAP_LINES)
  }
  const chunks: CodeChunkData[] = []
  if (anchors[0].line > 1) {
    const body = lines.slice(0, anchors[0].line - 1).join('\n').trimEnd()
    if (body.trim().length > 0) {
      chunks.push({
        ordinal: 0,
        symbolName: null,
        startLine: 1,
        endLine: anchors[0].line - 1,
        content: body,
      })
    }
  }
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].line
    const end = i + 1 < anchors.length ? anchors[i + 1].line - 1 : lines.length
    const raw = lines.slice(start - 1, end).join('\n').trimEnd()
    if (raw.trim().length === 0) continue
    chunks.push({
      ordinal: 0,
      symbolName: anchors[i].name,
      startLine: start,
      endLine: end,
      content: raw,
    })
  }
  chunks.forEach((c, i) => (c.ordinal = i + 1))
  return chunks
}

/**
 * Top-level entry: chunk a source file by language.
 * `language` is one of the values returned by `detectLanguage` (ts/js/tsx/jsx/
 * py/go/rs/md/unknown).
 */
export function chunkCode(
  content: string,
  language: string,
): CodeChunkData[] {
  if (!content) return []
  switch (language) {
    case 'ts':
    case 'js':
    case 'tsx':
    case 'jsx':
      return chunkAnchoredTS(content)
    case 'md':
      return splitByHeadingMd(content)
    case 'py':
    case 'go':
    case 'rs':
    case 'unknown':
    default:
      return lineWindowChunks(
        content.replace(/\r\n/g, '\n').split('\n'),
        DEFAULT_WINDOW_LINES,
        DEFAULT_OVERLAP_LINES,
      )
  }
}

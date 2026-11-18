import { test, expect, describe } from 'bun:test'
import {
  chunkCode,
  detectTSSymbol,
  lineWindowChunks,
  splitByHeadingMd,
} from '../chunker'

describe('detectTSSymbol', () => {
  test('detects named function declaration', () => {
    expect(detectTSSymbol('function foo() {')).toBe('foo')
  })
  test('detects async exported function', () => {
    expect(detectTSSymbol('export async function fetchUser(id: string) {')).toBe(
      'fetchUser',
    )
  })
  test('detects class declaration', () => {
    expect(detectTSSymbol('export class UserService {')).toBe('UserService')
  })
  test('detects arrow const', () => {
    expect(detectTSSymbol('const useToggle = (init = false) => {')).toBe(
      'useToggle',
    )
  })
  test('detects single-arg arrow const', () => {
    expect(detectTSSymbol('const double = x => x * 2')).toBe('double')
  })
  test('detects const function expression', () => {
    expect(detectTSSymbol('const handler = function () {')).toBe('handler')
  })
  test('returns null for a non-anchor line', () => {
    expect(detectTSSymbol('  return 42')).toBeNull()
    expect(detectTSSymbol('import { foo } from "bar"')).toBeNull()
    expect(detectTSSymbol('')).toBeNull()
  })
})

describe('chunkCode — TypeScript (AST-lite, anchor-based)', () => {
  test('splits a TS file into one named chunk per top-level function', () => {
    const src = [
      "import { foo } from 'bar'",
      '',
      'export function alpha() {',
      '  return 1',
      '}',
      '',
      'export function beta() {',
      '  return 2',
      '}',
      '',
    ].join('\n')
    const chunks = chunkCode(src, 'ts')
    const named = chunks.filter((c) => c.symbolName)
    expect(named.map((c) => c.symbolName)).toEqual(['alpha', 'beta'])
    // alpha chunk should span from its line to the line before beta
    const alpha = chunks.find((c) => c.symbolName === 'alpha')!
    expect(alpha.startLine).toBe(3)
    expect(alpha.endLine).toBeGreaterThanOrEqual(5)
  })

  test('splits a TSX file by class declaration', () => {
    const src = [
      "import React from 'react'",
      '',
      'export class Button {',
      '  render() { return null }',
      '}',
    ].join('\n')
    const chunks = chunkCode(src, 'tsx')
    const cls = chunks.find((c) => c.symbolName === 'Button')
    expect(cls).toBeDefined()
    expect(cls!.startLine).toBe(3)
  })

  test('preamble (imports before first declaration) is its own chunk with null symbol', () => {
    const src = [
      '// license header',
      "import { foo } from 'bar'",
      '',
      'export function main() { return 0 }',
    ].join('\n')
    const chunks = chunkCode(src, 'ts')
    const preamble = chunks.find((c) => c.symbolName === null)
    expect(preamble).toBeDefined()
    expect(preamble!.endLine).toBeLessThan(
      chunks.find((c) => c.symbolName === 'main')!.startLine,
    )
  })

  test('falls back to line-window chunking when no anchors are found', () => {
    const src = Array.from({ length: 100 }, (_, i) => `// line ${i + 1}`).join(
      '\n',
    )
    const chunks = chunkCode(src, 'ts')
    expect(chunks.length).toBeGreaterThan(1)
    // every chunk has null symbolName (no anchors)
    expect(chunks.every((c) => c.symbolName === null)).toBe(true)
  })
})

describe('chunkCode — Python (line-based)', () => {
  test('splits a Python file into line windows with no symbol names', () => {
    const src = [
      'def alpha():',
      '    return 1',
      '',
      'def beta():',
      '    return 2',
      '',
    ].join('\n')
    const chunks = chunkCode(src, 'py')
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks.every((c) => c.symbolName === null)).toBe(true)
    // line ranges are 1-indexed and contiguous-ish
    expect(chunks[0].startLine).toBe(1)
  })
})

describe('chunkCode — markdown (heading-based)', () => {
  test('splitsByHeadingMd produces one chunk per heading', () => {
    const md = '# Title\nintro\n## Section A\nfoo\n## Section B\nbar'
    const chunks = splitByHeadingMd(md)
    expect(chunks.map((c) => c.symbolName)).toEqual(['Title', 'Section A', 'Section B'])
  })
})

describe('chunkCode — misc', () => {
  test('empty input -> empty array', () => {
    expect(chunkCode('', 'ts')).toEqual([])
    expect(chunkCode('', 'py')).toEqual([])
  })
  test('lineWindowChunks respects size + overlap and never infinite-loops', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`)
    const chunks = lineWindowChunks(lines, 40, 5)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.endLine >= c.startLine)).toBe(true)
    // last chunk reaches the end
    expect(chunks[chunks.length - 1].endLine).toBe(100)
  })
})

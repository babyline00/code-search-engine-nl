import { test, expect, describe } from 'bun:test'
import { detectLanguage, languageLabel, SUPPORTED_LANGUAGES } from '../language-detect'

describe('detectLanguage (by extension)', () => {
  test.each([
    ['src/index.ts', 'ts'],
    ['src/index.tsx', 'tsx'],
    ['src/App.jsx', 'jsx'],
    ['src/index.js', 'js'],
    ['src/index.mjs', 'js'],
    ['src/index.cjs', 'js'],
    ['requests/api.py', 'py'],
    ['gin.go', 'go'],
    ['src/lib.rs', 'rs'],
    ['README.md', 'md'],
    ['docs/learn.mdx', 'md'],
  ])('%s → %s', (path, expected) => {
    expect(detectLanguage(path)).toBe(expected)
  })
  test('.d.ts is grouped under ts (not a separate language)', () => {
    expect(detectLanguage('types/react.d.ts')).toBe('ts')
  })
  test('unknown extension → unknown', () => {
    expect(detectLanguage('style.css')).toBe('unknown')
    expect(detectLanguage('data.json')).toBe('unknown')
    expect(detectLanguage('bin.exe')).toBe('unknown')
  })
  test('empty path → unknown', () => {
    expect(detectLanguage('')).toBe('unknown')
  })
  test('case-insensitive extension matching', () => {
    expect(detectLanguage('App.TSX')).toBe('tsx')
    expect(detectLanguage('Main.PY')).toBe('py')
  })
})

describe('languageLabel', () => {
  test('returns a human-readable label for every supported language', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const label = languageLabel(lang)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })
  test('"unknown" → "Other"', () => {
    expect(languageLabel('unknown')).toBe('Other')
  })
  test('ts → TypeScript, py → Python, rs → Rust', () => {
    expect(languageLabel('ts')).toBe('TypeScript')
    expect(languageLabel('py')).toBe('Python')
    expect(languageLabel('rs')).toBe('Rust')
  })
})

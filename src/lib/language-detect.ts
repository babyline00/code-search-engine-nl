/**
 * Language detection by file extension.
 *
 * Returns one of the supported sidebar-filter languages, or `unknown`.
 * `.d.ts` is treated as `ts` so TypeScript declaration files group with
 * regular TS in the UI.
 */
export type Language =
  | 'ts'
  | 'js'
  | 'tsx'
  | 'jsx'
  | 'py'
  | 'go'
  | 'rs'
  | 'md'
  | 'unknown'

export const SUPPORTED_LANGUAGES: Language[] = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'go',
  'rs',
  'md',
]

/** Human-readable label for the filter sidebar. */
export function languageLabel(lang: Language): string {
  switch (lang) {
    case 'ts':
      return 'TypeScript'
    case 'js':
      return 'JavaScript'
    case 'tsx':
      return 'TSX'
    case 'jsx':
      return 'JSX'
    case 'py':
      return 'Python'
    case 'go':
      return 'Go'
    case 'rs':
      return 'Rust'
    case 'md':
      return 'Markdown'
    case 'unknown':
      return 'Other'
  }
}

export function detectLanguage(filePath: string): Language {
  if (!filePath) return 'unknown'
  const lower = filePath.toLowerCase()
  // Order matters: `.d.ts` must be checked before the bare `.ts` rule.
  if (lower.endsWith('.d.ts')) return 'ts'
  if (lower.endsWith('.ts')) return 'ts'
  if (lower.endsWith('.tsx')) return 'tsx'
  if (lower.endsWith('.jsx')) return 'jsx'
  if (lower.endsWith('.js')) return 'js'
  if (lower.endsWith('.mjs')) return 'js'
  if (lower.endsWith('.cjs')) return 'js'
  if (lower.endsWith('.py')) return 'py'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rs'
  if (lower.endsWith('.md')) return 'md'
  if (lower.endsWith('.mdx')) return 'md'
  return 'unknown'
}

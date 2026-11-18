import { test, expect, describe } from 'bun:test'
import { buildGitHubFileUrl, buildGitHubRawUrl } from '../url-builder'

describe('buildGitHubFileUrl', () => {
  test('multi-line range → #Lstart-Lend fragment', () => {
    const url = buildGitHubFileUrl(
      { owner: 'pmndrs', name: 'zustand', defaultBranch: 'main' },
      'src/index.ts',
      { startLine: 12, endLine: 45 },
    )
    expect(url).toBe(
      'https://github.com/pmndrs/zustand/blob/main/src/index.ts#L12-L45',
    )
  })
  test('single-line range → #Lstart only (no -Lstart-Lstart)', () => {
    const url = buildGitHubFileUrl(
      { owner: 'facebook', name: 'react', defaultBranch: 'main' },
      'packages/react/src/React.js',
      { startLine: 5, endLine: 5 },
    )
    expect(url).toBe(
      'https://github.com/facebook/react/blob/main/packages/react/src/React.js#L5',
    )
  })
  test('no range → no fragment', () => {
    const url = buildGitHubFileUrl(
      { owner: 'vercel', name: 'next.js', defaultBranch: 'canary' },
      'packages/next/src/server/next.ts',
    )
    expect(url).toBe(
      'https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next.ts',
    )
  })
  test('canary branch is reflected in the URL', () => {
    const url = buildGitHubFileUrl(
      { owner: 'vercel', name: 'next.js', defaultBranch: 'canary' },
      'README.md',
      { startLine: 1, endLine: 10 },
    )
    expect(url).toContain('/blob/canary/')
  })
})

describe('buildGitHubRawUrl', () => {
  test('uses repo default branch when no branch given', () => {
    expect(
      buildGitHubRawUrl(
        { owner: 'pmndrs', name: 'zustand', defaultBranch: 'main' },
        'src/index.ts',
      ),
    ).toBe('https://raw.githubusercontent.com/pmndrs/zustand/main/src/index.ts')
  })
  test('honours an explicit branch override', () => {
    expect(
      buildGitHubRawUrl(
        { owner: 'vercel', name: 'next.js', defaultBranch: 'main' },
        'next.ts',
        'canary',
      ),
    ).toBe('https://raw.githubusercontent.com/vercel/next.js/canary/next.ts')
  })
})

/**
 * GitHub URL builder for the "Open on GitHub" link on each snippet card.
 *
 * Produces a canonical blob URL with a line-range anchor fragment:
 *   https://github.com/{owner}/{repo}/blob/{branch}/{path}#L{start}-L{end}
 *
 * When startLine === endLine we emit a single `#L{start}` anchor (GitHub
 * collapses `#L5-L5` visually but the canonical single-line form is cleaner).
 */

export interface RepoRef {
  owner: string
  name: string
  /** Default branch e.g. "main" / "master" / "canary". */
  defaultBranch: string
}

export interface LineRange {
  startLine: number
  endLine: number
}

export function buildGitHubFileUrl(
  repo: RepoRef,
  path: string,
  range?: LineRange,
): string {
  const base = `https://github.com/${repo.owner}/${repo.name}/blob/${repo.defaultBranch}/${path}`
  if (!range) return base
  if (range.startLine === range.endLine) return `${base}#L${range.startLine}`
  return `${base}#L${range.startLine}-L${range.endLine}`
}

/** Raw URL for downloading the file (used by future re-index features). */
export function buildGitHubRawUrl(
  repo: RepoRef,
  path: string,
  branch?: string,
): string {
  const b = branch ?? repo.defaultBranch
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${b}/${path}`
}

/**
 * Code-specific tokenizer shared by BM25 and the hashing-embedding fallback.
 *
 * Differences from a natural-language tokenizer:
 *  - lower-case only (NO stop-word removal — code identifiers like `i`, `j`,
 *    `fn`, `el` are meaningful loop/alias names and must be preserved).
 *  - keep `.`, `_`, `$` INSIDE tokens so identifiers such as `router.push`,
 *    `_privateField`, and `$el` survive as first-class tokens.
 *  - ADDITIONALLY emit the dot/underscore-split sub-tokens for recall
 *    (so a query for `router` also hits a chunk containing `router.push`).
 *  - keep 1-2 char tokens (loop vars `i`, `j`) — never drop short tokens.
 *  - drop pure-symbol tokens (`...`, `_`, `$`, `.`) that contain no
 *    alphanumeric characters.
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  const re = /[a-z0-9._$]+/g
  const tokens: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(lower)) !== null) {
    const tok = m[0]
    // Drop pure-symbol tokens (no alphanumeric char at all)
    if (!/[a-z0-9]/.test(tok)) continue
    tokens.push(tok)
    // Recall boost: split on `.` and `_` so sub-identifiers are also indexed.
    const parts = tok.split(/[._]/).filter((p) => p.length > 0)
    if (parts.length > 1) {
      for (const p of parts) tokens.push(p)
    }
  }
  return tokens
}

/** Token frequency map. */
export function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1)
  }
  return tf
}

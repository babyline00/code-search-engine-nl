import { test, expect, describe } from 'bun:test'
import { tokenize, termFrequencies } from '../tokenizer'

describe('tokenize — code-specific behaviour', () => {
  test('lowercases', () => {
    expect(tokenize('useState USEFFECT')).toEqual(
      expect.arrayContaining(['usestate', 'useffect']),
    )
  })
  test('keeps dots inside identifiers (router.push)', () => {
    const toks = tokenize('router.push')
    expect(toks).toContain('router.push')
    // recall boost: also emits the dot-split sub-tokens
    expect(toks).toContain('router')
    expect(toks).toContain('push')
  })
  test('keeps underscores inside identifiers (my_func)', () => {
    const toks = tokenize('my_func')
    expect(toks).toContain('my_func')
    expect(toks).toContain('my')
    expect(toks).toContain('func')
  })
  test('keeps dollar signs ($el, $state)', () => {
    expect(tokenize('$el')).toContain('$el')
    expect(tokenize('$state')).toContain('$state')
  })
  test('keeps short 1-2 char tokens (loop vars i, j)', () => {
    const toks = tokenize('for i in range(j)')
    expect(toks).toContain('i')
    expect(toks).toContain('j')
  })
  test('drops pure-symbol tokens (no alphanumeric)', () => {
    expect(tokenize('...')).toEqual([])
    expect(tokenize('$')).toEqual([])
    expect(tokenize('_')).toEqual([])
  })
  test('splits on whitespace and punctuation (except . _ $)', () => {
    const toks = tokenize('foo, bar; baz?')
    expect(toks).toEqual(['foo', 'bar', 'baz'])
  })
  test('empty string -> []', () => {
    expect(tokenize('')).toEqual([])
  })
  test('preserves numeric tokens', () => {
    expect(tokenize('count = 42')).toEqual(expect.arrayContaining(['count', '42']))
  })
})

describe('termFrequencies', () => {
  test('counts repeated tokens', () => {
    const tf = termFrequencies(tokenize('foo foo bar foo.bar'))
    expect(tf.get('foo')).toBe(3) // 'foo' appears 3x (standalone + from foo.bar split)
    expect(tf.get('bar')).toBe(2) // 'bar' standalone + from 'foo.bar' split
    expect(tf.get('foo.bar')).toBe(1)
  })
})

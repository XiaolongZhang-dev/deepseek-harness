// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  normalizeTagName, pruneAssignments, readAssignments, tagKey, vocabularyOf,
} from '../src/tags-settings.ts'

describe('tag names', () => {
  it('trims and accepts one to twenty-four code points', () => {
    expect(normalizeTagName('  前端  ')).toBe('前端')
    expect(normalizeTagName('a'.repeat(24))).toBe('a'.repeat(24))
    expect(normalizeTagName('')).toBeUndefined()
    expect(normalizeTagName('   ')).toBeUndefined()
    expect(normalizeTagName('a'.repeat(25))).toBeUndefined()
    expect(normalizeTagName('a\nb')).toBeUndefined()
  })

  it('compares case-insensitively', () => {
    expect(tagKey('UI')).toBe(tagKey('ui'))
  })
})

describe('vocabulary', () => {
  it('lists first-seen tags once across workspaces', () => {
    expect(vocabularyOf({ a: ['前端', '研究'], b: ['研究', '后端'] })).toEqual(['前端', '研究', '后端'])
  })

  it('deduplicates case variants', () => {
    expect(vocabularyOf({ a: ['UI'], b: ['ui'] })).toEqual(['UI'])
  })
})

describe('pruneAssignments', () => {
  it('drops entries for Workspaces the registry no longer holds', () => {
    expect(pruneAssignments({ a: ['前端'], b: ['后端'] }, new Set(['a']))).toEqual({ a: ['前端'] })
  })

  it('keeps a copy so callers can mutate their own map', () => {
    const original = { a: ['前端'] }
    const pruned = pruneAssignments(original, new Set(['a']))
    pruned.a ??= []
    pruned.a.push('研究')
    expect(original.a).toEqual(['前端'])
  })
})

describe('readAssignments', () => {
  it('drops malformed entries and normalizes names', () => {
    expect(readAssignments({
      assignments: {
        a: [' 前端 ', 42, ''],
        b: 'not-an-array',
        c: ['研究'],
        d: [],
      },
    })).toEqual({ a: ['前端'], c: ['研究'] })
  })

  it('returns an empty map for anything that is not the stored shape', () => {
    expect(readAssignments(null)).toEqual({})
    expect(readAssignments({})).toEqual({})
    expect(readAssignments({ assignments: null })).toEqual({})
  })
})

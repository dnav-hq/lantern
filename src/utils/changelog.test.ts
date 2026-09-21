import { describe, it, expect } from 'vitest'
import { hasUnreadChangelog } from './changelog'
import type { ChangelogEntry } from '../content/changelog'

const entries: ChangelogEntry[] = [
  { version: 'v3', date: '2026-09-18', lines: ['newest'] },
  { version: 'v2', date: '2026-09-17', lines: ['middle'] },
  { version: 'v1', date: '2026-08-23', lines: ['oldest'] }
]

describe('hasUnreadChangelog', () => {
  it('no stored value: a first-time reader sees no dot', () => {
    expect(hasUnreadChangelog(null, entries)).toBe(false)
  })

  it('stored value equal to the newest version: no dot', () => {
    expect(hasUnreadChangelog('v3', entries)).toBe(false)
  })

  it('an older stored value: a dot', () => {
    expect(hasUnreadChangelog('v2', entries)).toBe(true)
    expect(hasUnreadChangelog('v1', entries)).toBe(true)
  })

  it('an unrecognised stored value: no dot, no crash', () => {
    expect(hasUnreadChangelog('v99', entries)).toBe(false)
    expect(hasUnreadChangelog('not-a-version', entries)).toBe(false)
  })

  it('an empty entries list never flags a dot', () => {
    expect(hasUnreadChangelog('v3', [])).toBe(false)
  })

  it('defaults to the real shipped changelog when no entries are passed', () => {
    expect(hasUnreadChangelog(null)).toBe(false)
  })
})

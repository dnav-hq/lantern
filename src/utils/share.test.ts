import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shareReference, verseUrl } from './share'

describe('verseUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://lanternword.com' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is absolute and names the chapter or verse', () => {
    expect(verseUrl(43, 3)).toBe('https://lanternword.com/read/john/3')
    expect(verseUrl(43, 3, 16)).toBe('https://lanternword.com/read/john/3/16')
  })

  it('links a range to its first verse', () => {
    expect(verseUrl(45, 8, 28, 30)).toBe('https://lanternword.com/read/romans/8/28')
  })
})

describe('shareReference', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://lanternword.com' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    const r = await shareReference({
      bookNumber: 43,
      chapter: 3,
      verseStart: 16,
      label: 'John 3:16',
      text: 'For God so loved the world'
    })
    expect(r).toBe('shared')
    expect(share).toHaveBeenCalledWith({
      title: 'Lantern',
      text: 'John 3:16\nFor God so loved the world',
      url: 'https://lanternword.com/read/john/3/16'
    })
  })

  it('copies the link when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const r = await shareReference({ bookNumber: 19, chapter: 23, label: 'Psalm 23' })
    expect(r).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://lanternword.com/read/psalms/23')
  })

  it('returns failed quietly when the share sheet is dismissed', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const share = vi.fn().mockRejectedValue(abort)
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    expect(await shareReference({ bookNumber: 43, chapter: 3, label: 'John 3' })).toBe('failed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when sharing fails for another reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('nope'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    expect(await shareReference({ bookNumber: 43, chapter: 3, label: 'John 3' })).toBe('copied')
  })

  it('returns failed when neither is available', async () => {
    vi.stubGlobal('navigator', {})
    expect(await shareReference({ bookNumber: 43, chapter: 3, label: 'John 3' })).toBe('failed')
  })
})

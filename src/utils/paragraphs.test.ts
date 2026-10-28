import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadParagraphStarts,
  paragraphStartsFrom,
  resetParagraphs,
  type ParagraphBundle
} from './paragraphs'

const DATA: ParagraphBundle = {
  '1': { '1': [1, 2, 3, 6], '2': [1] },
  '19': { '23': [1, 5] }
}

describe('paragraphStartsFrom', () => {
  it('returns the paragraph-start verses of a known chapter', () => {
    expect([...paragraphStartsFrom(DATA, 1, 1)]).toEqual([1, 2, 3, 6])
    expect(paragraphStartsFrom(DATA, 19, 23).has(5)).toBe(true)
    expect(paragraphStartsFrom(DATA, 19, 23).has(4)).toBe(false)
  })

  it('returns an empty set for a chapter or book the bundle does not know', () => {
    expect(paragraphStartsFrom(DATA, 1, 50).size).toBe(0)
    expect(paragraphStartsFrom(DATA, 66, 1).size).toBe(0)
  })
})

describe('loadParagraphStarts', () => {
  afterEach(() => {
    resetParagraphs()
    vi.unstubAllGlobals()
  })

  it('fetches the bundle once and answers every chapter from it', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(DATA), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect([...(await loadParagraphStarts(1, 1))]).toEqual([1, 2, 3, 6])
    expect([...(await loadParagraphStarts(1, 2))]).toEqual([1])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves to an empty set on failure and does not remember the failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(DATA), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await loadParagraphStarts(1, 1)).size).toBe(0)
    expect([...(await loadParagraphStarts(1, 1))]).toEqual([1, 2, 3, 6])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

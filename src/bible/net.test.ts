import { describe, it, expect, vi, afterEach } from 'vitest'
import { HelloaoBibleProvider } from './helloao'
import { NetSelfHostedBibleProvider } from './net-self-hosted'
import { FallbackBibleProvider } from './fallback'
import { CodedError } from '../errors'

afterEach(() => {
  vi.restoreAllMocks()
})

// NET has no network provider of its own: HelloaoBibleProvider already takes a
// translation code, so the live path is HelloaoBibleProvider('eng_net'). These
// tests cover the two things that ARE NET-specific — that the code is threaded
// into the URL, and the self-hosted bundle fallback — rather than re-testing
// helloao's flattening, which kjv.test.ts and the BSB path already cover.

function fakeResponse(content: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ chapter: { number: 1, content } })
  } as unknown as Response
}

describe('NET via HelloaoBibleProvider', () => {
  it('requests the eng_net translation code, not BSB', async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse([{ type: 'verse', number: 1, content: ['In the beginning God created.'] }])
    )
    vi.stubGlobal('fetch', fetchMock)

    const p = new HelloaoBibleProvider('eng_net')
    await expect(p.getChapter(1, 1)).resolves.toEqual([
      { verse: 1, text: 'In the beginning God created.' }
    ])
    expect(fetchMock).toHaveBeenCalledWith('https://bible.helloao.org/api/eng_net/GEN/1.json')
  })

  it('surfaces a coded error when helloao is down, so the fallback can take over', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' }) as Response)
    )
    const p = new HelloaoBibleProvider('eng_net')
    await expect(p.getChapter(1, 1)).rejects.toBeInstanceOf(CodedError)
  })
})

describe('NetSelfHostedBibleProvider', () => {
  const bundle = {
    '1': {
      '1': [[1, 'In the beginning God created the heavens and the earth.'] as [number, string]]
    }
  }

  it('serves a chapter out of the bundle', async () => {
    const p = new NetSelfHostedBibleProvider('/bible/net.json.gz', async () => bundle)
    await expect(p.getChapter(1, 1)).resolves.toEqual([
      { verse: 1, text: 'In the beginning God created the heavens and the earth.' }
    ])
  })

  it('fetches the bundle once and memoizes it for the session', async () => {
    const loader = vi.fn(async () => bundle)
    const p = new NetSelfHostedBibleProvider('/bible/net.json.gz', loader)
    await p.getChapter(1, 1)
    await p.getChapter(1, 1)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('throws a coded error for a chapter the bundle does not contain', async () => {
    const p = new NetSelfHostedBibleProvider('/bible/net.json.gz', async () => bundle)
    await expect(p.getChapter(66, 22)).rejects.toBeInstanceOf(CodedError)
  })
})

describe('the shipped NET composition', () => {
  it('falls back to the self-hosted bundle when helloao fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' }) as Response)
    )
    const composed = new FallbackBibleProvider(
      new HelloaoBibleProvider('eng_net'),
      new NetSelfHostedBibleProvider('/bible/net.json.gz', async () => ({
        '1': { '1': [[1, 'from the bundle'] as [number, string]] }
      }))
    )
    await expect(composed.getChapter(1, 1)).resolves.toEqual([
      { verse: 1, text: 'from the bundle' }
    ])
  })

  it('does not touch the bundle when helloao succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse([{ type: 'verse', number: 1, content: ['from the network'] }]))
    )
    const loader = vi.fn(async () => ({
      '1': { '1': [[1, 'from the bundle'] as [number, string]] }
    }))
    const composed = new FallbackBibleProvider(
      new HelloaoBibleProvider('eng_net'),
      new NetSelfHostedBibleProvider('/bible/net.json.gz', loader)
    )
    await expect(composed.getChapter(1, 1)).resolves.toEqual([
      { verse: 1, text: 'from the network' }
    ])
    // Lazy by design: the ~1.3 MB bundle must never be fetched on a good read.
    expect(loader).not.toHaveBeenCalled()
  })
})

// Sharing a verse: the one link form (`verseUrl`) and the one way to hand it to
// the reader's phone or clipboard (`shareReference`). Pure browser APIs, no
// React, so the selection bars on both reading surfaces can call it and a test
// can exercise every branch with a mocked `navigator`.
import { buildDeepLink } from './deepLink'

export interface ShareReferenceInput {
  bookNumber: number
  chapter: number
  verseStart?: number | null
  verseEnd?: number | null
  /** The human reference, e.g. "John 3:16" or "Romans 8:28-30". */
  label: string
  /** The verse text itself, when the caller wants it in the share sheet. */
  text?: string
}

export type ShareOutcome = 'shared' | 'copied' | 'failed'

/** Absolute URL for a chapter or a verse; a range links to its first verse. */
export function verseUrl(
  bookNumber: number,
  chapter: number,
  verseStart?: number | null,
  // Kept for symmetry with `shareReference`; the path only ever names the
  // first verse, so the range end does not change the URL.
  _verseEnd?: number | null
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${buildDeepLink(bookNumber, chapter, verseStart ?? null)}`
}

function isAbort(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Hands a reference to the native share sheet when the browser has one, else
 * copies the link. Resolves to what happened so the caller can say "Copied"
 * or stay quiet; a share sheet the reader dismissed resolves 'failed' without
 * throwing, since that was their choice and not an error worth reporting.
 */
export async function shareReference(input: ShareReferenceInput): Promise<ShareOutcome> {
  const url = verseUrl(input.bookNumber, input.chapter, input.verseStart, input.verseEnd)
  const text = input.text ? `${input.label}\n${input.text}` : input.label
  const nav = typeof navigator !== 'undefined' ? navigator : undefined

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title: 'Lantern', text, url })
      return 'shared'
    } catch (err) {
      if (isAbort(err)) return 'failed'
      // A share that failed for any other reason still gets the clipboard try.
    }
  }

  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(url)
      return 'copied'
    } catch {
      // Permission refused (an embedded or locked-down browser): the legacy
      // copy below still works there.
    }
  }

  return legacyCopy(url) ? 'copied' : 'failed'
}

/** The pre-Clipboard-API copy: a hidden textarea and execCommand. */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}

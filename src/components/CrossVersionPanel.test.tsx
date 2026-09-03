import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseColumn } from './CrossVersionPanel'

// The repo has no jsdom / @testing-library/react (every existing test is a
// pure src/utils/ unit test), and adding either is a new dependency this task
// doesn't get to add unasked. CrossVersionPanel itself renders through
// createPortal, which needs a real `document` and can't run through
// react-dom/server. VerseColumn is the effect-free, portal-free piece that
// actually decides what markup the BSB verse gets, so it's rendered directly
// with renderToStaticMarkup (react-dom/server, already a dependency via
// react-dom — no jsdom needed) and asserted on as an HTML string.

describe('CrossVersionPanel — VerseColumn (N2: no footnote markup)', () => {
  it('renders the BSB verse as plain text, with none of the footnote door markup', () => {
    const html = renderToStaticMarkup(
      <VerseColumn
        label="BSB"
        text="Or comprehended it not. In him was life, and the life was the light of men."
        alternative={null}
      />
    )
    // N2 is load-bearing and fails silently: if this panel ever rendered the
    // BSB verse through FootnoteVerseText/Door instead of plain text, nothing
    // would throw — a reader would just see the dotted underline here and
    // draw the phrase alignment the brief measured and declined to compute.
    expect(html).not.toContain('footnote-door')
    expect(html).not.toContain('footnote-note')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('role="button"')
    expect(html).toContain(
      'Or comprehended it not. In him was life, and the life was the light of men.'
    )
  })

  it('still renders no footnote markup when a verbatim match is highlighted', () => {
    const html = renderToStaticMarkup(
      <VerseColumn
        label="KJV"
        text="and the darkness comprehended it not"
        alternative="comprehended it not"
      />
    )
    // The one honest extra (brief §5.1.3) marks a verbatim substring — a
    // string the reader can check — but that mark must never be, or look
    // like, the footnote door's own markup.
    expect(html).not.toContain('footnote-door')
    expect(html).not.toContain('footnote-note')
    expect(html).toContain('cross-version-match')
    expect(html).toContain('comprehended it not')
  })

  it('renders plain text with no mark when there is no verbatim match', () => {
    const html = renderToStaticMarkup(
      <VerseColumn
        label="NET"
        text="and the darkness did not overcome it"
        alternative="comprehended it not"
      />
    )
    expect(html).not.toContain('cross-version-match')
    expect(html).not.toContain('footnote-door')
    expect(html).not.toContain('footnote-note')
  })
})

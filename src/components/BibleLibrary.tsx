import React, { useEffect, useState } from 'react'
import { Passage } from '../types'
import { BIBLE_BOOKS, BibleBook } from '../utils/bibleBooks'

// Module-scoped, not React state: true only until the very first
// BibleLibrary mount in this tab's lifetime finishes claiming it. Bible is
// the app's default destination, so this is really "did the app just boot."
// Every later visit to Library (a genuine remount each time — see App.tsx's
// renderMain) sees it already claimed and skips the fade. Deliberately not
// implemented as a ref/effect that flips a class off after some delay —
// that would risk the animation being cut short mid-play by an unrelated
// re-render (e.g. the initial `passages` fetch resolving). Using a stable
// lazy useState initializer instead means the class, once decided at true
// mount time, never changes for the lifetime of this component instance.
let hasBooted = false

interface BibleLibraryProps {
  passages: Passage[]
  onSelectBook: (bookName: string) => void
  // Optional signed-in name for a quiet "Welcome back" line.
  displayName?: string | null
  // Opens the mobile search surface. Renders a prominent full-width search
  // entry point in the header (mobile only — desktop already has its own
  // always-present top-bar box, hidden here via CSS). The use case this is
  // for: mid-service, find a reference fast — the top-right icon button
  // alone read as too subtle/easy to miss for that.
  onOpenSearch?: () => void
}

const OT = BIBLE_BOOKS.filter(b => b.testament === 'OT')
const NT = BIBLE_BOOKS.filter(b => b.testament === 'NT')

function TestamentSection({
  label,
  bibleBooks,
  countByBook,
  onSelectBook
}: {
  label: string
  bibleBooks: BibleBook[]
  countByBook: Map<number, number>
  onSelectBook: (name: string) => void
}): React.ReactElement {
  return (
    <div className="bible-testament-section">
      {/* Centered heading with flanking rules — a section break, not a
          left-flush label — so it centers correctly regardless of the grid's
          own (content-sized) width instead of needing to match it pixel for
          pixel. Also just reads nicely for a Bible app. */}
      <div className="bible-testament-label">
        <span className="bible-testament-rule" aria-hidden="true" />
        <span className="bible-testament-text">{label}</span>
        <span className="bible-testament-rule" aria-hidden="true" />
      </div>
      <div className="bible-books-grid">
        {bibleBooks.map(book => {
          const passageCount = countByBook.get(book.number) ?? 0
          const studied = passageCount > 0

          return (
            <div key={book.id} className="bible-book-item">
              {/* A real <button>, not a div with an onClick. These 66 rows are
                  the app's front door, and as divs they were not in the tab
                  order at all — there was no way to open a book without a
                  pointer, and a screen reader met 66 unlabelled divs. A button
                  brings keyboard focus, Enter/Space and the right role for
                  free, which is why it is worth the CSS reset below. */}
              <button
                type="button"
                className={`bible-book-row${studied ? ' studied' : ''}`}
                onClick={() => onSelectBook(book.name)}
              >
                <span className={`bible-book-dot${studied ? ' visible' : ''}`} />
                <span className="bible-book-name">{book.name}</span>
                {studied && (
                  <span className="bible-book-count">
                    {passageCount}
                    <span className="sr-only">{passageCount === 1 ? ' note' : ' notes'}</span>
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BibleLibrary({
  passages,
  onSelectBook,
  displayName,
  onOpenSearch
}: BibleLibraryProps): React.ReactElement {
  const [playBootFade] = useState(() => !hasBooted)
  useEffect(() => {
    hasBooted = true
  }, [])

  const countByBook = new Map<number, number>()
  for (const p of passages) {
    countByBook.set(p.book_number, (countByBook.get(p.book_number) ?? 0) + 1)
  }

  const passageCount = passages.length
  const studiedBookCount = countByBook.size

  return (
    <div className={`bible-library${playBootFade ? ' bible-library--boot' : ''}`}>
      <div className="bible-library-header">
        {displayName && <p className="bible-library-greeting">Welcome back, {displayName}.</p>}
        <h2 className="bible-library-title">Bible Library</h2>
        <p className="bible-library-sub">
          {passageCount > 0
            ? `${studiedBookCount} ${studiedBookCount === 1 ? 'book' : 'books'} · ${passageCount} ${passageCount === 1 ? 'passage' : 'passages'} studied`
            : 'Click any book to begin reading'}
        </p>
        {onOpenSearch && (
          <button type="button" className="library-search-entry" onClick={onOpenSearch}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Search references or notes…
          </button>
        )}
      </div>

      <TestamentSection
        label="Old Testament"
        bibleBooks={OT}
        countByBook={countByBook}
        onSelectBook={onSelectBook}
      />
      <TestamentSection
        label="New Testament"
        bibleBooks={NT}
        countByBook={countByBook}
        onSelectBook={onSelectBook}
      />
    </div>
  )
}

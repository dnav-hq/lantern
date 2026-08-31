import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NoteCategory, NoteWithPassageInfo } from '../types'
import { findBookByAlias } from '../utils/bibleBooks'
import { isHighlight, noteProse } from '../utils/noteKind'
import {
  ALL,
  applyJournalFilters,
  booksPresent,
  emptyResultMessage,
  type KindFilter
} from '../utils/journalFilters'
import { formatRelativeTime } from '../utils/relativeTime'
import { useApi } from '../api/context'

interface JournalPageProps {
  // Open the reading view for a chapter. Wired in App.tsx to the same
  // jump-to-chapter handler the search results and the chapter strip use.
  onOpenChapter: (bookNumber: number, chapter: number) => void
}

type ViewMode = 'notes' | 'chapters'
type CategoryFilter = NoteCategory | 'all'

const CATEGORY_OPTIONS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All notes' },
  { id: 'observation', label: 'Observation' },
  { id: 'historical', label: 'Historical' },
  { id: 'application', label: 'Application' },
  { id: 'personal', label: 'Personal' }
]

// A chapter with more notes than this collapses behind a "show more" toggle, so
// one heavily-annotated chapter can't push the rest of the history off-screen.
const COLLAPSE_AT = 3

// Soft time buckets, newest first. Deliberately vague ("Earlier this month")
// rather than exact — this is a record to look back over, not a log.
type Bucket = 'Today' | 'This week' | 'Earlier this month' | 'Older'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Which bucket a timestamp falls in, measured in whole LOCAL days so "Today"
// means today's date rather than "within 24 hours".
function bucketFor(iso: string, now: Date): Bucket {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'Older'
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days < 7) return 'This week'
  if (then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth()) {
    return 'Earlier this month'
  }
  return 'Older'
}

// The book a note belongs to, read off the reference label its passage carries
// ("John 15:1-10" → John). Labels are always "<book> <chapter>[:<verses>]" — see
// how BookDetailPage/StudyMode build them — so the book is everything before the
// first number, resolved through the same alias table the reference input uses.
const LABEL_BOOK = /^(.+?)\s+\d+(?::|\s|$)/

function bookFromLabel(label: string): ReturnType<typeof findBookByAlias> {
  const trimmed = label.trim()
  const match = LABEL_BOOK.exec(trimmed)
  return findBookByAlias(match ? match[1] : trimmed)
}

interface JournalNote {
  id: string
  // "15:4" or "15:4-5"; just the chapter for a note left on the whole passage.
  verse: string
  // Verse the note sorts on (reading order within the chapter).
  sortVerse: number
  category: NoteCategory | null
  text: string
  // A note with no body — the reader marked the verse without writing.
  highlight: boolean
  indent: number
  at: string
}

interface ChapterEntry {
  key: string
  // null only if the label's book can't be resolved — the entry still renders,
  // it just isn't tappable, because there's nowhere honest to open.
  bookNumber: number | null
  chapter: number
  reference: string
  // Most recent note on this chapter — what the entry is bucketed and sorted by.
  lastAt: string
  notes: JournalNote[]
}

// The whole view, derived from note anchors: every note's own chapter + verses,
// grouped into one entry per chapter, newest activity first. The passage
// container contributes nothing but the reference label it was created with.
function buildEntries(notes: NoteWithPassageInfo[]): ChapterEntry[] {
  const byChapter = new Map<string, ChapterEntry>()

  for (const note of notes) {
    const book = bookFromLabel(note.reference_label)
    const chapter = note.anchor_chapter_override ?? note.chapter_start
    const bookName =
      note.anchor_book_override ?? book?.name ?? note.reference_label.replace(/\s*\d.*$/, '').trim()
    const key = `${book?.number ?? bookName}:${chapter}`

    let entry = byChapter.get(key)
    if (!entry) {
      entry = {
        key,
        bookNumber: book?.number ?? null,
        chapter,
        reference: `${bookName} ${chapter}`.trim(),
        lastAt: note.created_at,
        notes: []
      }
      byChapter.set(key, entry)
    }

    const text = noteProse(note.content)
    // A HIGHLIGHT (a note with no body) is kept, not dropped. It is a real
    // thing the reader did — the moment they noticed something and had no
    // words for it yet — and dropping it here would make it invisible
    // everywhere except the chapter it sits in. See src/utils/noteKind.ts.
    const highlight = isHighlight(note)
    if (text || highlight) {
      const start = note.anchor_start_verse
      const end = note.anchor_end_verse ?? start
      entry.notes.push({
        id: note.id,
        verse:
          start === null
            ? String(chapter)
            : end !== null && end > start
              ? `${chapter}:${start}-${end}`
              : `${chapter}:${start}`,
        sortVerse: start ?? 0,
        category: note.category,
        text,
        highlight,
        indent: note.indent_level,
        at: note.created_at
      })
    }
    if (note.created_at > entry.lastAt) entry.lastAt = note.created_at
  }

  return [...byChapter.values()]
    .filter(entry => entry.notes.length > 0)
    .map(entry => ({
      ...entry,
      // Reading order within the chapter, so a sub-note stays under its parent.
      notes: entry.notes.sort(
        (a, b) => a.sortVerse - b.sortVerse || a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
      )
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.key.localeCompare(b.key))
}

// Below this, don't bother showing a skeleton at all — for a fetch this
// fast, the skeleton appearing (then almost immediately being replaced)
// reads as more of a flash/flicker than the blank instant it's meant to
// smooth over. Standard "avoid a flash of loading state" delay: only start
// showing the placeholder once a fetch has genuinely taken a while.
const SKELETON_DELAY_MS = 150

function CategoryDot({ category }: { category: CategoryFilter }): React.ReactElement {
  return (
    <span
      className={`journal-dot${category === 'all' ? ' journal-dot-all' : ` cat-${category}`}`}
      aria-hidden="true"
    />
  )
}

export default function JournalPage({ onOpenChapter }: JournalPageProps): React.ReactElement {
  const api = useApi()
  const [notes, setNotes] = useState<NoteWithPassageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [view, setView] = useState<ViewMode>('notes')
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [bookFilter, setBookFilter] = useState<number | typeof ALL>(ALL)
  const [kindFilter, setKindFilter] = useState<KindFilter>(ALL)
  const [filterOpen, setFilterOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const filterRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let settled = false
    const skeletonTimer = window.setTimeout(() => {
      if (!settled) setShowSkeleton(true)
    }, SKELETON_DELAY_MS)
    api.getAllNotes().then(all => {
      settled = true
      window.clearTimeout(skeletonTimer)
      setNotes(all)
      setLoading(false)
    })
    return () => {
      settled = true
      window.clearTimeout(skeletonTimer)
    }
  }, [api])

  // Dismiss the category menu on an outside click or Escape — same shape as
  // every other lightweight popover in the app.
  useEffect(() => {
    if (!filterOpen && !bookOpen) return
    const onPointer = (e: MouseEvent): void => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false)
      if (!bookRef.current?.contains(e.target as Node)) setBookOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setFilterOpen(false)
        setBookOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [filterOpen, bookOpen])

  const entries = useMemo(() => buildEntries(notes), [notes])

  // Filters compose: book at the entry level, category at the note level, then
  // any chapter left with nothing drops out. Logic lives in journalFilters.ts
  // so the rules are unit-testable without rendering the page.
  const filters = useMemo(
    () => ({ category: filter, bookNumber: bookFilter, kind: kindFilter }),
    [filter, bookFilter, kindFilter]
  )
  const visible = useMemo(() => applyJournalFilters(entries, filters), [entries, filters])

  // Only the books the reader has ACTUALLY written in, in canon order — never a
  // 66-item picker, which would read as a Bible index rather than as your notes.
  const bookOptions = useMemo(() => booksPresent(entries), [entries])
  const activeBook = bookOptions.find(b => b.number === bookFilter)

  const clearFilters = useCallback(() => {
    setFilter('all')
    setBookFilter(ALL)
    setKindFilter(ALL)
  }, [])

  // Only offered once there is actually a mix to filter between: with only
  // written notes (or only marks) the control would be a no-op that still
  // costs a glance.
  const hasBothKinds = useMemo(() => {
    let notes = false
    let marks = false
    for (const entry of entries) {
      for (const n of entry.notes) {
        if (n.highlight) marks = true
        else notes = true
        if (notes && marks) return true
      }
    }
    return false
  }, [entries])

  const toggleExpanded = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const controls = (
    <div className="journal-controls">
      <div className="journal-seg" role="group" aria-label="Journal view">
        {(['notes', 'chapters'] as ViewMode[]).map(mode => (
          <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>
            {mode === 'notes' ? 'Notes' : 'Chapters'}
          </button>
        ))}
      </div>
      <div className="journal-filter" ref={filterRef}>
        <button
          className="journal-filter-trigger"
          aria-haspopup="listbox"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen(open => !open)}
        >
          <CategoryDot category={filter} />
          {filter === 'all' ? 'All' : CATEGORY_OPTIONS.find(o => o.id === filter)!.label}
          <span className="journal-filter-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        {filterOpen && (
          <div className="journal-filter-menu" role="listbox" aria-label="Filter by category">
            {CATEGORY_OPTIONS.map(option => (
              <button
                key={option.id}
                className="journal-filter-option"
                role="option"
                aria-selected={filter === option.id}
                onClick={() => {
                  setFilter(option.id)
                  setFilterOpen(false)
                }}
              >
                <CategoryDot category={option.id} />
                {option.label}
                <span className="journal-filter-check" aria-hidden="true">
                  ✓
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Book filter. Only rendered once there is more than one book to choose
          between: with a single book the control would be a no-op that still
          costs a glance. */}
      {bookOptions.length > 1 && (
        <div className="journal-filter" ref={bookRef}>
          <button
            className="journal-filter-trigger"
            aria-haspopup="listbox"
            aria-expanded={bookOpen}
            onClick={() => setBookOpen(open => !open)}
          >
            {activeBook ? activeBook.name : 'All books'}
            <span className="journal-filter-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {bookOpen && (
            <div className="journal-filter-menu" role="listbox" aria-label="Filter by book">
              <button
                className="journal-filter-option"
                role="option"
                aria-selected={bookFilter === ALL}
                onClick={() => {
                  setBookFilter(ALL)
                  setBookOpen(false)
                }}
              >
                All books
                <span className="journal-filter-check" aria-hidden="true">
                  ✓
                </span>
              </button>
              {bookOptions.map(book => (
                <button
                  key={book.number}
                  className="journal-filter-option"
                  role="option"
                  aria-selected={bookFilter === book.number}
                  onClick={() => {
                    setBookFilter(book.number)
                    setBookOpen(false)
                  }}
                >
                  {book.name}
                  <span className="journal-filter-check" aria-hidden="true">
                    ✓
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* A filter you forgot you set is worse than no filter: you conclude a
          note is gone. So the active state is always legible and always one tap
          from cleared. */}
      {hasBothKinds && (
        <div className="journal-seg journal-seg-kind" role="group" aria-label="Filter by kind">
          {(
            [
              [ALL, 'All'],
              ['note', 'Notes'],
              ['highlight', 'Marks']
            ] as Array<[KindFilter, string]>
          ).map(([id, label]) => (
            <button key={id} aria-pressed={kindFilter === id} onClick={() => setKindFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {(filter !== 'all' || bookFilter !== ALL || kindFilter !== ALL) && (
        <button className="journal-filter-clear" onClick={clearFilters}>
          Clear filters
        </button>
      )}
    </div>
  )

  const header = (
    <div className="journal-header">
      {/* Real heading (its text never changes, unlike the list below it) so the
          loading → loaded transition doesn't shift the page. */}
      <h1 className="journal-heading">Journal</h1>
      <p className="journal-masthead">
        A quiet record of where you&rsquo;ve been reading, and what you noticed there.
      </p>
    </div>
  )

  if (loading) {
    // Nothing rendered for the first SKELETON_DELAY_MS — a brief blank beat is
    // far less jarring than a placeholder that pops in only to be replaced.
    if (!showSkeleton) return <div className="journal-page" />
    return (
      <div className="journal-page">
        <div className="journal-index">
          {header}
          <div className="journal-body">
            <div className="journal-skeleton" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="journal-entry-skeleton" key={i}>
                  <div className="journal-entry-skeleton-top">
                    <span className="skeleton-line" style={{ width: '38%', height: 14 }} />
                    <span className="skeleton-line" style={{ width: 56, height: 10 }} />
                  </div>
                  <span
                    className="skeleton-line"
                    style={{ width: '84%', height: 10, marginTop: 10 }}
                  />
                  <span
                    className="skeleton-line"
                    style={{ width: '66%', height: 10, marginTop: 8 }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="journal-page">
        <div className="journal-page-empty">
          <div className="journal-page-title">Journal</div>
          <p className="journal-page-hint">
            Nothing written down yet. Open a chapter in the Bible view and note what you see — it
            will gather here, by when you read it.
          </p>
        </div>
      </div>
    )
  }

  const now = new Date()
  let lastBucket: Bucket | null = null

  return (
    <div className="journal-page">
      <div className="journal-index">
        {header}
        {controls}
        <div className="journal-body">
          {visible.length === 0 && (
            <p className="journal-empty-filter">
              {emptyResultMessage(filters, {
                category: CATEGORY_OPTIONS.find(o => o.id === filter)?.label,
                book: activeBook?.name
              })}{' '}
              <button className="journal-empty-clear" onClick={clearFilters}>
                Clear filters
              </button>
            </p>
          )}
          {visible.map(entry => {
            const bucket = bucketFor(entry.lastAt, now)
            const newBucket = bucket !== lastBucket
            lastBucket = bucket
            const isExpanded = expanded.has(entry.key)
            const shown = isExpanded ? entry.notes : entry.notes.slice(0, COLLAPSE_AT)
            const hidden = entry.notes.length - shown.length
            const categories = [
              ...new Set(
                entry.notes.map(n => n.category).filter((c): c is NoteCategory => c !== null)
              )
            ]

            return (
              <React.Fragment key={entry.key}>
                {newBucket && (
                  <div className="journal-bucket">
                    <span className="journal-bucket-label">{bucket}</span>
                    <span className="journal-bucket-rule" />
                  </div>
                )}
                <div className="journal-chapter">
                  <button
                    className="journal-chapter-head"
                    disabled={entry.bookNumber === null}
                    onClick={() => {
                      if (entry.bookNumber !== null) onOpenChapter(entry.bookNumber, entry.chapter)
                    }}
                  >
                    <span className="journal-chapter-ref">{entry.reference}</span>
                    {view === 'chapters' && categories.length > 0 && (
                      <span className="journal-chapter-dots" aria-hidden="true">
                        {categories.map(category => (
                          <span key={category} className={`journal-dot cat-${category}`} />
                        ))}
                      </span>
                    )}
                    <span className="journal-chapter-count">
                      {entry.notes.length} note{entry.notes.length === 1 ? '' : 's'}
                    </span>
                    <span className="journal-chapter-when">
                      {formatRelativeTime(entry.lastAt, now.getTime())}
                    </span>
                  </button>

                  {view === 'notes' && (
                    <div className="journal-notes">
                      {shown.map(note => (
                        <div
                          key={note.id}
                          className={`journal-note${note.indent > 0 ? ' journal-note-sub' : ''}${
                            note.category ? ` cat-${note.category}` : ''
                          }`}
                        >
                          <span className="journal-note-verse">{note.verse}</span>
                          {note.highlight ? (
                            // No words to show, so say what it is rather than
                            // rendering an empty row the reader cannot explain.
                            <span className="journal-note-text journal-note-mark">Marked</span>
                          ) : (
                            <span className="journal-note-text">{note.text}</span>
                          )}
                        </div>
                      ))}
                      {entry.notes.length > COLLAPSE_AT && (
                        <button
                          className="journal-note-more"
                          onClick={() => toggleExpanded(entry.key)}
                        >
                          {isExpanded ? 'Show less' : `Show ${hidden} more`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

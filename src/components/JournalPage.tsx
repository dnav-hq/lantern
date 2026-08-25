import React, { useEffect, useMemo, useState } from 'react'
import { NoteCategory, NoteWithPassageInfo } from '../types'
import { findBookByAlias } from '../utils/bibleBooks'
import { formatRelativeTime } from '../utils/relativeTime'
import { useApi } from '../api/context'
import { noteBodyText } from './StudyWorkbench'

interface JournalPageProps {
  // Open a chapter's reading view. A study is not a place any more — it's the
  // notes you left on a chapter — so every Journal row lands in the text.
  onOpenChapter: (bookName: string, chapter: number) => void
}

const CATEGORIES: NoteCategory[] = ['observation', 'historical', 'application', 'personal']
const CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: 'Observation',
  historical: 'Historical',
  application: 'Application',
  personal: 'Personal'
}

type Filter = 'all' | NoteCategory
type View = 'notes' | 'chapters'

// Soft time buckets. Deliberately vague at the edges — this is a record of
// where you've been reading, not a log, so "this week" is the right resolution.
type Bucket = 'Today' | 'This week' | 'Earlier this month' | 'Older'

// Exported for the unit test: bucketing is the one piece of Journal logic worth
// pinning down, and it's pure.
export function bucketFor(iso: string, now: Date = new Date()): Bucket {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'Older'
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  if (sameDay) return 'Today'
  const days = (now.getTime() - then.getTime()) / 86_400_000
  if (days < 7) return 'This week'
  if (then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth())
    return 'Earlier this month'
  return 'Older'
}

// "John 15:2-6" → "John". NoteWithPassageInfo carries the reference label but
// not a book number, and the label is built from the book's own name, so this
// round-trips through the same alias table the rest of the app uses.
function bookNameFromLabel(label: string): string {
  return label.replace(/\s+\d+(?::.*)?$/, '').trim()
}

interface ChapterGroup {
  key: string
  bookName: string
  chapter: number
  reference: string
  notes: NoteWithPassageInfo[]
  lastAt: string
}

// Derive the history: every note, gathered under the chapter it was written on,
// newest chapter first. There is no "study" row any more because a study is not
// a stored thing — it's this grouping.
export function groupByChapter(notes: NoteWithPassageInfo[]): ChapterGroup[] {
  const groups = new Map<string, ChapterGroup>()
  for (const n of notes) {
    const bookName = bookNameFromLabel(n.reference_label)
    const chapter = n.anchor_chapter_override ?? n.chapter_start
    const key = `${bookName}|${chapter}`
    const at = n.updated_at || n.created_at
    const existing = groups.get(key)
    if (existing) {
      existing.notes.push(n)
      if (at > existing.lastAt) existing.lastAt = at
    } else {
      groups.set(key, {
        key,
        bookName,
        chapter,
        reference: `${bookName} ${chapter}`,
        notes: [n],
        lastAt: at
      })
    }
  }
  return [...groups.values()]
    .map(g => ({
      ...g,
      notes: g.notes.sort(
        (a, b) =>
          (a.anchor_start_verse ?? a.verse_start) - (b.anchor_start_verse ?? b.verse_start) ||
          a.created_at.localeCompare(b.created_at)
      )
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

// Verse label for a note row: "15:4" / "15:4-6", the compact form a scanning
// eye can read down a column.
function verseLabel(chapter: number, n: NoteWithPassageInfo): string {
  const s = n.anchor_start_verse
  if (s === null) return `${chapter}`
  const e = n.anchor_end_verse ?? s
  return s === e ? `${chapter}:${s}` : `${chapter}:${s}-${e}`
}

// How many notes a chapter shows before folding the rest behind "show more".
const COLLAPSE_AT = 3

const SKELETON_DELAY_MS = 150

export default function JournalPage({ onOpenChapter }: JournalPageProps): React.ReactElement {
  const api = useApi()
  const [notes, setNotes] = useState<NoteWithPassageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [view, setView] = useState<View>('notes')
  const [filter, setFilter] = useState<Filter>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  useEffect(() => {
    if (!filterOpen) return
    const close = (): void => setFilterOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [filterOpen])

  const groups = useMemo(() => groupByChapter(notes), [notes])

  // The filter narrows the NOTES, then hides any chapter left with none — so
  // "Application" reads as a list of your applications, not a list of chapters
  // some of which happen to be empty.
  const filtered = useMemo(
    () =>
      groups
        .map(g => ({
          ...g,
          notes: filter === 'all' ? g.notes : g.notes.filter(n => n.category === filter)
        }))
        .filter(g => g.notes.length > 0),
    [groups, filter]
  )

  const openChapter = (g: ChapterGroup): void => {
    const book = findBookByAlias(g.bookName)
    onOpenChapter(book?.name ?? g.bookName, g.chapter)
  }

  if (loading) {
    if (!showSkeleton) return <div className="journal-page" />
    return (
      <div className="journal-page">
        <div className="journal-index">
          <div className="journal-header">
            <h1 className="journal-heading">Journal</h1>
            <span className="skeleton-line journal-sub-skeleton" aria-hidden="true" />
          </div>
          <div className="journal-body">
            <div className="journal-skeleton" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div className="journal-entry-skeleton" key={i}>
                  <div className="journal-entry-skeleton-top">
                    <span className="skeleton-line" style={{ width: '38%', height: 14 }} />
                    <span className="skeleton-line" style={{ width: 56, height: 10 }} />
                  </div>
                  <span
                    className="skeleton-line"
                    style={{ width: '70%', height: 10, marginTop: 8 }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="journal-page">
        <div className="journal-page-empty">
          <div className="journal-page-title">Journal</div>
          <p className="journal-page-hint">
            Nothing written down yet. Open a chapter, tap a verse and note what you see — it will
            gather here.
          </p>
        </div>
      </div>
    )
  }

  let lastBucket: Bucket | null = null

  return (
    <div className="journal-page">
      <div className="journal-index">
        <div className="journal-header">
          <h1 className="journal-heading">Journal</h1>
          <p className="journal-masthead">
            A quiet record of where you&rsquo;ve been reading, and what you noticed there.
          </p>
        </div>

        <div className="journal-controls">
          <div className="journal-seg" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-pressed={view === 'notes'}
              aria-selected={view === 'notes'}
              onClick={() => setView('notes')}
            >
              Notes
            </button>
            <button
              type="button"
              role="tab"
              aria-pressed={view === 'chapters'}
              aria-selected={view === 'chapters'}
              onClick={() => setView('chapters')}
            >
              Chapters
            </button>
          </div>
          <div className="journal-filter">
            <button
              type="button"
              className="journal-filter-trigger"
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              onClick={e => {
                e.stopPropagation()
                setFilterOpen(o => !o)
              }}
            >
              <span className={`journal-dot${filter === 'all' ? ' all' : ''}`} data-c={filter} />
              {filter === 'all' ? 'All' : CATEGORY_LABELS[filter]}
              <span aria-hidden="true" className="journal-chev">
                ▾
              </span>
            </button>
            {filterOpen && (
              <div
                className="journal-filter-menu"
                role="listbox"
                onClick={e => e.stopPropagation()}
              >
                {(['all', ...CATEGORIES] as Filter[]).map(c => (
                  <button
                    type="button"
                    key={c}
                    className="journal-filter-opt"
                    role="option"
                    aria-selected={filter === c}
                    onClick={() => {
                      setFilter(c)
                      setExpanded(new Set())
                      setFilterOpen(false)
                    }}
                  >
                    <span className={`journal-dot${c === 'all' ? ' all' : ''}`} data-c={c} />
                    {c === 'all' ? 'All notes' : CATEGORY_LABELS[c]}
                    <span className="journal-check" aria-hidden="true">
                      ✓
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="journal-body">
          {filtered.length === 0 && (
            <p className="journal-page-hint journal-filter-empty">
              No {filter === 'all' ? '' : CATEGORY_LABELS[filter].toLowerCase() + ' '}notes yet.
            </p>
          )}
          {filtered.map(g => {
            const bucket = bucketFor(g.lastAt)
            const showBucket = bucket !== lastBucket
            lastBucket = bucket
            const isExpanded = expanded.has(g.key)
            const shown = isExpanded ? g.notes : g.notes.slice(0, COLLAPSE_AT)
            const uniqueCats = [...new Set(g.notes.map(n => n.category).filter(Boolean))]
            return (
              <React.Fragment key={g.key}>
                {showBucket && (
                  <div className="journal-bucket">
                    <span className="journal-bucket-label">{bucket}</span>
                    <span className="journal-bucket-rule" />
                  </div>
                )}
                <div className="journal-study">
                  <button
                    type="button"
                    className="journal-study-head"
                    onClick={() => openChapter(g)}
                  >
                    <span className="journal-study-ref">{g.reference}</span>
                    {view === 'chapters' && uniqueCats.length > 0 && (
                      <span className="journal-dots">
                        {uniqueCats.map(c => (
                          <span key={c} className="journal-dot-sm" data-c={c} />
                        ))}
                      </span>
                    )}
                    <span className="journal-study-count">
                      {g.notes.length} note{g.notes.length === 1 ? '' : 's'}
                    </span>
                    <span className="journal-study-when">{formatRelativeTime(g.lastAt)}</span>
                  </button>

                  {view === 'notes' && (
                    <>
                      <div className="journal-notes">
                        {shown.map(n => (
                          <button
                            type="button"
                            key={n.id}
                            className="journal-note"
                            data-c={n.category ?? 'none'}
                            onClick={() => openChapter(g)}
                          >
                            <span className="journal-note-v">{verseLabel(g.chapter, n)}</span>
                            <span className="journal-note-t">{noteBodyText(n.content)}</span>
                          </button>
                        ))}
                      </div>
                      {g.notes.length > COLLAPSE_AT && (
                        <button
                          type="button"
                          className="journal-more"
                          onClick={() =>
                            setExpanded(prev => {
                              const next = new Set(prev)
                              if (next.has(g.key)) next.delete(g.key)
                              else next.add(g.key)
                              return next
                            })
                          }
                        >
                          {isExpanded ? 'Show less' : `Show ${g.notes.length - COLLAPSE_AT} more`}
                        </button>
                      )}
                    </>
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

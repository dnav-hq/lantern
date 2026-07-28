import React, { useState, useEffect, useRef } from 'react'
import { Passage, Note, BiblePassage, NoteCategory } from '../types'
import { parseNoteLine } from '../utils/noteParser'
import { useApi } from '../api/context'
import { getBibleVerse } from '../bible/service'
import { useTranslation } from '../utils/useTranslation'
import InlineTagInput from './InlineTagInput'
import RichEditInput from './RichEditInput'
import InlineDeleteConfirm from './InlineDeleteConfirm'
import CrossRefPill from './CrossRefPill'
import ScriptureSkeleton from './ScriptureSkeleton'
import QuickEditCard from './QuickEditCard'
import { formatRelativeTime } from '../utils/relativeTime'
import { useVerseMarquee } from '../utils/useVerseMarquee'
import { bookByNumber } from '../utils/bibleBooks'

interface ReadingModeProps {
  passage: Passage
  onStudy: (passageId: string) => void
  onRefresh?: () => void
  // The bridge: jump from a note into the full study (unified StudyMode flow).
  // Always present — a quick note graduates into a full study by being opened.
  onOpenStudy: () => void
  onPassageDeleted?: () => void
}

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: 'Observation',
  historical: 'Historical',
  application: 'Application',
  personal: 'Personal'
}

interface NoteGroup {
  main: Note
  subnotes: Note[]
}

// Order note rows into groups (a level-0 note + its following indented subnotes),
// preserving created_at order. Returned in document order so rail placement and
// the mobile stacked list stay stable.
function groupNotes(notes: Note[]): NoteGroup[] {
  const sorted = [...notes].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  )
  const groups: NoteGroup[] = []
  let current: NoteGroup | null = null
  for (const note of sorted) {
    if (note.indent_level === 0 || current === null) {
      current = { main: note, subnotes: [] }
      groups.push(current)
    } else {
      current.subnotes.push(note)
    }
  }
  return groups
}

function verseRangeLabel(start: number, end: number): string {
  return start === end ? `v${start}` : `vv.${start}-${end}`
}

// Horizontal step (px) between overlapping rail-note lanes.
const LANE_STEP = 14

// Greedy interval coloring: overlapping range notes get distinct "lanes" so their
// brackets sit side-by-side (each still spanning its own verses) instead of
// collapsing onto one another. Sort by start verse; place each note in the first
// lane whose last end-verse is below this note's start, else open a new lane.
function assignRailLanes(groups: NoteGroup[]): Map<string, number> {
  const sorted = [...groups].sort((a, b) => {
    const sa = a.main.anchor_start_verse!
    const sb = b.main.anchor_start_verse!
    return sa - sb || (a.main.anchor_end_verse ?? sa) - (b.main.anchor_end_verse ?? sb)
  })
  const laneEnds: number[] = []
  const laneOf = new Map<string, number>()
  for (const g of sorted) {
    const s = g.main.anchor_start_verse!
    const e = g.main.anchor_end_verse ?? s
    let lane = laneEnds.findIndex(end => end < s)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(e)
    } else {
      laneEnds[lane] = e
    }
    laneOf.set(g.main.id, lane)
  }
  return laneOf
}

function RenderedNoteContent({ content }: { content: string }): React.ReactElement {
  const { segments } = parseNoteLine(content)
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'verse-anchor':
            return (
              <span key={i} className="pill-verse">
                {seg.display}
              </span>
            )
          case 'tag':
            return null
          case 'cross-ref':
            return (
              <CrossRefPill
                key={i}
                reference={seg.data?.reference ?? seg.raw}
                display={seg.display}
              />
            )
          default:
            return <span key={i}>{seg.raw}</span>
        }
      })}
    </>
  )
}

export default function ReadingMode({
  passage,
  onStudy,
  onRefresh,
  onOpenStudy,
  onPassageDeleted
}: ReadingModeProps): React.ReactElement {
  const api = useApi()
  const [translation] = useTranslation()
  const [biblePassage, setBiblePassage] = useState<BiblePassage | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [highlightedNoteIds, setHighlightedNoteIds] = useState<Set<string>>(new Set())
  const [highlightedVerses, setHighlightedVerses] = useState<Set<number>>(new Set())
  const [inlineVerse, setInlineVerse] = useState<number | null>(null)
  const [inlineText, setInlineText] = useState('')
  const [savingInline, setSavingInline] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null)
  // Brief accent pulse on a note card right after a quick-edit save commits —
  // see BookDetailPage's identical mechanism / motion.css .just-saved.
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const markJustSaved = (id: string): void => {
    setJustSavedId(id)
    setTimeout(() => setJustSavedId(prev => (prev === id ? null : prev)), 900)
  }
  // Verse-range selection for the floating action bar: tap a verse to start,
  // tap another to extend (same gesture as ChapterView's Bible-home reader).
  const [selAnchor, setSelAnchor] = useState<number | null>(null)
  const [selFocus, setSelFocus] = useState<number | null>(null)
  // Ref map for the chip → verse-row scroll linkage (mobile) and marquee hit-test.
  const verseRowRefs = useRef<Map<number, HTMLElement>>(new Map())
  // The full-width reading container the marquee is scoped to, so a drag starting
  // in the side whitespace (not just over the verse grid) begins a selection.
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    setBiblePassage(null)
    setNotes([])
    setHighlightedNoteIds(new Set())
    setHighlightedVerses(new Set())
    setEditingNoteId(null)

    Promise.all([
      getBibleVerse(passage.reference_label, translation),
      api.getNotesByPassage(passage.id)
    ])
      .then(([bp, ns]) => {
        if (bp) setBiblePassage(bp)
        setNotes(ns)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage.id, translation])

  // Escape clears every highlight/selection everywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') clearAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Note-highlight and range-selection are mutually exclusive dimming systems.
  // Entering either fully clears the other so a verse is never in a stacked,
  // half-dimmed limbo — its end state is binary.
  const clearAll = (): void => {
    setSelAnchor(null)
    setSelFocus(null)
    setHighlightedVerses(new Set())
    setHighlightedNoteIds(new Set())
  }

  const highlightVersesForNote = (note: Note): void => {
    if (note.anchor_start_verse === null) return
    const start = note.anchor_start_verse
    const end = note.anchor_end_verse ?? start
    const vSet = new Set<number>()
    for (let v = start; v <= end; v++) vSet.add(v)
    setHighlightedVerses(vSet)
    setHighlightedNoteIds(new Set())
    // Highlighting a note's verses clears any active range selection.
    setSelAnchor(null)
    setSelFocus(null)
  }

  const handleNoteClick = (note: Note): void => {
    if (editingNoteId !== null) return
    highlightVersesForNote(note)
  }

  // Chip linkage: scroll the anchored verse into view (mobile).
  const scrollToVerse = (verse: number): void => {
    verseRowRefs.current.get(verse)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const clearSelection = (): void => {
    setSelAnchor(null)
    setSelFocus(null)
  }

  const handleVerseClick = (verseNum: number): void => {
    // A drag that just ended (possibly folding back onto its own start verse)
    // already committed the range via onRangeSelected — don't let the click
    // event mouseup produces re-run tap logic and clobber it.
    if (suppressNextClick()) return
    if (editingNoteId !== null) return
    const anchored = notes.filter(
      n =>
        n.anchor_start_verse !== null &&
        verseNum >= n.anchor_start_verse &&
        verseNum <= (n.anchor_end_verse ?? n.anchor_start_verse)
    )
    if (anchored.length > 0) {
      setHighlightedNoteIds(new Set(anchored.map(n => n.id)))
      setHighlightedVerses(new Set())
    }
    // Drive the range selection (same tap-anchor/tap-extend gesture as
    // ChapterView's Bible-home reader).
    if (selAnchor === null) {
      setSelAnchor(verseNum)
      setSelFocus(verseNum)
    } else if (selFocus === verseNum && selAnchor === verseNum) {
      clearSelection()
    } else {
      setSelFocus(verseNum)
    }
  }

  // Desktop marquee (box) selection over the scripture area: click-drag draws a
  // selection box and selects every verse its row intersects, driving the same
  // selAnchor/selFocus state as the tap gesture. A plain click (no movement)
  // falls through to handleVerseClick so tap-anchor/tap-extend keeps working.
  // See useVerseMarquee for the native-text-copy tradeoff and stale-state guards.
  const { marquee, containerPointerDown, suppressNextClick } = useVerseMarquee(
    containerRef,
    verseRowRefs,
    (start, end) => {
      // Selecting verses clears any note highlight (mutually exclusive).
      setHighlightedVerses(new Set())
      setHighlightedNoteIds(new Set())
      setSelAnchor(start)
      setSelFocus(end)
    }
  )

  // A plain click on empty scripture whitespace (not a verse row, note, or
  // control) clears every highlight/selection. A trailing click synthesised by a
  // just-completed marquee drag is swallowed so it can't wipe the fresh range.
  const handleBackgroundClick = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement
    if (
      target.closest(
        '.reading-verse-row, .rail-note, .reading-note-card, .inline-verse-notes, .verse-action-bar, .inline-note-row, button, a, input, textarea, [contenteditable]'
      )
    )
      return
    if (suppressNextClick()) return
    clearAll()
  }

  // Current selection as an inclusive [start, end] range, or null.
  const selRange: [number, number] | null =
    selAnchor === null || selFocus === null
      ? null
      : [Math.min(selAnchor, selFocus), Math.max(selAnchor, selFocus)]

  const bookAndChapter =
    `${bookByNumber(passage.book_number)?.name ?? ''} ${passage.chapter_start}`.trim()
  const selReference = selRange
    ? selRange[0] === selRange[1]
      ? `${bookAndChapter}:${selRange[0]}`
      : `${bookAndChapter}:${selRange[0]}-${selRange[1]}`
    : ''

  const selVerseTag = selRange
    ? selRange[0] === selRange[1]
      ? `v${selRange[0]} `
      : `v${selRange[0]}-${selRange[1]} `
    : ''

  const handleQuickNoteFromSelection = (): void => {
    if (selRange === null) return
    setInlineVerse(selRange[0])
    setInlineText(selVerseTag)
    clearSelection()
  }

  // Unlike ChapterView's selection button, this one has no "no overlap" case:
  // ReadingMode only ever shows verses from the passage already open, so any
  // selection here is always inside it — the label reflects that unconditionally.
  const handleContinueStudyOnSelection = (): void => {
    if (selRange === null) return
    clearSelection()
    onOpenStudy()
  }

  const handleAddInline = (verseNum: number): void => {
    setInlineVerse(verseNum)
    setInlineText(`v${verseNum} `)
    setEditingNoteId(null)
  }

  const handleInlineSave = async (): Promise<void> => {
    if (!inlineText.trim() || savingInline) return
    setSavingInline(true)
    try {
      const parsed = parseNoteLine(inlineText)
      const sessions = await api.getSessionsByPassage(passage.id)
      let sessionId: string
      if (sessions.length > 0) {
        sessionId = sessions[0].id
      } else {
        const session = await api.createSession(passage.id)
        sessionId = session.id
      }
      const note = await api.createNote({
        session_id: sessionId,
        content: inlineText,
        anchor_start_verse: parsed.anchorStart,
        anchor_end_verse: parsed.anchorEnd,
        anchor_book_override: null,
        anchor_chapter_override: null,
        category: parsed.category,
        indent_level: 0
      })
      setNotes(prev => [...prev, note])
      setInlineVerse(null)
      setInlineText('')
      markJustSaved(note.id)
      onRefresh?.()
    } finally {
      setSavingInline(false)
    }
  }

  const handleStartEdit = (note: Note): void => {
    setEditingNoteId(note.id)
    setEditText(note.content)
    setInlineVerse(null)
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (editingNoteId === null || !editText.trim()) return
    const parsed = parseNoteLine(editText)
    const updated = await api.updateNote(editingNoteId, {
      content: editText,
      anchor_start_verse: parsed.anchorStart,
      anchor_end_verse: parsed.anchorEnd,
      category: parsed.category
    })
    setNotes(prev => prev.map(n => (n.id === editingNoteId ? updated : n)))
    markJustSaved(editingNoteId)
    setEditingNoteId(null)
    onRefresh?.()
  }

  const handleDeleteNote = async (note: Note): Promise<void> => {
    const result = await api.deleteNoteAndCascade(note.id)
    setNotes(prev => prev.filter(n => n.id !== note.id))
    setConfirmDelete(null)
    onRefresh?.()
    if (result.deletedPassageId) {
      onPassageDeleted?.()
    }
  }

  if (loading) {
    return (
      <div className="reading-layout">
        <div className="reading-content">
          <ScriptureSkeleton />
        </div>
      </div>
    )
  }

  const groups = groupNotes(notes)
  const anchoredGroups = groups.filter(g => g.main.anchor_start_verse !== null)
  const passageGroups = groups.filter(g => g.main.anchor_start_verse === null)
  // Split anchored notes by span width: single-verse notes render INLINE beneath
  // their verse row; only multi-verse range notes go into the right-hand rail.
  const isRangeGroup = (g: NoteGroup): boolean => {
    const s = g.main.anchor_start_verse!
    const e = g.main.anchor_end_verse ?? s
    return e > s
  }
  const rangeGroups = anchoredGroups.filter(isRangeGroup)
  // Lane per range note so overlapping brackets sit side-by-side in the rail.
  const railLanes = assignRailLanes(rangeGroups)
  const inlineGroups = anchoredGroups.filter(g => !isRangeGroup(g))
  const inlineGroupsByVerse = new Map<number, NoteGroup[]>()
  for (const g of inlineGroups) {
    const v = g.main.anchor_start_verse!
    const list = inlineGroupsByVerse.get(v)
    if (list) list.push(g)
    else inlineGroupsByVerse.set(v, [g])
  }
  // The rail (margin column) only appears when there is at least one range note
  // or a passage-level note; otherwise the scripture column centers as a block.
  const hasRail = rangeGroups.length > 0 || passageGroups.length > 0
  const hasAnyHighlightedVerse = highlightedVerses.size > 0

  // Map each rendered verse number to its 1-based grid row so rail notes can be
  // placed at `grid-row: startRow / endRow+1` — the bracket then spans exactly the
  // verses the note anchors to. Verses that fall outside the loaded passage are
  // clamped to the available range.
  const verses = biblePassage?.verses ?? []
  const rowByVerse = new Map<number, number>()
  verses.forEach((v, i) => rowByVerse.set(v.verse, i + 1))
  const clampRow = (verse: number): number => {
    if (rowByVerse.has(verse)) return rowByVerse.get(verse)!
    // Clamp to first/last rendered row.
    return verse < verses[0]?.verse ? 1 : verses.length
  }
  // Which verse rows carry a span bracket (mobile accent indicator) — range
  // notes only; single-verse notes render inline, not bracketed.
  const bracketByVerse = new Map<number, NoteCategory | null>()
  for (const g of rangeGroups) {
    const s = g.main.anchor_start_verse!
    const e = g.main.anchor_end_verse ?? s
    for (let v = s; v <= e; v++) {
      if (!bracketByVerse.has(v)) bracketByVerse.set(v, g.main.category)
    }
  }
  // Mobile: range notes render inline right after their LAST anchored verse (the
  // rail is desktop-only), so a note about vv.2-6 sits under v6 — with the verses
  // it covers — rather than being dumped at the bottom of the whole chapter.
  const lastVerse = verses[verses.length - 1]?.verse
  const mobileRangeByVerse = new Map<number, NoteGroup[]>()
  for (const g of rangeGroups) {
    const s = g.main.anchor_start_verse!
    const e = g.main.anchor_end_verse ?? s
    const key = rowByVerse.has(e) ? e : lastVerse
    const list = mobileRangeByVerse.get(key)
    if (list) list.push(g)
    else mobileRangeByVerse.set(key, [g])
  }

  const renderNoteActions = (note: Note): React.ReactElement => (
    <div className="se-note-actions">
      <button
        className="se-icon-btn se-icon-primary"
        title="Edit note"
        onClick={e => {
          e.stopPropagation()
          handleStartEdit(note)
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        className="se-icon-btn"
        title="Open study"
        onClick={e => {
          e.stopPropagation()
          onOpenStudy()
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </button>
      <button
        className="se-icon-btn se-icon-danger"
        title="Delete"
        onClick={e => {
          e.stopPropagation()
          setConfirmDelete(note)
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>
  )

  const renderNoteGroup = (group: NoteGroup, opts?: { chip?: boolean }): React.ReactElement => {
    const { main, subnotes } = group
    const isHighlighted = highlightedNoteIds.has(main.id)
    const isEditing = editingNoteId === main.id
    const isConfirmingDelete = confirmDelete?.id === main.id
    const hasAnchor = main.anchor_start_verse !== null
    const rangeLabel = hasAnchor
      ? verseRangeLabel(main.anchor_start_verse!, main.anchor_end_verse ?? main.anchor_start_verse!)
      : ''
    return (
      <div
        key={main.id}
        className={`reading-note-card cat-${main.category || 'none'}${isHighlighted ? ' highlighted' : ''}${justSavedId === main.id ? ' just-saved' : ''}`}
      >
        <div className="reading-note-metarow">
          {opts?.chip && hasAnchor && (
            <button
              className="note-range-chip"
              onClick={e => {
                e.stopPropagation()
                scrollToVerse(main.anchor_start_verse!)
              }}
              title={`Go to ${rangeLabel}`}
            >
              {rangeLabel}
            </button>
          )}
          {main.category && (
            <span className={`reading-note-meta cat-${main.category}`}>
              {CATEGORY_LABELS[main.category]}
            </span>
          )}
          <time className="note-timestamp" dateTime={main.updated_at || main.created_at}>
            {formatRelativeTime(main.updated_at || main.created_at)}
          </time>
        </div>
        {isEditing ? (
          <QuickEditCard
            category={main.category}
            mode="edit"
            saveDisabled={!editText.trim()}
            onSave={() => void handleSaveEdit()}
            onCancel={() => setEditingNoteId(null)}
          >
            <RichEditInput
              className="note-edit-textarea"
              initialValue={editText}
              onChange={setEditText}
              onSave={() => void handleSaveEdit()}
              onCancel={() => setEditingNoteId(null)}
            />
          </QuickEditCard>
        ) : isConfirmingDelete ? (
          <InlineDeleteConfirm
            onConfirm={() => void handleDeleteNote(main)}
            onCancel={() => setConfirmDelete(null)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ flex: 1 }} onClick={() => handleNoteClick(main)}>
              <RenderedNoteContent content={main.content} />
            </div>
            {renderNoteActions(main)}
          </div>
        )}

        {subnotes.length > 0 && (
          <div className="reading-subnotes">
            {subnotes.map(sub => {
              const isSubEditing = editingNoteId === sub.id
              const isSubConfirmingDelete = confirmDelete?.id === sub.id
              return (
                <div
                  key={sub.id}
                  className={`reading-subnote${highlightedNoteIds.has(sub.id) ? ' highlighted' : ''}${justSavedId === sub.id ? ' just-saved' : ''}`}
                >
                  <span className="reading-subnote-bullet">◦</span>
                  {isSubEditing ? (
                    <div style={{ flex: 1 }}>
                      <QuickEditCard
                        category={sub.category}
                        mode="edit"
                        saveDisabled={!editText.trim()}
                        onSave={() => void handleSaveEdit()}
                        onCancel={() => setEditingNoteId(null)}
                      >
                        <RichEditInput
                          className="note-edit-textarea"
                          initialValue={editText}
                          onChange={setEditText}
                          onSave={() => void handleSaveEdit()}
                          onCancel={() => setEditingNoteId(null)}
                        />
                      </QuickEditCard>
                    </div>
                  ) : isSubConfirmingDelete ? (
                    <div style={{ flex: 1 }}>
                      <InlineDeleteConfirm
                        onConfirm={() => void handleDeleteNote(sub)}
                        onCancel={() => setConfirmDelete(null)}
                      />
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1 }} onClick={() => handleNoteClick(sub)}>
                        {sub.category && (
                          <div className={`reading-subnote-meta cat-${sub.category}`}>
                            {CATEGORY_LABELS[sub.category]}
                          </div>
                        )}
                        <RenderedNoteContent content={sub.content} />
                      </div>
                      {renderNoteActions(sub)}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="reading-layout"
      onPointerDown={containerPointerDown}
      onClick={handleBackgroundClick}
    >
      {marquee && (
        <div
          className="verse-marquee"
          aria-hidden="true"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height
          }}
        />
      )}
      <div className="reading-content fade-in">
        {/* Heading */}
        <div className="reading-heading">
          <h1>{passage.reference_label}</h1>
          <div className="reading-meta">
            <span>
              {passage.session_count ?? 0} session{passage.session_count !== 1 ? 's' : ''}
            </span>
            {passage.last_studied && (
              <span>Last studied {new Date(passage.last_studied).toLocaleDateString()}</span>
            )}
            <span
              style={{ color: '#7F77DD', cursor: 'pointer', marginLeft: 'auto' }}
              onClick={() => onStudy(passage.id)}
            >
              Edit notes
            </span>
          </div>
        </div>

        {biblePassage ? (
          <>
            {/* Passage-level (anchorless) notes render at the top of the rail area,
                not bracketed to any verse. */}
            {passageGroups.length > 0 && (
              <div className="rail-passage-notes">
                <div className="rail-passage-notes-label">Passage notes</div>
                <div className="reading-notes-group">
                  {passageGroups.map(group => renderNoteGroup(group))}
                </div>
              </div>
            )}

            {/* Study-Bible grid: scripture rows in column 1, rail notes (range
                notes only) in column 2 spanning their anchor range. The rail
                collapses when there are no range/passage notes. On mobile CSS
                collapses this to a single column. onPointerDown starts a marquee
                box selection over the scripture area. */}
            <div className={`scripture-grid${hasRail ? '' : ' no-rail'}`}>
              {verses.map((v, i) => {
                const isSelected =
                  selRange !== null && v.verse >= selRange[0] && v.verse <= selRange[1]
                const isHighlighted = highlightedVerses.has(v.verse)
                const isDimmed =
                  (hasAnyHighlightedVerse && !isHighlighted) || (selRange !== null && !isSelected)
                const showInline = inlineVerse === v.verse
                const bracketCat = bracketByVerse.get(v.verse)

                const inlineHere = inlineGroupsByVerse.get(v.verse)
                const mobileRangeHere = mobileRangeByVerse.get(v.verse)

                return (
                  <div
                    key={v.verse}
                    className="reading-verse-block"
                    style={{ gridRow: i + 1, '--stagger-i': i } as React.CSSProperties}
                  >
                    <div
                      ref={el => {
                        if (el) verseRowRefs.current.set(v.verse, el)
                        else verseRowRefs.current.delete(v.verse)
                      }}
                      className={`reading-verse-row${isHighlighted ? ' highlighted' : ''}${isSelected ? ' selected' : ''}`}
                      onClick={() => handleVerseClick(v.verse)}
                      style={isDimmed ? { opacity: 0.35 } : undefined}
                    >
                      {bracketByVerse.has(v.verse) && (
                        <span
                          className={`verse-span-bracket cat-${bracketCat || 'none'}`}
                          title="Note anchored here"
                          aria-hidden="true"
                        />
                      )}
                      <span className="verse-number">{v.verse}</span>
                      <span className="verse-text">{v.text}</span>
                      <span
                        className="verse-add-btn"
                        data-no-drag
                        onClick={e => {
                          e.stopPropagation()
                          handleAddInline(v.verse)
                        }}
                        title="Add note"
                      >
                        +
                      </span>
                    </div>

                    {/* Single-verse notes render inline beneath their verse row. */}
                    {inlineHere && inlineHere.length > 0 && (
                      <div className="reading-notes-group inline-verse-notes">
                        {inlineHere.map(group => renderNoteGroup(group))}
                      </div>
                    )}

                    {/* Mobile only: range notes render after their last anchored
                        verse (desktop uses the rail; this is display:none there). */}
                    {mobileRangeHere && mobileRangeHere.length > 0 && (
                      <div className="reading-notes-group mobile-range-notes">
                        {mobileRangeHere.map(group => renderNoteGroup(group, { chip: true }))}
                      </div>
                    )}

                    {showInline && (
                      <div className="inline-note-row">
                        <QuickEditCard
                          mode="create"
                          saveDisabled={!inlineText.trim() || savingInline}
                          onSave={() => void handleInlineSave()}
                          onCancel={() => {
                            setInlineVerse(null)
                            setInlineText('')
                          }}
                        >
                          <InlineTagInput
                            value={inlineText}
                            onChange={setInlineText}
                            onEnter={handleInlineSave}
                            onEscape={() => {
                              setInlineVerse(null)
                              setInlineText('')
                            }}
                            className="inline-note-input"
                            placeholder={`v${v.verse} type a note…`}
                            autoFocus
                          />
                        </QuickEditCard>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Desktop rail notes — range notes only, each spanning its anchor
                  range via grid-row. Single-verse notes render inline above. */}
              {rangeGroups.map(group => {
                const s = group.main.anchor_start_verse!
                const e = group.main.anchor_end_verse ?? s
                const isHl = highlightedNoteIds.has(group.main.id)
                const lane = railLanes.get(group.main.id) ?? 0
                return (
                  <div
                    key={group.main.id}
                    className={`rail-note${isHl ? ' highlighted' : ''}`}
                    style={{
                      gridRow: `${clampRow(s)} / ${clampRow(e) + 1}`,
                      marginLeft: lane * LANE_STEP
                    }}
                  >
                    <span
                      className={`rail-bracket cat-${group.main.category || 'none'}`}
                      aria-hidden="true"
                    />
                    <div className="rail-note-body">{renderNoteGroup(group)}</div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ color: '#CCC', fontSize: 13 }}>Verse text not available.</div>
        )}
      </div>

      {selRange !== null && inlineVerse === null && (
        <div className="verse-action-bar" role="toolbar" aria-label="Selection actions">
          <span className="verse-action-ref">{selReference}</span>
          <span className="verse-action-hint">Hold Alt and drag to select the text to copy</span>
          <div className="verse-action-btns">
            <button className="verse-action-btn primary" onClick={handleQuickNoteFromSelection}>
              Quick note
            </button>
            <button className="verse-action-btn" onClick={handleContinueStudyOnSelection}>
              Continue study on {selReference}
            </button>
          </div>
          <button
            className="verse-action-clear"
            onClick={clearSelection}
            aria-label="Clear selection"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

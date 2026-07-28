import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BiblePassage, NoteWithPassageInfo, NoteCategory, Passage } from '../types'
import { BibleBook, findBookByAlias } from '../utils/bibleBooks'
import { parseNoteLine } from '../utils/noteParser'
import { useApi } from '../api/context'
import { getBibleVerse } from '../bible/service'
import { useTranslation } from '../utils/useTranslation'
import InlineTagInput from './InlineTagInput'
import RichEditInput from './RichEditInput'
import InlineDeleteConfirm from './InlineDeleteConfirm'
import CrossRefPill from './CrossRefPill'
import ErrorBoundary from './ErrorBoundary'
import ScriptureSkeleton from './ScriptureSkeleton'
import QuickEditCard from './QuickEditCard'
import { useVerseMarquee } from '../utils/useVerseMarquee'

// ─── tiny helpers ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: 'Observation',
  historical: 'Historical',
  application: 'Application',
  personal: 'Personal'
}

interface NoteGroup {
  main: NoteWithPassageInfo
  subnotes: NoteWithPassageInfo[]
}

// (chapter, verse) -> a single sortable number, so range overlap is a plain
// numeric interval comparison. 1000 headroom per chapter comfortably covers
// every book (Psalm 119, the longest chapter, has 176 verses).
const toKey = (chapter: number, verse: number): number => chapter * 1000 + verse

// "Start study on {ref}" / "Study chapter" should land in an existing study
// if one already covers the selected verses, rather than always starting
// blank — overlap/containment, not just an exact-range match, per the
// decided behavior: a note anchored anywhere inside the selection should
// show up, regardless of exactly which range you dragged this time. Picks
// the first match; multiple distinct overlapping efforts merging into one
// editor is the deferred "multiple study instances" feature (see BACKLOG).
function findOverlappingPassage(
  passages: Passage[],
  chapter: number,
  startVerse: number,
  endVerse: number
): Passage | undefined {
  const selStart = toKey(chapter, startVerse)
  const selEnd = toKey(chapter, endVerse)
  return passages.find(p => {
    const pStart = toKey(p.chapter_start, p.verse_start)
    const pEnd = toKey(p.chapter_end, p.verse_end)
    return pStart <= selEnd && pEnd >= selStart
  })
}

function groupNotes(notes: NoteWithPassageInfo[]): NoteGroup[] {
  const sorted = [...notes].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  )
  const groups: NoteGroup[] = []
  let current: NoteGroup | null = null
  for (const n of sorted) {
    if (n.indent_level === 0 || current === null) {
      current = { main: n, subnotes: [] }
      groups.push(current)
    } else {
      current.subnotes.push(n)
    }
  }
  return groups
}

function verseRangeLabel(start: number, end: number): string {
  return start === end ? `v${start}` : `vv.${start}-${end}`
}

// One-time discoverability hint: verses are tappable/clickable to select a
// range. Mirrors NoteEditor's hintAlreadySeen/markHintSeen pattern — plain
// localStorage, non-critical (worst case the hint reappears).
const VERSE_HINT_SEEN_KEY = 'berean.verseSelectHintSeen'
function verseHintAlreadySeen(): boolean {
  try {
    return localStorage.getItem(VERSE_HINT_SEEN_KEY) === '1'
  } catch {
    return true
  }
}
function markVerseHintSeen(): void {
  try {
    localStorage.setItem(VERSE_HINT_SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
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

// ─── chapter view ────────────────────────────────────────────────────────────

interface ChapterViewProps {
  bookName: string
  chapter: number
  notes: NoteWithPassageInfo[]
  passages: Passage[]
  onStudyChapter: (ref: string, passageId?: string) => void
  onOpenStudy: (passageId: string) => void
  onNotesChanged: () => void
}

function ChapterView({
  bookName,
  chapter,
  notes,
  passages,
  onStudyChapter,
  onOpenStudy,
  onNotesChanged
}: ChapterViewProps): React.ReactElement {
  const api = useApi()
  const [translation] = useTranslation()
  const [bibleData, setBibleData] = useState<BiblePassage | null>(null)
  const [loading, setLoading] = useState(true)
  const [highlightedNoteIds, setHighlightedNoteIds] = useState<Set<string>>(new Set())
  const [highlightedVerses, setHighlightedVerses] = useState<Set<number>>(new Set())
  const [inlineVerse, setInlineVerse] = useState<number | null>(null)
  const [inlineText, setInlineText] = useState('')
  const [savingInline, setSavingInline] = useState(false)
  // Verse-range selection for the floating action bar: tap a verse to start,
  // tap another to extend; the range spans min..max of the two anchors.
  const [selAnchor, setSelAnchor] = useState<number | null>(null)
  const [selFocus, setSelFocus] = useState<number | null>(null)
  // Point-of-use hint: shown once near the verse list until the reader's first
  // real selection, then auto-dismissed (also dismissible explicitly).
  const [showVerseHint, setShowVerseHint] = useState(() => !verseHintAlreadySeen())
  const [localNotes, setLocalNotes] = useState<NoteWithPassageInfo[]>(notes)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<NoteWithPassageInfo | null>(null)
  // Brief accent pulse on a note card right after a quick-edit save commits —
  // the quick-edit card itself unmounts synchronously on save, so this is
  // where the "saved" confirmation actually lives (see .just-saved in
  // motion.css). Cleared after the pulse's own duration.
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const markJustSaved = (id: string): void => {
    setJustSavedId(id)
    setTimeout(() => setJustSavedId(prev => (prev === id ? null : prev)), 900)
  }
  // Ref map for the chip → verse-row scroll linkage (mobile) and marquee hit-test.
  const verseRowRefs = useRef<Map<number, HTMLElement>>(new Map())
  // The full-width reading container the marquee is scoped to, so a drag starting
  // in the side whitespace (not just over the verse grid) begins a selection.
  const containerRef = useRef<HTMLDivElement>(null)

  const chapterNotes = localNotes.filter(
    n => n.chapter_start <= chapter && chapter <= n.chapter_end
  )

  const groups = groupNotes(chapterNotes)
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
  // Inline notes indexed by their anchor start verse (single-verse only).
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

  useEffect(() => {
    setLoading(true)
    setBibleData(null)
    getBibleVerse(`${bookName} ${chapter}`, translation)
      .then(data => {
        setBibleData(data)
      })
      .finally(() => setLoading(false))
  }, [bookName, chapter, translation])

  useEffect(() => {
    setLocalNotes(notes)
  }, [notes])

  // A real selection is itself proof the hint did its job — dismiss automatically.
  useEffect(() => {
    if (selAnchor !== null) {
      markVerseHintSeen()
      setShowVerseHint(false)
    }
  }, [selAnchor])

  // Note-highlight and range-selection are mutually exclusive dimming systems.
  // Entering either fully clears the other so a verse is never in a stacked,
  // half-dimmed limbo — its end state is binary.
  const clearAll = (): void => {
    setSelAnchor(null)
    setSelFocus(null)
    setHighlightedVerses(new Set())
    setHighlightedNoteIds(new Set())
  }

  // Escape clears every highlight/selection everywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') clearAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Current selection as an inclusive [start, end] range, or null.
  const selRange: [number, number] | null =
    selAnchor === null || selFocus === null
      ? null
      : [Math.min(selAnchor, selFocus), Math.max(selAnchor, selFocus)]

  const selReference = selRange
    ? selRange[0] === selRange[1]
      ? `${bookName} ${chapter}:${selRange[0]}`
      : `${bookName} ${chapter}:${selRange[0]}-${selRange[1]}`
    : ''

  const selVerseTag = selRange
    ? selRange[0] === selRange[1]
      ? `v${selRange[0]} `
      : `v${selRange[0]}-${selRange[1]} `
    : ''

  // The overlap check that decides "Start" vs "Continue" wording for the
  // selection action bar — computed here (not just inside the click handler)
  // so the label can react to it before the button is ever pressed.
  const selectionOverlap = selRange
    ? findOverlappingPassage(passages, chapter, selRange[0], selRange[1])
    : undefined

  const clearSelection = (): void => {
    setSelAnchor(null)
    setSelFocus(null)
  }

  const handleVerseClick = (v: number): void => {
    if (editingNoteId !== null) return
    // A drag that just ended (possibly folding back onto its own start verse)
    // already committed the range via onRangeSelected — don't let the click
    // event mouseup produces re-run tap logic and clobber it.
    if (suppressNextClick()) return
    // Highlight notes anchored to this verse, as before.
    const anchored = chapterNotes.filter(
      n =>
        n.anchor_start_verse !== null &&
        v >= n.anchor_start_verse &&
        v <= (n.anchor_end_verse ?? n.anchor_start_verse)
    )
    if (anchored.length) {
      setHighlightedNoteIds(new Set(anchored.map(n => n.id)))
    }
    setHighlightedVerses(new Set())
    // Drive the range selection.
    if (selAnchor === null) {
      setSelAnchor(v)
      setSelFocus(v)
    } else if (selFocus === v && selAnchor === v) {
      // Tapping the sole selected verse again clears.
      clearSelection()
    } else {
      // Extend the range to the newly tapped verse.
      setSelFocus(v)
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

  const handleStartStudyOnSelection = (): void => {
    if (!selReference || !selRange) return
    const existing = selectionOverlap
    clearSelection()
    // When reopening an existing passage, pass ITS OWN reference_label, not
    // the freshly-dragged selection's — StudyMode only ever reads the
    // reference text from initialPassageId's own fetch (never from
    // initialReference once a passageId is set), but the two still race to
    // set the transient scripture-preview state; matching them avoids a
    // visible flicker between "1 Cor 5:3-5" and the existing passage's real
    // "1 Cor 5:2-6" while that resolves.
    onStudyChapter(existing?.reference_label ?? selReference, existing?.id)
  }

  // The secondary "Or start a new study on these verses" affordance — only
  // ever shown when selectionOverlap is set. Deliberately omits a passageId
  // so onStudyChapter takes the same "+ Study" manual-entry path that already
  // creates a genuinely distinct Passage (see docs/proposals/study-id.md).
  const handleStartNewStudyOnSelection = (): void => {
    if (!selReference) return
    clearSelection()
    onStudyChapter(selReference)
  }

  const handleQuickNoteFromSelection = (): void => {
    if (selRange === null) return
    setInlineVerse(selRange[0])
    setInlineText(selVerseTag)
    clearSelection()
  }

  const highlightVersesForNote = (n: NoteWithPassageInfo): void => {
    if (n.anchor_start_verse === null) return
    const s = n.anchor_start_verse
    const e = n.anchor_end_verse ?? s
    const vs = new Set<number>()
    for (let i = s; i <= e; i++) vs.add(i)
    setHighlightedVerses(vs)
    setHighlightedNoteIds(new Set())
    // Highlighting a note's verses clears any active range selection.
    setSelAnchor(null)
    setSelFocus(null)
  }

  const handleNoteClick = (n: NoteWithPassageInfo): void => {
    if (editingNoteId !== null) return
    highlightVersesForNote(n)
  }

  // Chip linkage: scroll the anchored verse into view (mobile).
  const scrollToVerse = (verse: number): void => {
    verseRowRefs.current.get(verse)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleInlineSave = async (): Promise<void> => {
    if (!inlineText.trim() || savingInline || inlineVerse === null) return
    setSavingInline(true)
    try {
      const parsed = parseNoteLine(inlineText)
      const passages = await api.getPassages()
      let sessionId: string
      const chapterPassages = passages.filter(p =>
        p.reference_label.toLowerCase().startsWith(bookName.toLowerCase())
      )

      if (chapterPassages.length > 0) {
        const sessions = await api.getSessionsByPassage(chapterPassages[0].id)
        if (sessions.length > 0) {
          sessionId = sessions[0].id
        } else {
          const s = await api.createSession(chapterPassages[0].id)
          sessionId = s.id
        }
      } else {
        const newPassage = await api.createPassage({
          book_number: findBookByAlias(bookName)?.number ?? 1,
          chapter_start: chapter,
          verse_start: 1,
          chapter_end: chapter,
          verse_end: 99,
          reference_label: `${bookName} ${chapter}`
        })
        const s = await api.createSession(newPassage.id)
        sessionId = s.id
      }

      const saved = await api.createNote({
        session_id: sessionId,
        content: inlineText,
        anchor_start_verse: parsed.anchorStart,
        anchor_end_verse: parsed.anchorEnd,
        anchor_book_override: null,
        anchor_chapter_override: null,
        category: parsed.category,
        indent_level: 0
      })

      const enriched: NoteWithPassageInfo = {
        ...saved,
        chapter_start: chapter,
        chapter_end: chapter,
        verse_start: 1,
        verse_end: 99,
        reference_label: `${bookName} ${chapter}`
      }
      setLocalNotes(prev => [...prev, enriched])
      setInlineVerse(null)
      setInlineText('')
      markJustSaved(saved.id)
      onNotesChanged()
    } finally {
      setSavingInline(false)
    }
  }

  const handleStartEdit = (note: NoteWithPassageInfo): void => {
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
    setLocalNotes(prev => prev.map(n => (n.id === editingNoteId ? { ...n, ...updated } : n)))
    markJustSaved(editingNoteId)
    setEditingNoteId(null)
    onNotesChanged()
  }

  const handleDeleteNote = async (note: NoteWithPassageInfo): Promise<void> => {
    await api.deleteNoteAndCascade(note.id)
    setLocalNotes(prev => prev.filter(n => n.id !== note.id))
    setConfirmDelete(null)
    onNotesChanged()
  }

  // Resolve a note (anchored or passage-level) to the existing Passage it
  // belongs to, via the same overlap logic "Start study on {ref}" uses —
  // mirrors ReadingMode's onOpenStudy bridge, except ChapterView spans many
  // notes/passages so the id has to be resolved per-note rather than closed
  // over a single passage prop.
  const resolveNotePassageId = (note: NoteWithPassageInfo): string | undefined => {
    const start = note.anchor_start_verse ?? note.verse_start
    const end = note.anchor_end_verse ?? note.anchor_start_verse ?? note.verse_end
    return findOverlappingPassage(passages, note.chapter_start, start, end)?.id
  }

  const renderNoteActions = (note: NoteWithPassageInfo): React.ReactElement => {
    const openPassageId = resolveNotePassageId(note)
    return (
      <div className="se-note-actions">
        <button
          className="se-icon-btn"
          title="Edit"
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
        {openPassageId && (
          <button
            className="se-icon-btn"
            title="Open study"
            onClick={e => {
              e.stopPropagation()
              onOpenStudy(openPassageId)
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
        )}
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
  }

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
        {(main.category || (opts?.chip && hasAnchor)) && (
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
          </div>
        )}
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

  if (loading) {
    return <ScriptureSkeleton />
  }

  if (!bibleData) {
    return (
      <div style={{ color: '#CCC', fontSize: 13, padding: '16px 0' }}>
        Could not load verse text.
      </div>
    )
  }

  const hasHighlightedVerse = highlightedVerses.size > 0

  // Map each rendered verse to its 1-based grid row so rail notes can be placed at
  // `grid-row: startRow / endRow+1` and bracket exactly their anchor span. See the
  // .scripture-grid CSS comment for why numeric grid placement (not DOM measuring).
  const verses = bibleData.verses
  const rowByVerse = new Map<number, number>()
  verses.forEach((v, i) => rowByVerse.set(v.verse, i + 1))
  const clampRow = (verse: number): number =>
    rowByVerse.has(verse) ? rowByVerse.get(verse)! : verse < verses[0]?.verse ? 1 : verses.length
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
  // Same overlap check as the selection action bar, applied to the whole
  // chapter — "Study chapter" silently reopens an existing passage the same
  // way "Start study on {ref}" does, so it needs the same verb treatment.
  const chapterOverlap =
    lastVerse !== undefined ? findOverlappingPassage(passages, chapter, 1, lastVerse) : undefined
  const mobileRangeByVerse = new Map<number, NoteGroup[]>()
  for (const g of rangeGroups) {
    const s = g.main.anchor_start_verse!
    const e = g.main.anchor_end_verse ?? s
    const key = rowByVerse.has(e) ? e : lastVerse
    const list = mobileRangeByVerse.get(key)
    if (list) list.push(g)
    else mobileRangeByVerse.set(key, [g])
  }

  return (
    <div
      ref={containerRef}
      className="chapter-marquee-surface"
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
      <div className="book-chapter-content fade-in">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-faint)',
              letterSpacing: '0.04em'
            }}
          >
            CHAPTER {chapter}
          </div>
          <button
            className="btn-study-chapter"
            onClick={() => {
              onStudyChapter(
                chapterOverlap?.reference_label ?? `${bookName} ${chapter}`,
                chapterOverlap?.id
              )
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {chapterOverlap ? 'Continue chapter study' : 'Study chapter'}
          </button>
        </div>

        {showVerseHint && (
          <div className="verse-select-hint" role="note">
            <span className="verse-select-hint-text">
              <span className="hint-text-desktop">
                Click a verse to select it. Click another to extend the range.
              </span>
              <span className="hint-text-mobile">
                Tap a verse to select it. Tap another to extend the range.
              </span>
            </span>
            <button
              type="button"
              className="verse-select-hint-dismiss"
              onClick={() => {
                markVerseHintSeen()
                setShowVerseHint(false)
              }}
            >
              Got it
            </button>
          </div>
        )}

        {/* Passage-level (anchorless) notes render above the grid, not bracketed. */}
        {passageGroups.length > 0 && (
          <div className="rail-passage-notes">
            <div className="rail-passage-notes-label">Passage notes</div>
            <div className="reading-notes-group">
              {passageGroups.map(group => renderNoteGroup(group))}
            </div>
          </div>
        )}

        {/* Study-Bible grid: scripture in column 1, rail notes (range notes only) in
          column 2 spanning their anchor range. The rail collapses when there are no
          range/passage notes. Collapses to a single column on mobile (see CSS).
          onPointerDown starts a marquee box selection over the scripture area. */}
        <div className={`scripture-grid${hasRail ? '' : ' no-rail'}`}>
          {verses.map((v, i) => {
            const isSelected = selRange !== null && v.verse >= selRange[0] && v.verse <= selRange[1]
            const isHighlighted = highlightedVerses.has(v.verse)
            const isDimmed =
              (hasHighlightedVerse && !isHighlighted) || (selRange !== null && !isSelected)
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
                </div>

                {/* Single-verse notes render inline beneath their verse row. */}
                {inlineHere && inlineHere.length > 0 && (
                  <div className="reading-notes-group inline-verse-notes">
                    {inlineHere.map(group => renderNoteGroup(group))}
                  </div>
                )}

                {/* Mobile only: range notes render after their last anchored verse
                  (desktop uses the rail; this is display:none there). */}
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

          {/* Desktop rail notes — range notes only, each spanning its anchor range
            via grid-row. Single-verse notes render inline above. */}
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
      </div>

      {selRange !== null && inlineVerse === null && (
        <div className="verse-action-bar" role="toolbar" aria-label="Selection actions">
          <span className="verse-action-ref">{selReference}</span>
          <span className="verse-action-hint">Hold Alt and drag to select the text to copy</span>
          <div className="verse-action-btns">
            <button className="verse-action-btn primary" onClick={handleQuickNoteFromSelection}>
              Quick note
            </button>
            <button className="verse-action-btn" onClick={handleStartStudyOnSelection}>
              {selectionOverlap
                ? `Continue study on ${selReference}`
                : `Start study on ${selReference}`}
            </button>
            {selectionOverlap && (
              <button className="verse-action-secondary" onClick={handleStartNewStudyOnSelection}>
                Or start a new study on these verses
              </button>
            )}
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

// ─── main export ─────────────────────────────────────────────────────────────

interface BookDetailPageProps {
  bibleBook: BibleBook
  // Chapter to open on first mount (e.g. a search jump); defaults to 1.
  initialChapter?: number
  onBack: () => void
  onStudy: (reference: string, passageId?: string) => void
  onOpenStudy: (passageId: string) => void
  onRefresh?: () => void
}

export default function BookDetailPage({
  bibleBook,
  initialChapter,
  onBack,
  onStudy,
  onOpenStudy,
  onRefresh
}: BookDetailPageProps): React.ReactElement {
  const api = useApi()
  const [selectedChapter, setSelectedChapter] = useState(initialChapter ?? 1)
  const [allNotes, setAllNotes] = useState<NoteWithPassageInfo[]>([])
  // The book's existing Passages (not just notes) — needed to find one whose
  // range overlaps a fresh verse selection, so "Start study on {ref}" /
  // "Study chapter" can reopen it (with its existing notes) instead of
  // always starting blank. See findOverlappingPassage.
  const [bookPassages, setBookPassages] = useState<Passage[]>([])
  const chapterSelectorRef = useRef<HTMLDivElement>(null)

  const reloadNotes = useCallback(async (): Promise<void> => {
    const [notes, passages] = await Promise.all([
      api.getNotesByBook(bibleBook.number),
      api.getPassagesByBook(bibleBook.number)
    ])
    setAllNotes(notes)
    setBookPassages(passages)
    // Always refresh app-level state so the sidebar stays in sync
    onRefresh?.()
  }, [api, bibleBook.number, onRefresh])

  useEffect(() => {
    api.getNotesByBook(bibleBook.number).then(setAllNotes)
    api.getPassagesByBook(bibleBook.number).then(setBookPassages)
  }, [api, bibleBook.number])

  const chaptersWithNotes = new Set(allNotes.map(n => n.chapter_start))

  useEffect(() => {
    const sel = chapterSelectorRef.current?.querySelector(
      '.chapter-pill.active'
    ) as HTMLElement | null
    sel?.scrollIntoView({ inline: 'nearest', behavior: 'smooth' })
  }, [selectedChapter])

  const scrollChapters = (dir: number): void => {
    const el = chapterSelectorRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: 'smooth' })
  }

  const studiedCount = chaptersWithNotes.size

  return (
    <div className="book-detail-layout">
      <div className="book-detail-header">
        <div className="book-detail-header-inner">
          <button className="book-detail-back" onClick={onBack}>
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
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Library
          </button>
          <div>
            <h1 className="book-detail-title">{bibleBook.name}</h1>
            <div className="book-detail-meta">
              {bibleBook.chapters} chapters
              {studiedCount > 0 && (
                <>
                  {' '}
                  · <span style={{ color: 'var(--accent)' }}>{studiedCount} with notes</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="chapter-selector-wrap">
        <div className="chapter-selector-wrap-inner">
          <button
            className="chapter-nav-btn"
            onClick={() => scrollChapters(-1)}
            aria-label="Scroll left"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="chapter-selector" ref={chapterSelectorRef}>
            {Array.from({ length: bibleBook.chapters }, (_, i) => i + 1).map(ch => {
              const hasNotes = chaptersWithNotes.has(ch)
              const isActive = ch === selectedChapter
              return (
                <button
                  key={ch}
                  className={`chapter-pill${isActive ? ' active' : ''}${hasNotes ? ' has-notes' : ''}`}
                  onClick={() => setSelectedChapter(ch)}
                >
                  {ch}
                  {hasNotes && !isActive && <span className="chapter-note-dot" />}
                </button>
              )
            })}
          </div>
          <button
            className="chapter-nav-btn"
            onClick={() => scrollChapters(1)}
            aria-label="Scroll right"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="book-detail-content">
        <ErrorBoundary variant="pane" key={`${bibleBook.name}-${selectedChapter}`}>
          <ChapterView
            bookName={bibleBook.name}
            chapter={selectedChapter}
            notes={allNotes}
            passages={bookPassages}
            onStudyChapter={onStudy}
            onOpenStudy={onOpenStudy}
            onNotesChanged={reloadNotes}
          />
        </ErrorBoundary>
      </div>
    </div>
  )
}

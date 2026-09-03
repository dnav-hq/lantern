import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { BiblePassage, NoteWithPassageInfo, NoteCategory, Passage } from '../types'
import { BibleBook, readingShortBookName } from '../utils/bibleBooks'
import { parseNoteLine } from '../utils/noteParser'
import { useApi } from '../api/context'
import { getBibleVerse } from '../bible/service'
import { chapterNoteCategories } from '../utils/chapterNoteMarks'
import type { TranslationId } from '../bible/provider'
import { useReadingTranslation } from '../utils/useTranslation'
import { useIsGuest } from '../utils/guestContext'
import RichEditInput from './RichEditInput'
import InlineDeleteConfirm from './InlineDeleteConfirm'
import CrossRefPill from './CrossRefPill'
import ErrorBoundary from './ErrorBoundary'
import ScriptureSkeleton from './ScriptureSkeleton'
import QuickEditCard from './QuickEditCard'
import MobileNoteComposer from './MobileNoteComposer'
import CategoryMenu from './CategoryMenu'
import { isHighlight } from '../utils/noteKind'
import { useNoteCategories } from '../utils/useNoteCategories'
import MobileSelectionBar from './MobileSelectionBar'
import StudyWorkbench, { type AnchorRequest, type StudyRange } from './StudyWorkbench'
import ReadingControls from './ReadingControls'
import type { DisplayPrefs } from './ReadingPrefs'
import TranslationFooter from './TranslationFooter'
import { writeDraft, readDraft, clearDraft } from '../offline/draft'
import { useVerseMarquee } from '../utils/useVerseMarquee'
import { useChromeAutoHide } from '../utils/useScrollDirection'
import {
  adjacentChapter,
  chapterKeyOf,
  chapterLabel,
  useChapterPreload,
  useChapterSwipe,
  usePrefersReducedMotion,
  type ChapterRef
} from '../utils/useChapterNavigation'
import FootnoteVerseText from './FootnoteDoor'
import { markInstallEngagement } from '../utils/installNudge'
import { formatRelativeTime } from '../utils/relativeTime'

// ─── tiny helpers ────────────────────────────────────────────────────────────

interface NoteGroup {
  main: NoteWithPassageInfo
  subnotes: NoteWithPassageInfo[]
}

// The breakpoint main.css uses for the touch layout. The mobile capture flow
// (select-first + inline composer) is scoped to it; desktop reading keeps the
// marquee, the rail and the quick-edit card exactly as they were.
const MOBILE_QUERY = '(max-width: 768px)'

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (): void => setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

// A note's stored content carries its own anchor ("v9-10") and category tag
// ("@personal") inline — that is the existing model every other surface parses
// (see noteParser), and keeping it means a note written on a phone reads and
// edits identically on desktop. The mobile composer, though, edits PROSE and
// holds range + category as real controls, so the two are converted here.
const LEADING_META =
  /^(v\d+(?:-\d+)?|@(?:obs(?:ervation)?|hist(?:orical)?|app(?:lication)?|per(?:sonal)?))\b[ \t]*/i

function composerBodyOf(content: string): string {
  let rest = content.trimStart()
  for (;;) {
    const m = LEADING_META.exec(rest)
    if (!m) return rest
    rest = rest.slice(m[0].length)
  }
}

function composeNoteContent(
  body: string,
  start: number,
  end: number,
  category: NoteCategory | null
): string {
  const anchor = start === end ? `v${start}` : `v${start}-${end}`
  return `${anchor}${category ? ` @${category}` : ''} ${body.trim()}`.trim()
}

// (chapter, verse) -> a single sortable number, so range overlap is a plain
// numeric interval comparison. 1000 headroom per chapter comfortably covers
// every book (Psalm 119, the longest chapter, has 176 verses).
const toKey = (chapter: number, verse: number): number => chapter * 1000 + verse

// A fresh note should land in an existing passage if one already covers the
// verses it is anchored to, rather than creating a duplicate — overlap/containment, not just an exact-range match, per the
// decided behavior: a note anchored anywhere inside the selection should
// show up, regardless of exactly which range you dragged this time. Picks
// the first match; multiple distinct overlapping efforts merging into one
// editor is the deferred "multiple study instances" feature (see BACKLOG).
//
// It compares (chapter, verse) keys ONLY — the caller must hand it passages
// from a single book, or it will match the same numbers in a different one.
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

// The neighbour pane rendered during a swipe is inert (pointer-events: none)
// and exists for ~260ms; it gets no working handlers on purpose, so a chapter
// sliding past can never write a note or open a study.
const noop = (): void => {}

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
  // USFM book number for this pane — passed in (the parent already has it) rather
  // than re-derived from bookName via findBookByAlias, which silently fell back
  // to 1 (Genesis) on any miss.
  bookNumber: number
  chapter: number
  notes: NoteWithPassageInfo[]
  onNotesChanged: () => void
  // Desktop Read/Study focus toggle. When on, the notes move out of the
  // scripture column and into the workbench beside it (see StudyWorkbench),
  // and selecting verses re-aims the draft's anchor instead of raising the
  // selection action bar.
  studyOpen: boolean
  // Turn Study on from inside the reading column (the selection bar's "Study
  // these verses"). Owned by App so the nav tab can reflect it.
  onEnterStudy: () => void
  // Scripture already fetched for this chapter (see useChapterPreload). When
  // present the view renders text on its FIRST frame — no skeleton, no await.
  // This is the whole reason a swipe to the next chapter feels instant.
  preloaded?: BiblePassage | null
  // Verses to highlight + scroll to once loaded (after a "Save & Read").
  initialHighlightVerses?: number[]
  // Skip the verse-by-verse entrance reveal — set when this chapter arrived via
  // a swipe/edge-arrow (its text was already slid on screen), so it doesn't
  // flicker by fading in again on commit.
  suppressEntrance?: boolean
  /** Reports the translation actually rendered, when it differs from the one
   *  chosen because a fallback fired. Lets the footer attribute the text that
   *  is really on screen. */
  onServedTranslation?: (t: TranslationId | undefined) => void
}

function ChapterView({
  bookName,
  bookNumber,
  chapter,
  notes,
  onNotesChanged,
  studyOpen,
  onEnterStudy,
  preloaded,
  initialHighlightVerses,
  suppressEntrance,
  onServedTranslation
}: ChapterViewProps): React.ReactElement {
  const api = useApi()
  const [translation] = useReadingTranslation()
  // Frozen at mount: this instance is keyed per chapter, so whether it arrived
  // via a swipe is decided once. Freezing it means a later re-render (notes
  // loading) can't drop the class and accidentally trigger the entrance
  // animation mid-life.
  const entranceSuppressed = useRef(suppressEntrance).current
  const [bibleData, setBibleData] = useState<BiblePassage | null>(preloaded ?? null)
  const [loading, setLoading] = useState(!preloaded)
  // Read inside the fetch effect rather than listed as a dependency: a
  // neighbour arriving mid-render must not restart the current chapter's load.
  const preloadedRef = useRef(preloaded)
  preloadedRef.current = preloaded
  const [highlightedNoteIds, setHighlightedNoteIds] = useState<Set<string>>(new Set())
  const [highlightedVerses, setHighlightedVerses] = useState<Set<number>>(new Set())
  const [inlineVerse, setInlineVerse] = useState<number | null>(null)
  const [inlineText, setInlineText] = useState('')
  // Remount key for the create editor, exactly as `editEpoch` is for the edit
  // one: RichEditInput seeds itself from `initialValue` once and then owns its
  // DOM (it manages a caret), so an EXTERNAL rewrite of the text — the category
  // pill writing an "@tag" token — is applied by re-seeding it. Typing never
  // bumps this, so the caret only ever moves on an action the reader just took.
  const [inlineEpoch, setInlineEpoch] = useState(0)
  const [savingInline, setSavingInline] = useState(false)
  // Desktop highlight picker open state. Mobile's lives in MobileSelectionBar.
  const [highlightPicking, setHighlightPicking] = useState(false)

  const isMobile = useIsMobile()
  // Study is a DESKTOP mode (a workbench beside the text). On mobile there is no
  // such surface — capture is the inline composer — so study behaviour must be
  // inert here regardless of the studyOpen prop. Without this, the Study nav tab
  // (which sets studyOpen) would leave a tapped verse aiming a non-existent
  // workbench instead of opening the composer — i.e. highlight, but no note.
  const studyMode = studyOpen && !isMobile
  // Mobile capture: what the composer is currently open on — a fresh note over
  // the selected range, or a saved note being re-opened. null = not composing.
  const [composing, setComposing] = useState<{
    mode: 'create' | 'edit'
    start: number
    end: number
    noteId?: string
  } | null>(null)
  // Verse-range selection for the floating action bar: tap a verse to start,
  // tap another to extend; the range spans min..max of the two anchors.
  const [selAnchor, setSelAnchor] = useState<number | null>(null)
  const [selFocus, setSelFocus] = useState<number | null>(null)
  // Point-of-use hint: shown once near the verse list until the reader's first
  // real selection, then auto-dismissed (also dismissible explicitly).
  const [showVerseHint, setShowVerseHint] = useState(() => !verseHintAlreadySeen())
  const [localNotes, setLocalNotes] = useState<NoteWithPassageInfo[]>(notes)

  // Verse -> category, for every HIGHLIGHT (a note with no body) anchored in
  // this chapter. A highlight is a property OF the verse, not a row beneath it:
  // a note is appended to a verse and you read it, whereas a mark has no words,
  // so borrowing the note rail would take a thought's worth of space and say
  // nothing. See design/highlight-vs-selection.html.
  const categoryDefs = useNoteCategories()
  const categoryLabel = useCallback(
    (key: string) => categoryDefs.find(c => c.key === key)?.label ?? key,
    [categoryDefs]
  )

  const markedVerses = useMemo(() => {
    const marks = new Map<number, string>()
    for (const note of localNotes) {
      if (!isHighlight(note) || !note.category) continue
      const start = note.anchor_start_verse
      if (start === null) continue
      const end = note.anchor_end_verse ?? start
      // Last write wins on an overlap; the reader sees one colour per verse
      // rather than a stack, which would turn scripture into a chart.
      for (let v = start; v <= end; v++) marks.set(v, note.category)
    }
    return marks
  }, [localNotes])
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // RichEditInput is uncontrolled (it owns a contenteditable), so a category
  // picked from the menu reaches the text by remounting it on a fresh key.
  // Only the picker bumps this — typing never does, so the caret is only ever
  // moved by an action the reader just took deliberately.
  const [editEpoch, setEditEpoch] = useState(0)
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
  // Tap vs hold: the row's click also fires for a hold-then-release, which was
  // selecting the verse the instant you paused before scrolling. Record the
  // press so handleVerseClick can accept only a real tap (short + still).
  const tapRef = useRef<{ t: number; x: number; y: number; moved: boolean } | null>(null)
  // Study mode: the last verse click / marquee release, handed to the workbench
  // so it can REFRESH the draft's leading anchor. Nonce-stamped so re-selecting
  // the same range still re-aims (a plain range would look unchanged).
  const [anchorRequest, setAnchorRequest] = useState<AnchorRequest | null>(null)
  const anchorNonce = useRef(0)
  // Read inside the marquee callback, which is created once — a plain closure
  // over `studyOpen` would go stale the moment the toggle flips.
  const studyOpenRef = useRef(studyMode)
  studyOpenRef.current = studyMode
  const aimStudyAnchor = (start: number, end: number): void => {
    anchorNonce.current += 1
    setAnchorRequest({ start, end, nonce: anchorNonce.current })
  }

  // ── In-progress note draft persistence ──────────────────────────────────────
  // A note the reader is writing but hasn't saved is persisted (debounced) to
  // IndexedDB so an accidental reload or tab-close can offer it back rather than
  // losing the words. One draft per chapter (a reader writes one note at a
  // time); the note's canonical content line carries its own anchor + category,
  // so the stored shape is just that line.
  // A guest's whole session is ephemeral (the in-memory API forgets on reload),
  // so persisting a draft to IndexedDB — which WOULD survive a reload — would
  // contradict "nothing you write here is kept." Drafts are off for guests.
  const isGuest = useIsGuest()
  const draftKey = `chapter:${bookNumber}:${chapter}`
  // A draft found on load, surfaced as a quiet, dismissible "recover" prompt —
  // never auto-reopened (see the note-model UX decision).
  const [recoverDraft, setRecoverDraft] = useState<{
    content: string
    noteId: string | null
  } | null>(null)
  // Handed to the desktop workbench when the reader taps "recover"; seeds its
  // composer once. Mobile restores through `composing` + `restoredCompose` below.
  const [workbenchRecover, setWorkbenchRecover] = useState<{
    content: string
    noteId: string | null
  } | null>(null)
  // Initial body/category for the mobile composer when it is opened by a recover
  // tap (otherwise it seeds from the saved note or blank).
  const [restoredCompose, setRestoredCompose] = useState<{
    body: string
    category: NoteCategory | null
  } | null>(null)
  const draftTimer = useRef<number | null>(null)

  const persistDraft = useCallback(
    (content: string, noteId: string | null): void => {
      if (isGuest) return
      if (draftTimer.current !== null) window.clearTimeout(draftTimer.current)
      draftTimer.current = window.setTimeout(() => {
        void writeDraft(draftKey, {
          reference: content,
          lines: [{ text: content, indent: 0, noteId: noteId ?? undefined }]
        })
      }, 400)
    },
    [draftKey, isGuest]
  )

  // Stable across renders (only re-created when the open composer changes), so
  // the composer's change effect doesn't re-arm the debounce timer on every
  // unrelated parent re-render.
  const handleComposerDraftChange = useCallback(
    (body: string, category: NoteCategory | null): void => {
      if (composing === null) return
      persistDraft(
        composeNoteContent(body, composing.start, composing.end, category),
        composing.noteId ?? null
      )
    },
    [composing, persistDraft]
  )

  const clearDraftNow = useCallback((): void => {
    if (draftTimer.current !== null) window.clearTimeout(draftTimer.current)
    void clearDraft(draftKey)
    setRecoverDraft(null)
  }, [draftKey])

  // Look for a leftover draft when the chapter mounts. Only a draft with real
  // prose is worth offering (an anchor/category with no words is not a lost
  // thought).
  useEffect(() => {
    if (isGuest) return
    let live = true
    void readDraft(draftKey).then(d => {
      const content = d?.lines[0]?.text ?? ''
      if (!live || !content || !composerBodyOf(content).trim()) return
      setRecoverDraft({ content, noteId: d!.lines[0].noteId ?? null })
    })
    return () => {
      live = false
    }
  }, [draftKey, isGuest])

  // Recover tapped: resume the unsaved note where the reader left off. On mobile
  // this reopens the inline composer on the draft's anchor; on desktop it hands
  // the draft to the workbench (opening Study if it isn't already).
  const handleRecoverDraft = (): void => {
    if (!recoverDraft) return
    const { content, noteId } = recoverDraft
    if (isMobile) {
      const parsed = parseNoteLine(content)
      const start = parsed.anchorStart ?? 1
      const end = parsed.anchorEnd ?? start
      const noteExists = noteId != null && localNotes.some(n => n.id === noteId)
      setRestoredCompose({ body: composerBodyOf(content), category: parsed.category })
      setComposing({
        mode: noteExists ? 'edit' : 'create',
        start,
        end,
        noteId: noteExists ? noteId! : undefined
      })
    } else {
      setWorkbenchRecover({ content, noteId })
      if (!studyMode) onEnterStudy()
    }
    setRecoverDraft(null)
  }

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
    const ready = preloadedRef.current
    if (ready) {
      setBibleData(ready)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setBibleData(null)
    // Opt into the BSB fallback: ESV draws on a quota shared by every Lantern
    // user, so a reader can hit a dead end through no fault of their own.
    // Substituted text is only honest because the notice below renders
    // `servedTranslation` — see getBibleVerse's options.
    getBibleVerse(`${bookName} ${chapter}`, translation, { fallbackTo: 'BSB' })
      .then(data => {
        if (!cancelled) setBibleData(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bookName, chapter, translation])

  // Tell the parent what was actually served, so the translation footer names
  // and attributes the right text. Reported from an effect rather than during
  // the fetch so a preloaded pane reports too.
  useEffect(() => {
    onServedTranslation?.(bibleData?.servedTranslation)
  }, [bibleData?.servedTranslation, onServedTranslation])

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
    // In Study the highlight belongs to the note being written, not to a
    // selection — clearing it here would fight the workbench.
    if (studyOpenRef.current) return
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

  // After "Save & Read": once the chapter's verses have rendered, highlight the
  // just-written verses and scroll them into view. Consumed once per distinct
  // highlight request (keyed on the verse list) so it never re-fires on an
  // unrelated re-render.
  const consumedHighlightRef = useRef<string>('')
  useEffect(() => {
    if (!initialHighlightVerses || initialHighlightVerses.length === 0) return
    if (!bibleData || bibleData.verses.length === 0) return
    const key = initialHighlightVerses.join(',')
    if (consumedHighlightRef.current === key) return
    consumedHighlightRef.current = key
    setHighlightedVerses(new Set(initialHighlightVerses))
    const first = initialHighlightVerses[0]
    requestAnimationFrame(() => {
      verseRowRefs.current.get(first)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [initialHighlightVerses, bibleData])

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

  const clearSelection = (): void => {
    setSelAnchor(null)
    setSelFocus(null)
  }

  const handleVerseClick = (v: number): void => {
    // Study: a click re-aims the draft at this one verse. No selection state, no
    // action bar — the note in the workbench is what the click is about.
    if (studyMode) {
      if (suppressNextClick()) return
      aimStudyAnchor(v, v)
      return
    }
    if (editingNoteId !== null) return
    // Selection is locked while the composer is open — the note you are writing
    // is about the verses you already chose.
    if (composing !== null) return
    // Tap-only selection: a hold-then-release (or a press that turned into a
    // scroll) also produces a click, which was selecting the verse the moment
    // you paused before scrolling. Accept only a real tap — pressed under ~500ms
    // and barely moved. A click with no recorded press (keyboard/programmatic)
    // has no tapRef and passes through unchanged.
    const press = tapRef.current
    tapRef.current = null
    if (press && (Date.now() - press.t > 500 || press.moved)) return
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
      return
    }
    // Tapping an already-selected verse clears. On touch that means ANY verse
    // in the range (the prototype's rule) — with no hover there is no other way
    // to say "never mind" mid-range. With a mouse it stays the single-verse
    // case, so clicking back inside a range still re-aims it.
    const insideSelection = selRange !== null && v >= selRange[0] && v <= selRange[1]
    if (isMobile ? insideSelection : selFocus === v && selAnchor === v) {
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
      // In Study the drag aims the note being written, not a selection: the
      // workbench rewrites its anchor and the verses light up from there.
      if (studyOpenRef.current) {
        if (start !== null && end !== null) aimStudyAnchor(start, end)
        return
      }
      // Selecting verses clears any note highlight (mutually exclusive).
      setHighlightedVerses(new Set())
      setHighlightedNoteIds(new Set())
      setSelAnchor(start)
      setSelFocus(end)
    }
  )

  // A tap on a footnote door clears the same two gates a tap on the verse
  // clears: a press that turned into a scroll (or a hold) is not a tap, and a
  // drag that just ended already committed its range — neither may open a note
  // (brief §5.4, precedence 3). Both are CONSUMED here because the door stops
  // the click before the verse row ever sees it.
  const canOpenFootnote = (): boolean => {
    const press = tapRef.current
    tapRef.current = null
    if (press && (Date.now() - press.t > 500 || press.moved)) return false
    return !suppressNextClick()
  }

  // A plain click on empty scripture whitespace (not a verse row, note, or
  // control) clears every highlight/selection. A trailing click synthesised by a
  // just-completed marquee drag is swallowed so it can't wipe the fresh range.
  const handleBackgroundClick = (e: React.MouseEvent): void => {
    // While the composer is open the selection is locked — a stray tap on the
    // scripture beside it must not silently un-anchor the note being written.
    if (composing !== null) return
    const target = e.target as HTMLElement
    if (
      target.closest(
        '.reading-verse-row, .rail-note, .reading-note-card, .inline-verse-notes, .verse-action-bar, .inline-note-row, .mobile-selbar, .mobile-composer-row, button, a, input, textarea, [contenteditable]'
      )
    )
      return
    if (suppressNextClick()) return
    clearAll()
  }

  // "Study these verses" — Study is a mode on this page now, not a destination,
  // so this flips the toggle and hands the workbench the selection as its
  // starting anchor. (It used to navigate to the standalone StudyMode page.)
  const handleStudyOnSelection = (): void => {
    if (selRange === null) return
    aimStudyAnchor(selRange[0], selRange[1])
    clearSelection()
    onEnterStudy()
  }

  const handleQuickNoteFromSelection = (): void => {
    if (selRange === null) return
    setInlineVerse(selRange[0])
    setInlineText(selVerseTag)
    // Re-seed, in case the composer is already open on this same verse — the
    // editor owns its DOM, so a fresh anchor only lands through a new key.
    setInlineEpoch(e => e + 1)
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

  // ── mobile capture ────────────────────────────────────────────────────────

  const verseRefLabel = (start: number, end: number): string =>
    start === end ? `${bookName} ${chapter}:${start}` : `${bookName} ${chapter}:${start}-${end}`

  // Desktop capture is free-form: the category lives in the prose as an
  // "@observation" token, which noteParser reads back out. So the composer's
  // category pill does not hold a second, parallel piece of state — it rewrites
  // that token, exactly as typing it would. (The pattern mirrors noteParser's
  // TAG_PATTERN; it is not exported, and this file is the only other place that
  // needs to WRITE one.)
  const CATEGORY_TOKEN = /@(obs(?:ervation)?|hist(?:orical)?|app(?:lication)?|per(?:sonal)?)\b ?/gi
  const withCategoryToken = (text: string, key: NoteCategory | null): string => {
    const stripped = text.replace(CATEGORY_TOKEN, '')
    if (!key) return stripped
    // Appended at the end, where a reader's own typing would leave it, rather
    // than in front of the words they just wrote.
    return `${stripped.replace(/\s+$/, '')} @${key} `.replace(/^ /, '')
  }

  const composingNote =
    composing?.noteId != null ? (localNotes.find(n => n.id === composing.noteId) ?? null) : null

  // A HIGHLIGHT is a note with no body (src/utils/noteKind.ts). It is created
  // through the same path a written note is, so it lands in the same place, is
  // anchored the same way, and can grow a body later by simply being edited.
  // The keyboard never opens: two taps, no typing, which is the point.
  const handleHighlight = async (category: NoteCategory): Promise<void> => {
    if (selRange === null || savingInline) return
    const [start, end] = selRange
    setSavingInline(true)
    try {
      await createAnchoredNote(composeNoteContent('', start, end, category), start)
      clearSelection()
    } finally {
      setSavingInline(false)
    }
  }

  const openComposerOnSelection = (): void => {
    if (selRange === null) return
    setComposing({ mode: 'create', start: selRange[0], end: selRange[1] })
  }

  // Tapping a saved note on a phone re-opens it in the very same composer it
  // was written in — there is no separate "edit" affordance to find.
  const openComposerOnNote = (note: NoteWithPassageInfo): void => {
    if (composing !== null) return
    const start = note.anchor_start_verse ?? note.verse_start
    const end = note.anchor_end_verse ?? start
    setSelAnchor(start)
    setSelFocus(end)
    setHighlightedNoteIds(new Set())
    setHighlightedVerses(new Set())
    setComposing({ mode: 'edit', start, end, noteId: note.id })
  }

  const closeComposer = (): void => {
    setComposing(null)
    clearSelection()
    clearDraftNow()
    setRestoredCompose(null)
  }

  const handleComposerSave = async (body: string, category: NoteCategory | null): Promise<void> => {
    if (composing === null || savingInline) return
    const content = composeNoteContent(body, composing.start, composing.end, category)
    setSavingInline(true)
    try {
      if (composing.mode === 'edit' && composingNote) {
        const updated = await api.updateNote(composingNote.id, {
          content,
          anchor_start_verse: composing.start,
          anchor_end_verse: composing.end,
          category
        })
        setLocalNotes(prev => prev.map(n => (n.id === updated.id ? { ...n, ...updated } : n)))
        markJustSaved(updated.id)
        onNotesChanged()
      } else {
        await createAnchoredNote(content, composing.start)
      }
      closeComposer()
    } finally {
      setSavingInline(false)
    }
  }

  const handleComposerDelete = async (): Promise<void> => {
    if (!composingNote) return
    await handleDeleteNote(composingNote)
    closeComposer()
  }

  // A saved note in the mobile reading flow: a coloured rail, the category (or
  // plain "Note" when there is none — never the word "null"), the reference and
  // when it was written. The whole row is the tap target that re-opens it.
  const renderMobileNote = (note: NoteWithPassageInfo): React.ReactElement => {
    const start = note.anchor_start_verse ?? note.verse_start
    const end = note.anchor_end_verse ?? start
    return (
      <div
        key={note.id}
        className={`mobile-inote cat-${note.category || 'none'}${note.indent_level > 0 ? ' is-sub' : ''}${justSavedId === note.id ? ' just-saved' : ''}`}
        data-note-id={note.id}
        role="button"
        tabIndex={0}
        onClick={e => {
          e.stopPropagation()
          openComposerOnNote(note)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openComposerOnNote(note)
          }
        }}
      >
        <div className="mobile-inote-meta">
          <span className="mobile-inote-label">
            {note.category ? categoryLabel(note.category) : 'Note'}
          </span>
          <span className="mobile-inote-ref">
            {verseRefLabel(start, end)}
            {note.updated_at ? ` · ${formatRelativeTime(note.updated_at)}` : ''}
          </span>
        </div>
        <div className="mobile-inote-body">{composerBodyOf(note.content)}</div>
      </div>
    )
  }

  // A note group flattens for mobile: the main note and any legacy sub-notes
  // are each their own tappable row (the new capture flow makes no sub-notes).
  const renderMobileGroup = (group: NoteGroup): React.ReactElement[] =>
    [group.main, ...group.subnotes]
      // The note being edited is represented by the composer instead.
      .filter(n => n.id !== composing?.noteId)
      .map(renderMobileNote)

  const renderComposer = (): React.ReactElement | null => {
    if (composing === null) return null
    if (composing.mode === 'edit' && !composingNote) return null
    return (
      <MobileNoteComposer
        key={composing.noteId ?? `new-${composing.start}-${composing.end}`}
        reference={verseRefLabel(composing.start, composing.end)}
        mode={composing.mode}
        initialText={
          restoredCompose
            ? restoredCompose.body
            : composingNote
              ? composerBodyOf(composingNote.content)
              : ''
        }
        initialCategory={
          restoredCompose ? restoredCompose.category : (composingNote?.category ?? null)
        }
        saving={savingInline}
        onSave={(body, category) => void handleComposerSave(body, category)}
        onCancel={closeComposer}
        onDelete={composing.mode === 'edit' ? () => void handleComposerDelete() : undefined}
        onDraftChange={handleComposerDraftChange}
      />
    )
  }

  // Chip linkage: scroll the anchored verse into view (mobile).
  const scrollToVerse = (verse: number): void => {
    verseRowRefs.current.get(verse)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Create one verse-anchored note from a raw content line. Shared by the
  // desktop quick-note card and the mobile composer, so both resolve the
  // passage/session the same precise way and neither can drift.
  const createAnchoredNote = async (
    content: string,
    fallbackVerse: number
  ): Promise<NoteWithPassageInfo> => {
    const parsed = parseNoteLine(content)
    // Anchor to whatever "vN"/"vN-M" tag is in the text, falling back to the
    // verse that opened the compose box when the tag was edited away.
    const anchorStart = parsed.anchorStart ?? fallbackVerse
    const anchorEnd = parsed.anchorEnd ?? anchorStart
    // Scoped to THIS BOOK. findOverlappingPassage compares chapter/verse keys
    // only, so handed the whole-Bible getPassages() list it happily matches
    // another book's passage at the same numbers — a note on John 1:4 landing
    // on the Genesis 1:1-5 passage, and so vanishing from John's notes.
    const passages = await api.getPassagesByBook(bookNumber)
    // Reuse an existing passage rather than ever creating a duplicate for
    // verses already covered.
    const existing = findOverlappingPassage(passages, chapter, anchorStart, anchorEnd)
    const passage =
      existing ??
      (await api.createPassage({
        book_number: bookNumber,
        chapter_start: chapter,
        verse_start: anchorStart,
        chapter_end: chapter,
        verse_end: anchorEnd,
        reference_label:
          anchorStart === anchorEnd
            ? `${bookName} ${chapter}:${anchorStart}`
            : `${bookName} ${chapter}:${anchorStart}-${anchorEnd}`
      }))

    const sessions = await api.getSessionsByPassage(passage.id)
    const sessionId =
      sessions.length > 0 ? sessions[0].id : (await api.createSession(passage.id)).id

    const saved = await api.createNote({
      session_id: sessionId,
      content,
      anchor_start_verse: parsed.anchorStart,
      anchor_end_verse: parsed.anchorEnd,
      anchor_book_override: null,
      anchor_chapter_override: null,
      category: parsed.category,
      indent_level: 0
    })

    const enriched: NoteWithPassageInfo = {
      ...saved,
      book_number: passage.book_number,
      chapter_start: passage.chapter_start,
      chapter_end: passage.chapter_end,
      verse_start: passage.verse_start,
      verse_end: passage.verse_end,
      reference_label: passage.reference_label
    }
    setLocalNotes(prev => [...prev, enriched])
    // A saved note is the engagement signal the install nudge waits for.
    markInstallEngagement()
    markJustSaved(saved.id)
    onNotesChanged()
    return enriched
  }

  const handleInlineSave = async (): Promise<void> => {
    if (!inlineText.trim() || savingInline || inlineVerse === null) return
    setSavingInline(true)
    try {
      await createAnchoredNote(inlineText, inlineVerse)
      setInlineVerse(null)
      setInlineText('')
    } finally {
      setSavingInline(false)
    }
  }

  // ── study workbench ───────────────────────────────────────────────────────

  // The workbench edits the note's stored content line directly ("v4-6
  // @personal prose"), so saving is the same parse-then-write every other
  // surface does — no second representation to keep in step.
  const handleWorkbenchSave = async (noteId: string | null, content: string): Promise<void> => {
    if (savingInline) return
    setSavingInline(true)
    try {
      const parsed = parseNoteLine(content)
      if (noteId) {
        const updated = await api.updateNote(noteId, {
          content,
          anchor_start_verse: parsed.anchorStart,
          anchor_end_verse: parsed.anchorEnd,
          category: parsed.category
        })
        setLocalNotes(prev => prev.map(n => (n.id === updated.id ? { ...n, ...updated } : n)))
        markJustSaved(updated.id)
        onNotesChanged()
      } else {
        await createAnchoredNote(content, parsed.anchorStart ?? 1)
      }
    } finally {
      setSavingInline(false)
    }
  }

  const handleWorkbenchDelete = async (noteId: string): Promise<void> => {
    const note = localNotes.find(n => n.id === noteId)
    if (note) await handleDeleteNote(note)
  }

  // The editor's live anchor drives the scripture highlight, so typing "v4-6"
  // lights up those verses exactly as dragging over them would.
  const handleStudyRangeChange = (range: StudyRange | null): void => {
    setHighlightedNoteIds(new Set())
    setHighlightedVerses(
      range === null
        ? new Set()
        : new Set(Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i))
    )
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

  const renderNoteActions = (note: NoteWithPassageInfo): React.ReactElement => {
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

  // What the composer's category pill shows: whatever the prose currently says.
  const inlineParsed = parseNoteLine(inlineText)
  const editParsed = parseNoteLine(editText)
  const pickEditCategory = (key: NoteCategory | null): void => {
    setEditText(t => withCategoryToken(t, key))
    setEditEpoch(n => n + 1)
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
                {categoryLabel(main.category)}
              </span>
            )}
          </div>
        )}
        {isEditing ? (
          <QuickEditCard
            category={editParsed.category ?? main.category}
            mode="edit"
            reference={
              hasAnchor
                ? verseRefLabel(
                    main.anchor_start_verse!,
                    main.anchor_end_verse ?? main.anchor_start_verse!
                  )
                : undefined
            }
            onPickCategory={pickEditCategory}
            saveDisabled={!editText.trim()}
            onSave={() => void handleSaveEdit()}
            onCancel={() => setEditingNoteId(null)}
          >
            <RichEditInput
              key={editEpoch}
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
                        category={editParsed.category ?? sub.category}
                        mode="edit"
                        onPickCategory={pickEditCategory}
                        saveDisabled={!editText.trim()}
                        onSave={() => void handleSaveEdit()}
                        onCancel={() => setEditingNoteId(null)}
                      >
                        <RichEditInput
                          key={editEpoch}
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
                            {categoryLabel(sub.category)}
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
    // The translation switcher lives just below this (in the pane, under the
    // prev/next nav), so a reader stuck on an unavailable ESV can change
    // translation right where they are — no detour to Settings.
    return translation === 'ESV' ? (
      <div className="esv-unavailable">
        ESV isn&apos;t available right now. Switch translation below, or try again later.
      </div>
    ) : (
      <div className="esv-unavailable">Could not load verse text.</div>
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
  const lastVerse = verses[verses.length - 1]?.verse
  // Mobile: range notes render inline right after their LAST anchored verse (the
  // rail is desktop-only), so a note about vv.2-6 sits under v6 — with the verses
  // it covers — rather than being dumped at the bottom of the whole chapter.
  const mobileRangeByVerse = new Map<number, NoteGroup[]>()
  for (const g of rangeGroups) {
    const s = g.main.anchor_start_verse!
    const e = g.main.anchor_end_verse ?? s
    const key = rowByVerse.has(e) ? e : lastVerse
    const list = mobileRangeByVerse.get(key)
    if (list) list.push(g)
    else mobileRangeByVerse.set(key, [g])
  }
  // Which verse row the composer mounts under: the last verse of its range,
  // falling back to the chapter's last rendered verse if the range spills past
  // it (a note anchored into the next chapter).
  const composerVerse =
    isMobile && composing !== null
      ? rowByVerse.has(composing.end)
        ? composing.end
        : lastVerse
      : null

  return (
    <div
      ref={containerRef}
      className={`chapter-marquee-surface${entranceSuppressed ? ' no-entrance' : ''}${composing !== null ? ' is-composing' : ''}`}
      onPointerDown={containerPointerDown}
      onClick={handleBackgroundClick}
    >
      {/* Substituted scripture must say so. Showing another translation's text
          silently under the name of the one the reader chose would be worse
          than showing nothing at all. */}
      {bibleData.servedTranslation && (
        <p className="translation-substituted" role="status">
          {translation} isn&apos;t available right now, so this is {bibleData.servedTranslation}.
        </p>
      )}
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
        </div>

        {recoverDraft && composing === null && (
          <div className="draft-recover" role="note">
            <span className="draft-recover-text">
              You have an unsaved note
              {(() => {
                const p = parseNoteLine(recoverDraft.content)
                return p.anchorStart != null
                  ? ` on ${verseRefLabel(p.anchorStart, p.anchorEnd ?? p.anchorStart)}`
                  : ''
              })()}
              .
            </span>
            <div className="draft-recover-actions">
              <button type="button" className="draft-recover-go" onClick={handleRecoverDraft}>
                Recover
              </button>
              <button
                type="button"
                className="draft-recover-dismiss"
                onClick={clearDraftNow}
                aria-label="Discard the unsaved note"
              >
                Discard
              </button>
            </div>
          </div>
        )}

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
            <div className="note-collapse">
              <div className="rail-passage-notes-label">Passage notes</div>
              <div className="reading-notes-group">
                {passageGroups.map(group => renderNoteGroup(group))}
              </div>
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
            // Read dims everything outside the highlight to make one passage
            // stand out for a moment. Study's highlight is a standing anchor,
            // not a moment — dimming the chapter for as long as a note is open
            // would leave you studying a greyed-out Bible.
            const isDimmed =
              !studyMode &&
              ((hasHighlightedVerse && !isHighlighted) || (selRange !== null && !isSelected))
            const showInline = inlineVerse === v.verse
            const bracketCat = bracketByVerse.get(v.verse)

            const inlineHere = inlineGroupsByVerse.get(v.verse)
            const mobileRangeHere = mobileRangeByVerse.get(v.verse)

            // A contiguous run of selected (or highlighted) verses renders as ONE
            // merged highlight: only the run's outer corners round and the gap
            // between its verses closes, so the passage reads as a single unit
            // rather than a stack of separate pills. `verse-run-*` on the block
            // drives the CSS; neighbours are checked against whichever set is
            // active on this verse.
            const inActiveSet = (verse: number): boolean =>
              isSelected
                ? selRange !== null && verse >= selRange[0] && verse <= selRange[1]
                : highlightedVerses.has(verse)
            // An inline note (or mobile range note) renders BELOW a verse and
            // visually breaks the fill, so it ends the run there: the noted
            // verse is the run's bottom and the next verse starts a fresh run.
            const hasInlineBreak = (verse: number): boolean =>
              !!inlineGroupsByVerse.get(verse) || !!mobileRangeByVerse.get(verse)
            const activeHere = isSelected || isHighlighted
            const prevInRun =
              activeHere &&
              i > 0 &&
              inActiveSet(verses[i - 1].verse) &&
              !hasInlineBreak(verses[i - 1].verse)
            const nextInRun =
              activeHere &&
              i < verses.length - 1 &&
              inActiveSet(verses[i + 1].verse) &&
              !hasInlineBreak(v.verse)
            const runState = !activeHere
              ? ''
              : !prevInRun && !nextInRun
                ? ' verse-run-single'
                : !prevInRun
                  ? ' verse-run-top'
                  : !nextInRun
                    ? ' verse-run-bottom'
                    : ' verse-run-mid'

            return (
              <div
                key={v.verse}
                className={`reading-verse-block${runState}`}
                style={{ gridRow: i + 1, '--stagger-i': i } as React.CSSProperties}
              >
                <div
                  ref={el => {
                    if (el) verseRowRefs.current.set(v.verse, el)
                    else verseRowRefs.current.delete(v.verse)
                  }}
                  className={`reading-verse-row${isHighlighted ? ' highlighted' : ''}${isSelected ? ' selected' : ''}${markedVerses.get(v.verse) ? ` marked cat-${markedVerses.get(v.verse)}` : ''}`}
                  onPointerDown={e => {
                    tapRef.current = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false }
                  }}
                  onPointerMove={e => {
                    const p = tapRef.current
                    if (p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
                      p.moved = true
                    }
                  }}
                  onPointerCancel={() => {
                    if (tapRef.current) tapRef.current.moved = true
                  }}
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
                  {/* The doors are REMOVED while a selection is live, not left
                      inert (§10a.3): capture owns the verse, and a door you
                      have turned off is worse than no door. */}
                  <FootnoteVerseText
                    verse={v}
                    doors={selRange === null}
                    canOpen={canOpenFootnote}
                  />
                  {/* The category NAME is what tells a mark apart from a
                      selection: both tint the row, only a mark says what it is.
                      Carries the reader's own naming. */}
                  {markedVerses.get(v.verse) && (
                    <span className="verse-mark-label">
                      {categoryLabel(markedVerses.get(v.verse)!)}
                    </span>
                  )}
                </div>

                {/* Single-verse notes render inline beneath their verse row. */}
                {inlineHere && inlineHere.length > 0 && (
                  <div className="reading-notes-group inline-verse-notes">
                    <div className="note-collapse">
                      {isMobile
                        ? inlineHere.flatMap(renderMobileGroup)
                        : inlineHere.map(group => renderNoteGroup(group))}
                    </div>
                  </div>
                )}

                {/* Mobile only: range notes render after their last anchored verse
                  (desktop uses the rail; this is display:none there). */}
                {mobileRangeHere && mobileRangeHere.length > 0 && (
                  <div className="reading-notes-group mobile-range-notes">
                    <div className="note-collapse">
                      {isMobile
                        ? mobileRangeHere.flatMap(renderMobileGroup)
                        : mobileRangeHere.map(group => renderNoteGroup(group, { chip: true }))}
                    </div>
                  </div>
                )}

                {/* The mobile composer grows in the flow right under the last
                  verse of the range it is about — never a modal over the text. */}
                {composerVerse === v.verse && (
                  <div className="mobile-composer-row">{renderComposer()}</div>
                )}

                {showInline && (
                  <div className="inline-note-row">
                    <QuickEditCard
                      mode="create"
                      reference={verseRefLabel(
                        inlineParsed.anchorStart ?? v.verse,
                        inlineParsed.anchorEnd ?? inlineParsed.anchorStart ?? v.verse
                      )}
                      category={inlineParsed.category}
                      onPickCategory={key => {
                        setInlineText(t => withCategoryToken(t, key))
                        setInlineEpoch(e => e + 1)
                      }}
                      saveDisabled={!inlineText.trim() || savingInline}
                      onSave={() => void handleInlineSave()}
                      onCancel={() => {
                        setInlineVerse(null)
                        setInlineText('')
                      }}
                    >
                      <RichEditInput
                        key={`inline-${v.verse}-${inlineEpoch}`}
                        initialValue={inlineText}
                        onChange={setInlineText}
                        onSave={() => void handleInlineSave()}
                        onCancel={() => {
                          setInlineVerse(null)
                          setInlineText('')
                        }}
                        className="inline-note-input"
                        placeholder={`v${v.verse} type a note…`}
                        ariaLabel={`Note on verse ${v.verse}`}
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

      {/* Touch: the prototype's selection bar — the reference, a clear button
        and one primary action. Starting a study is the desktop affordance the
        touch bar leaves out. */}
      {/* The touch selection bar (portals itself to <body>, and owns its own
        enter/exit slide so a cancelled selection settles as cleanly as it
        opened). Desktop keeps the fuller verse-action-bar below. */}
      <MobileSelectionBar
        shown={isMobile && selRange !== null && composing === null}
        reference={selReference}
        onClear={clearSelection}
        onNote={openComposerOnSelection}
        onHighlight={key => void handleHighlight(key as NoteCategory)}
      />

      {/* Portaled to <body>, like MobileSelectionBar: this bar is position:fixed,
        but its natural home (.chapter-deck, a direct child of .book-detail-content)
        permanently carries `transform: translateX(0)` for the Study-mode column
        shift. A transformed ancestor becomes the containing block for a fixed
        child, which pinned this bar to the BOTTOM of the tall chapter deck —
        far below the viewport — so it was never actually visible. */}
      {!isMobile &&
        !studyOpen &&
        selRange !== null &&
        inlineVerse === null &&
        createPortal(
          <div className="verse-action-bar" role="toolbar" aria-label="Selection actions">
            <span className="verse-action-ref">{selReference}</span>
            <div className="verse-action-btns">
              <button className="verse-action-btn primary" onClick={handleQuickNoteFromSelection}>
                Quick note
              </button>
              {/* Same two choices as mobile: writing and marking are different
                  acts and should look like it. */}
              <div className="verse-action-hl">
                <button
                  className="verse-action-btn"
                  onClick={() => setHighlightPicking(p => !p)}
                  aria-expanded={highlightPicking}
                >
                  Highlight
                </button>
                {highlightPicking && (
                  <div className="verse-action-hl-menu">
                    <CategoryMenu
                      title="Highlight as…"
                      onPick={key => {
                        setHighlightPicking(false)
                        void handleHighlight(key as NoteCategory)
                      }}
                    />
                  </div>
                )}
              </div>
              <button className="verse-action-btn" onClick={handleStudyOnSelection}>
                Study these verses
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
          </div>,
          document.body
        )}

      {/* The desktop workbench. Portalled to the body (see StudyWorkbench) —
        the reading column is transform-shifted while Study is open, and a
        transformed ancestor would drag a fixed panel along with it. */}
      {studyOpen && !isMobile && (
        <StudyWorkbench
          reference={`${bookName} ${chapter}`}
          notes={chapterNotes}
          anchorRequest={anchorRequest}
          saving={savingInline}
          onActiveRangeChange={handleStudyRangeChange}
          onSave={handleWorkbenchSave}
          onDelete={handleWorkbenchDelete}
          onDraftChange={persistDraft}
          onDraftClear={clearDraftNow}
          recoverDraft={workbenchRecover}
        />
      )}
    </div>
  )
}

// ─── main export ─────────────────────────────────────────────────────────────

// The end-of-chapter control: having read to the bottom, the next thing you
// want is named and one tap away. Renders the dead ends as plain text rather
// than a disabled button — there is nothing to press at Genesis 1.
function ChapterFlowNav({
  prev,
  next,
  onGo
}: {
  prev: ChapterRef | null
  next: ChapterRef | null
  onGo: (delta: number) => void
}): React.ReactElement {
  return (
    <nav className="chapter-flow-nav" aria-label="Continue reading">
      {prev ? (
        <button
          className="chapter-flow-btn is-prev"
          onClick={() => onGo(-1)}
          aria-label={`Previous: ${chapterLabel(prev)}`}
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
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="chapter-flow-labels">
            <span className="chapter-flow-dir">Previous</span>
            <span className="chapter-flow-ref">{chapterLabel(prev)}</span>
          </span>
        </button>
      ) : (
        <span className="chapter-flow-end">The beginning</span>
      )}
      {next ? (
        <button
          className="chapter-flow-btn is-next"
          onClick={() => onGo(1)}
          aria-label={`Next: ${chapterLabel(next)}`}
        >
          <span className="chapter-flow-labels">
            <span className="chapter-flow-dir">Next</span>
            <span className="chapter-flow-ref">{chapterLabel(next)}</span>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : (
        <span className="chapter-flow-end">The end</span>
      )}
    </nav>
  )
}

interface BookDetailPageProps {
  bibleBook: BibleBook
  // The chapter on screen. Owned by App so a swipe across a book boundary and
  // a jump from search are the same state change, and so returning to the
  // Bible view lands on the chapter you were actually reading.
  chapter: number
  onBack: () => void
  // Move the reader to another chapter — possibly in another book, which is
  // why this takes a book name rather than a number.
  onNavigateChapter: (bookName: string, chapter: number) => void
  onRefresh?: () => void
  // The desktop Read/Study focus toggle. Owned by App because the Study nav tab
  // reflects it (Study is a mode on this page now, not a destination of its own).
  studyOpen: boolean
  onToggleStudy: (open: boolean) => void
  // Reading-context controls, hosted in this surface's own header rather than
  // the global top bar (see ReadingControls). Reading Mode (chrome) and Hide
  // Notes (content) are separate concerns.
  focusReading: boolean
  onToggleFocusReading: () => void
  hideNotes: boolean
  onToggleHideNotes: () => void
  // Look / text size, for the header's display-options popover. Owned by App
  // because every surface (and the Settings modal) has to read the same value.
  displayPrefs: DisplayPrefs
  // Reports which way the reader is scrolling, so the app shell can slide the
  // top bar / bottom tabs out of the way. See useScrollDirection.
  onChromeVisibleChange?: (visible: boolean) => void
  // Verses to highlight + scroll to once the chapter loads (set after a
  // "Save & Read" so the just-written notes are seen in context). Consumed once.
  initialHighlightVerses?: number[]
}

export default function BookDetailPage({
  bibleBook,
  chapter: selectedChapter,
  onBack,
  onNavigateChapter,
  onRefresh,
  studyOpen,
  onToggleStudy,
  focusReading,
  onToggleFocusReading,
  hideNotes,
  onToggleHideNotes,
  displayPrefs,
  onChromeVisibleChange,
  initialHighlightVerses
}: BookDetailPageProps): React.ReactElement {
  const api = useApi()
  const [translation] = useReadingTranslation()
  const [allNotes, setAllNotes] = useState<NoteWithPassageInfo[]>([])
  const chapterSelectorRef = useRef<HTMLDivElement>(null)
  // The scroll container. On mobile the whole layout scrolls (the header +
  // chapter strip are sticky inside it, so they can slide away without moving a
  // single line of scripture); on desktop it stays overflow:hidden and this
  // never fires. See .app-shell.reading-surface .book-detail-layout.
  const layoutRef = useRef<HTMLDivElement>(null)
  // Reset to fully-visible chrome on every chapter change (see resetKey) — this
  // is what stops the auto-hide from flip-flopping as you move between chapters.
  // Disabled in Reading Mode: the one bar shouldn't auto-hide, and — key for the
  // exit flicker — toggling `enabled` re-initialises the machine, so leaving
  // Reading Mode always starts fresh/visible instead of re-asserting a stale
  // scrolled-away state. `selectedChapter` as the reset key keeps navigation
  // from flip-flopping the chrome.
  useChromeAutoHide(layoutRef, !focusReading, onChromeVisibleChange, selectedChapter)

  const reloadNotes = useCallback(async (): Promise<void> => {
    setAllNotes(await api.getNotesByBook(bibleBook.number))
    // Always refresh app-level state so the sidebar stays in sync
    onRefresh?.()
  }, [api, bibleBook.number, onRefresh])

  useEffect(() => {
    api.getNotesByBook(bibleBook.number).then(setAllNotes)
  }, [api, bibleBook.number])

  // Chapter -> dominant category, for the pip under each chapter number.
  // Honours each note's chapter override, which the old `n.chapter_start` read
  // did not: a note moved to another chapter marked the wrong one and left the
  // right one unmarked.
  const chapterCategories = useMemo(() => chapterNoteCategories(allNotes), [allNotes])
  const chaptersWithNotes = chapterCategories

  // Keep the active pill in view along the STRIP'S OWN axis, and only that axis.
  // This used to be scrollIntoView({ inline: 'nearest' }) — whose `block`
  // silently defaults to 'start', so it also scrolled the reading surface until
  // the pill reached the top. The pill lives in sticky chrome and therefore
  // never can, so every chapter change quietly stole ~the chrome's height of
  // vertical scroll: land on a new chapter and verse 1 was already tucked up
  // under the header. Measured, not guessed — 144px on a 390px viewport.
  useEffect(() => {
    const strip = chapterSelectorRef.current
    const pill = strip?.querySelector('.chapter-pill.active') as HTMLElement | null
    if (!strip || !pill) return
    const left =
      pill.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft
    const right = left + pill.offsetWidth
    // Stop a pill short of the edge, so the neighbour you'd tap next is visible.
    const margin = pill.offsetWidth
    const from = strip.scrollLeft
    const max = Math.max(0, strip.scrollWidth - strip.clientWidth)
    let to = from
    if (left - margin < from) to = left - margin
    else if (right + margin > from + strip.clientWidth) to = right + margin - strip.clientWidth
    to = Math.min(Math.max(to, 0), max)
    if (to !== from) strip.scrollTo({ left: to, behavior: 'smooth' })
  }, [selectedChapter])

  const scrollChapters = (dir: number): void => {
    const el = chapterSelectorRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: 'smooth' })
  }

  const studiedCount = chaptersWithNotes.size

  /* ── Cross-chapter reading ───────────────────────────────────────────────
     Where you can go, what's already loaded, and the gesture that gets you
     there. The resolution and the feel are both pure functions living in
     useChapterNavigation.ts; everything below is wiring. */

  const current: ChapterRef = {
    bookNumber: bibleBook.number,
    bookName: bibleBook.name,
    chapter: selectedChapter
  }
  const prev = adjacentChapter(bibleBook.number, selectedChapter, -1)
  const next = adjacentChapter(bibleBook.number, selectedChapter, 1)

  // ESV is metered upstream per query, so a chapter the reader never opens
  // must not spend their quota (BSB and KJV are cached-forever and free).
  const preloadEnabled = translation !== 'ESV'
  const getPreloaded = useChapterPreload<BiblePassage | null>(
    [prev, next],
    ref => `${translation}|${ref.bookNumber}|${ref.chapter}`,
    ref => getBibleVerse(`${ref.bookName} ${ref.chapter}`, translation),
    preloadEnabled
  )

  // The translation actually rendered by the CURRENT pane. Differs from the
  // chosen one only when a fallback fired (see getBibleVerse's fallbackTo), and
  // exists so the footer attributes the text on screen rather than the text the
  // reader asked for.
  const [servedTranslation, setServedTranslation] = useState<TranslationId | undefined>()

  const deckRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  // A chapter reached by SWIPING (or the edge arrows) has already slid its text
  // onto the screen, so replaying the verse-by-verse entrance on commit makes
  // the text visibly disappear and reappear. We record the chapter the deck is
  // heading to; the entrance is then suppressed only for the mount whose chapter
  // matches it (a pill/search jump targets a different chapter, so it still gets
  // the reveal). No reset/timing needed — the match is naturally one-shot.
  const deckTargetRef = useRef<number | null>(null)

  const canGo = useCallback(
    (delta: number): boolean => adjacentChapter(bibleBook.number, selectedChapter, delta) !== null,
    [bibleBook.number, selectedChapter]
  )
  const navigate = useCallback(
    (delta: number): void => {
      const target = adjacentChapter(bibleBook.number, selectedChapter, delta)
      if (!target) return
      deckTargetRef.current = target.chapter
      onNavigateChapter(target.bookName, target.chapter)
    },
    [bibleBook.number, selectedChapter, onNavigateChapter]
  )

  const swipe = useChapterSwipe({
    trackRef,
    chapterKey: `${bibleBook.number}:${selectedChapter}`,
    canGo,
    onNavigate: navigate,
    reducedMotion,
    enabled: true
  })

  // On the handover render the neighbour on screen has just BECOME the current
  // chapter, so it is rendered as the primary pane (below) and no new neighbour
  // is mounted — one built and discarded a frame later is pure jank.
  const peekTarget = swipe.promoting
    ? null
    : swipe.peek === 1
      ? next
      : swipe.peek === -1
        ? prev
        : null

  // A new chapter starts at its first verse, not wherever the last one was
  // left. Layout effect so this lands in the same frame the chapter does.
  const mounted = useRef(false)
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    layoutRef.current?.scrollTo({ top: 0 })
    contentRef.current?.scrollTo({ top: 0 })
  }, [selectedChapter])

  // Suppress the entrance only when this chapter is the one the deck slid to.
  const suppressEntrance = deckTargetRef.current === selectedChapter

  // ...and only for THAT arrival. The match is one-shot per navigation, not per
  // chapter: leave the chapter and come back to it by tapping its pill and the
  // stale target would still match, silently swallowing the reveal that a
  // pill/search jump is supposed to get. Cleared after the commit that consumed
  // it — ChapterView freezes the flag at mount, so this can't unsuppress a pane
  // mid-life.
  useEffect(() => {
    deckTargetRef.current = null
  }, [selectedChapter])

  // The neighbour is absolutely positioned inside a deck that may be scrolled
  // far past its own top, so it is offset to start at the reader's eye line —
  // otherwise sliding one in from the side reveals blank space above it.
  useLayoutEffect(() => {
    const deck = deckRef.current
    if (!deck) return
    const pane = swipe.peek
      ? (deck.querySelector('.chapter-pane--peek') as HTMLElement | null)
      : null
    // A promoted pane is back in normal flow but still wearing the inline offset
    // it was given as the neighbour. Written imperatively, so React won't clear
    // it for us.
    for (const other of deck.querySelectorAll('.chapter-pane')) {
      if (other !== pane) (other as HTMLElement).style.top = ''
    }
    if (!pane) return
    const deckTop = deck.getBoundingClientRect().top
    const chromeBottom = chromeRef.current?.getBoundingClientRect().bottom ?? 0
    pane.style.top = `${Math.max(0, Math.max(0, chromeBottom) - deckTop)}px`
  }, [swipe.peek])

  return (
    <div className="book-detail-layout" ref={layoutRef}>
      {/* One sticky chrome block (header + chapter strip) so the pair slides
          away as a single unit. `display: contents` on desktop keeps the old
          flex layout byte-for-byte; only the mobile rules make it a real box. */}
      <div className="book-detail-chrome" ref={chromeRef}>
        <div className="book-detail-header">
          <div className="book-detail-header-inner">
            <div className="book-detail-header-lead">
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
            </div>
            {/* The centered reference area. Normal mode shows the big title +
                meta; Reading Mode collapses those and shows a compact
                "‹ John 1 ›" (reference centered, a chapter arrow on either side
                — the Bible-app convention). Both centered, so the transition
                between them is clean. */}
            <div className="book-detail-header-center">
              <div className="book-detail-titles">
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
              <div className="book-detail-ref-group" aria-hidden={!focusReading}>
                <button
                  className="reading-chapter-nav-btn"
                  onClick={() =>
                    selectedChapter > 1 && onNavigateChapter(bibleBook.name, selectedChapter - 1)
                  }
                  disabled={selectedChapter <= 1}
                  aria-label="Previous chapter"
                >
                  <svg
                    width="13"
                    height="13"
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
                <span className="book-detail-ref-inline">
                  {readingShortBookName(bibleBook.number, bibleBook.name)} {selectedChapter}
                </span>
                <button
                  className="reading-chapter-nav-btn"
                  onClick={() =>
                    selectedChapter < bibleBook.chapters &&
                    onNavigateChapter(bibleBook.name, selectedChapter + 1)
                  }
                  disabled={selectedChapter >= bibleBook.chapters}
                  aria-label="Next chapter"
                >
                  <svg
                    width="13"
                    height="13"
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
            <div className="book-detail-header-controls">
              {/* Read / Study. Wide desktop only (CSS hides it below the width
                  the workbench needs, and App keeps the mode off there) —
                  studying on a phone is the inline composer, not a side panel. */}
              <div className="study-toggle" role="group" aria-label="Reading mode">
                <button
                  type="button"
                  aria-pressed={!studyOpen}
                  onClick={() => onToggleStudy(false)}
                >
                  Read
                </button>
                <button type="button" aria-pressed={studyOpen} onClick={() => onToggleStudy(true)}>
                  Study
                </button>
              </div>
              {/* The muted reading cluster: display options ("aA"), hide notes,
                  reading mode. Translation also stays in the chapter colophon
                  (TranslationFooter) as the ultra-quick per-passage flip. */}
              <ReadingControls
                focusReading={focusReading}
                onToggleFocusReading={onToggleFocusReading}
                hideNotes={hideNotes}
                onToggleHideNotes={onToggleHideNotes}
                displayPrefs={displayPrefs}
              />
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
                const category = chapterCategories.get(ch) ?? null
                const isActive = ch === selectedChapter
                return (
                  <button
                    key={ch}
                    className={`chapter-pill${isActive ? ' active' : ''}${hasNotes ? ' has-notes' : ''}`}
                    onClick={() => onNavigateChapter(bibleBook.name, ch)}
                    // Presence, not quantity: the pip says you have written
                    // here and what kind of work it was. No count anywhere.
                    title={hasNotes ? `${bibleBook.name} ${ch} — you have notes here` : undefined}
                  >
                    {ch}
                    {hasNotes && !isActive && (
                      <span
                        className={`chapter-note-dot${category ? ` cat-${category}` : ''}`}
                        aria-hidden="true"
                      />
                    )}
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
      </div>

      <div className="book-detail-content" ref={contentRef}>
        {/* The chapter deck. One chapter is current; during a swipe (or a
            tapped affordance) exactly ONE neighbour is mounted beside it and
            the track slides. Deliberately not infinite scroll — chapters stay
            discrete so notes always belong to exactly one of them. */}
        <div
          className="chapter-deck"
          ref={deckRef}
          data-sliding={swipe.sliding ? 'true' : undefined}
          onPointerDown={swipe.onPointerDown}
        >
          <div className="chapter-deck-track" ref={trackRef}>
            {/* Both panes are keyed by CHAPTER, not by their role, and that is
                the whole trick: when a swipe commits, the neighbour's key is
                the one the primary pane now carries, so React reuses that exact
                subtree — the scripture already slid into view simply becomes
                the chapter, in place. Keying the primary by chapter (as this
                did) instead unmounted the incoming pane and rebuilt it from
                scratch in the same frame, which is the flash on settle. */}
            {[
              { ref: current, peek: false },
              ...(peekTarget ? [{ ref: peekTarget, peek: true }] : [])
            ].map(({ ref, peek }) => {
              const sameBook = ref.bookNumber === bibleBook.number
              return (
                <div
                  key={chapterKeyOf(ref)}
                  className={
                    peek
                      ? `chapter-pane chapter-pane--peek ${swipe.peek === 1 ? 'is-next' : 'is-prev'}`
                      : 'chapter-pane'
                  }
                  aria-hidden={peek ? 'true' : undefined}
                >
                  {/* Keyed by the pane, so a chapter that throws still gets a
                      clean boundary — without a key of its own, which would
                      remount the very subtree we are preserving. */}
                  <ErrorBoundary variant="pane">
                    <ChapterView
                      onServedTranslation={peek ? undefined : setServedTranslation}
                      bookName={ref.bookName}
                      bookNumber={ref.bookNumber}
                      chapter={ref.chapter}
                      // Notes are per book: a neighbour in ANOTHER book has none
                      // loaded yet, and it only wears that state for the length
                      // of the transition — arriving reloads them for real.
                      notes={sameBook ? allNotes : []}
                      onNotesChanged={peek ? noop : reloadNotes}
                      // Scenery never gets a workbench: the panel is a single
                      // fixed surface, so only the live chapter may own it.
                      studyOpen={peek ? false : studyOpen}
                      onEnterStudy={peek ? noop : () => onToggleStudy(true)}
                      preloaded={getPreloaded(ref)}
                      initialHighlightVerses={peek ? undefined : initialHighlightVerses}
                      // Scenery reveals nothing: the neighbour must not play the
                      // verse-by-verse entrance while it is sliding in, and it
                      // keeps this decision after it is promoted (the flag is
                      // frozen at mount). A pill or search jump mounts a fresh
                      // pane instead, and still gets the reveal.
                      suppressEntrance={peek ? true : suppressEntrance}
                    />
                  </ErrorBoundary>
                  {!peek && <ChapterFlowNav prev={prev} next={next} onGo={swipe.go} />}
                  {!peek && <TranslationFooter servedTranslation={servedTranslation} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Persistent prev/next, always within reach — the desktop answer to the
          swipe, and on mobile they ride out with the rest of the chrome. */}
      {prev && (
        <button
          className="chapter-edge-nav is-prev"
          onClick={() => swipe.go(-1)}
          aria-label={`Previous chapter: ${chapterLabel(prev)}`}
          title={`Previous: ${chapterLabel(prev)}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      {next && (
        <button
          className="chapter-edge-nav is-next"
          onClick={() => swipe.go(1)}
          aria-label={`Next chapter: ${chapterLabel(next)}`}
          title={`Next: ${chapterLabel(next)}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  )
}

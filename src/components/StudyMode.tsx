import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import NoteEditor, { makeLineId } from './NoteEditor'
import ErrorBoundary from './ErrorBoundary'
import PassagePane from './PassagePane'
import ReferenceInput from './ReferenceInput'
import { BiblePassage, Note } from '../types'
import { parseNoteLine, parseReferenceLabel } from '../utils/noteParser'
import { findBookByAlias } from '../utils/bibleBooks'
import { useApi } from '../api/context'
import { getBibleVerse } from '../bible/service'
import { useTranslation } from '../utils/useTranslation'
import {
  draftKey,
  draftLinesEqual,
  readDraft,
  writeDraft,
  clearDraft,
  type DraftLine
} from '../offline/draft'
import { reportOccurrence } from '../telemetry/client'

const DRAFT_SAVE_DEBOUNCE_MS = 600

// A draft was actually recovered — i.e. the safety net caught something real.
//
// Scalar 7 (draft_recoveries_24h). Like the scripture fallback, this leaves no
// trace in the database (a recovered draft is local until it saves, and once it
// saves it is indistinguishable from a note typed normally), so it can only be
// counted in the browser and has to ride the events channel.
//
// It matters because it is the only evidence that draft persistence is earning
// its keep: a recovery count of zero over weeks says the narrower fix was
// enough and the full offline write outbox stays deferred; a rising one says
// people are genuinely losing work and it isn't.
//
// Module-scope, taking the setter, so call sites inside useCallback bodies do
// not acquire a new dependency (React state setters are stable).
function markDraftRestored(setDraftRestored: (restored: boolean) => void): void {
  setDraftRestored(true)
  reportOccurrence('draft_recovery', 'DRAFT_RECOVERED')
}

function toDraftLines(lines: LineData[]): DraftLine[] {
  return lines.map(l => ({ text: l.text, indent: l.indent, noteId: l.noteId }))
}

function fromDraftLines(draftLines: DraftLine[]): LineData[] {
  return draftLines.map(l => ({
    id: makeLineId(),
    text: l.text,
    indent: l.indent,
    noteId: l.noteId
  }))
}

// Same "does this diverge from what's already persisted" question the
// per-line "saved Xh ago" timestamp answers (NoteEditor.tsx) — reused here to
// decide whether there's a draft worth persisting at all, so a freshly
// opened, unedited study doesn't write a no-op draft on every render.
function isLinesDirty(lines: LineData[], existingNotes: Map<string, Note>): boolean {
  if (existingNotes.size > 0) {
    const kept = new Set<string>()
    for (const l of lines) {
      if (l.noteId && existingNotes.has(l.noteId)) {
        kept.add(l.noteId)
        const src = existingNotes.get(l.noteId)!
        if (src.content !== l.text || (src.indent_level ?? 0) !== l.indent) return true
      } else if (l.text.trim() !== '') {
        return true
      }
    }
    return kept.size !== existingNotes.size
  }
  return lines.some(l => l.text.trim() !== '')
}

interface LineData {
  id: string
  text: string
  indent: number
  // Set when this line was hydrated from an existing persisted note. The
  // reconciling save diffs against these ids: carried lines whose content or
  // indent changed are updated (preserving created_at); lines without an id are
  // created; notes whose line vanished are deleted. This is what keeps note ids
  // and the subtle timestamps stable across an edit — no delete-all/recreate.
  noteId?: string
}

export interface StudyModeHandle {
  isDirty: () => boolean
  save: () => Promise<string | null>
}

interface StudyModeProps {
  initialReference?: string
  initialPassageId?: string | null
  onSaveRead: (passageId: string) => void
  onSaveNext: (nextReference?: string) => void
}

function guessNextReference(label: string): string {
  const m = /^(.*?)(\d+):(\d+)(?:-(\d+))?$/.exec(label.trim())
  if (!m) return ''
  const bookPart = m[1].trim()
  const ch = parseInt(m[2], 10)
  const vs = parseInt(m[3], 10)
  const ve = m[4] ? parseInt(m[4], 10) : vs
  const len = ve - vs
  return `${bookPart} ${ch}:${ve + 1}-${ve + 1 + len}`
}

const StudyMode = forwardRef<StudyModeHandle, StudyModeProps>(function StudyMode(
  { initialReference = '', initialPassageId = null, onSaveRead, onSaveNext },
  ref
) {
  const api = useApi()
  const [translation] = useTranslation()
  const [reference, setReference] = useState(initialReference)
  const [passage, setPassage] = useState<BiblePassage | null>(null)
  const [loadingPassage, setLoadingPassage] = useState(false)
  const [lines, setLines] = useState<LineData[]>([{ id: makeLineId(), text: '', indent: 0 }])
  const [focusedLineId, setFocusedLineId] = useState<string | null>(lines[0].id)
  const [highlightedVerses, setHighlightedVerses] = useState<Set<number>>(new Set())
  const scriptureBodyRef = useRef<HTMLDivElement>(null)
  const [hasHighlight, setHasHighlight] = useState(false)
  const [saving, setSaving] = useState(false)
  // A brand-new study (no initialPassageId) with every line still empty has
  // nothing worth persisting — saving it silently created an empty
  // Passage+Session with zero notes (a dead Journal entry you'd never
  // remember creating). Editing an EXISTING study down to zero notes is a
  // different, legitimate action (deliberately deleting the study, which
  // correctly cascade-deletes the now-empty session/passage), so this only
  // gates the blank-study case.
  const hasNoteContent = lines.some(l => l.text.trim() !== '')
  const blankAndEmpty = !initialPassageId && !hasNoteContent
  const [editSessionId, setEditSessionId] = useState<string | null>(null)
  // The notes this study opened with, keyed by id — the baseline the reconciling
  // save diffs against (to know what changed and what was removed).
  const [existingNotes, setExistingNotes] = useState<Map<string, Note>>(new Map())
  // What this study's in-progress draft is keyed by in IndexedDB: stable for
  // the life of this mount once known (App.tsx remounts StudyMode via a `key`
  // on passage/reference change, see App.tsx). null until a passage id or a
  // committed reference exists to key a draft by.
  const [draftStorageKey, setDraftStorageKey] = useState<string | null>(() =>
    draftKey(initialPassageId, initialReference)
  )
  // True once a draft was restored this mount and hasn't been saved or
  // superseded yet — drives the "this isn't on the server" banner so a
  // recovered draft is never mistaken for saved content.
  const [draftRestored, setDraftRestored] = useState(false)
  const [noteFocusNonce, setNoteFocusNonce] = useState(0)
  // Mobile only: the pinned scripture panel starts collapsed (peek) so the notes
  // get the room; tap the header to expand. Ignored by the desktop side-by-side
  // layout, which shows the full pane regardless.
  const [scriptureExpanded, setScriptureExpanded] = useState(false)
  // A manually-dragged height (px) overrides the two tap-toggle presets
  // above, so the user can land on exactly the split they want rather than
  // only ever choosing between "peek" and "expanded." null = no manual
  // override yet (or it was just cleared by a tap on the header).
  const [customHeightPx, setCustomHeightPx] = useState<number | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const studyRightRef = useRef<HTMLDivElement>(null)
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    const el = studyRightRef.current
    if (!el) return
    resizeStateRef.current = { startY: e.clientY, startHeight: el.getBoundingClientRect().height }
    setIsResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    if (!resizeStateRef.current) return
    const delta = e.clientY - resizeStateRef.current.startY
    // Bounds mirror the two presets' rough range, widened a touch at each
    // end so dragging can go a bit further than either preset alone.
    const min = window.innerHeight * 0.1
    const max = window.innerHeight * 0.85
    const next = Math.min(max, Math.max(min, resizeStateRef.current.startHeight + delta))
    setCustomHeightPx(next)
  }, [])

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    resizeStateRef.current = null
    setIsResizing(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  useEffect(() => {
    if (initialReference) {
      loadPassageByReference(initialReference)
    }
    // A blank study prefilled with a reference (Save & Next, or the reading-view
    // "study this" bridge) already has a stable draft key from mount — restore
    // it here. A study opened on an existing passage is handled inside
    // loadExisting below instead, once the server notes it hydrates against
    // are known (needed to tell a genuine draft apart from a no-op one).
    if (!initialPassageId && draftStorageKey) {
      const baseline = toDraftLines(lines)
      void readDraft(draftStorageKey).then(draft => {
        if (draft && !draftLinesEqual(draft.lines, baseline)) {
          const restored = fromDraftLines(draft.lines)
          setLines(restored)
          // Focus the last restored line, cursor at the end, so the user can
          // pick up typing immediately rather than having to click in first.
          setFocusedLineId(restored[restored.length - 1].id)
          markDraftRestored(setDraftRestored)
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Opening an existing passage (from the Journal, the reading-view bridge, or
  // search): hydrate the editor from the passage's notes and load its scripture.
  // Notes are read across ALL of the passage's sessions in stable created_at
  // order so nothing is silently dropped when a passage has more than one
  // session; new notes on save write to the first (oldest) session. Each
  // hydrated line carries its source note id for the reconciling save.
  useEffect(() => {
    if (!initialPassageId) return
    let cancelled = false
    async function loadExisting(): Promise<void> {
      const passageRecord = await api.getPassageById(initialPassageId!)
      if (cancelled) return
      if (passageRecord) {
        setReference(passageRecord.reference_label)
        void loadPassageByReference(passageRecord.reference_label)
      }
      const sessionList = await api.getSessionsByPassage(initialPassageId!)
      if (cancelled || sessionList.length === 0) return
      // getSessionsByPassage returns newest-first; the write target is the
      // oldest session, matching the append behaviour elsewhere.
      const writeSession = sessionList[sessionList.length - 1]
      setEditSessionId(writeSession.id)
      const noteLists = await Promise.all(sessionList.map(s => api.getNotesBySession(s.id)))
      if (cancelled) return
      const allNotes = noteLists
        .flat()
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      const hydratedLines: LineData[] = allNotes.map(n => ({
        id: makeLineId(),
        text: n.content,
        indent: n.indent_level ?? 0,
        noteId: n.id
      }))
      if (allNotes.length > 0) {
        setExistingNotes(new Map(allNotes.map(n => [n.id, n])))
        setLines(hydratedLines)
        setFocusedLineId(null)
      }

      // Restore a draft over the just-hydrated server state, but only if it
      // actually diverges — a draft written right after a clean load (no
      // edits since) would otherwise trip the "restored" banner for nothing.
      const key = draftKey(initialPassageId, reference)
      setDraftStorageKey(key)
      if (key) {
        const draft = await readDraft(key)
        if (cancelled) return
        // A passage that hydrated zero notes still starts from one blank
        // line (the component's initial state), not an empty array.
        const baseline: DraftLine[] =
          hydratedLines.length > 0 ? toDraftLines(hydratedLines) : [{ text: '', indent: 0 }]
        if (draft && !draftLinesEqual(draft.lines, baseline)) {
          const restored = fromDraftLines(draft.lines)
          setLines(restored)
          setFocusedLineId(restored[restored.length - 1].id)
          markDraftRestored(setDraftRestored)
        }
      }
    }
    void loadExisting()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPassageId])

  // Write-through the in-progress draft as the user types, debounced so a
  // fast typist doesn't hit IndexedDB on every keystroke. Only persists while
  // there's actual unsaved content (isLinesDirty); once the user backs out
  // their edits back to nothing (or to exactly what's already saved), the
  // stale draft is cleared instead of being kept around forever.
  //
  // draftSaveGenRef guards against a real race: a save can complete (and
  // clearDraft) while a debounced write from just-before-the-click is still
  // in flight. Without this, that stale timer fires after the clear and
  // silently resurrects the draft it just erased. reconcileNotes bumps the
  // generation on every successful clear; a timer only writes/clears if the
  // generation is still what it was when the timer was scheduled.
  const draftSaveGenRef = useRef(0)
  useEffect(() => {
    if (!draftStorageKey) return
    const dirty = isLinesDirty(lines, existingNotes)
    const genAtSchedule = draftSaveGenRef.current
    const timer = setTimeout(() => {
      if (draftSaveGenRef.current !== genAtSchedule) return
      if (dirty) {
        void writeDraft(draftStorageKey, { reference, lines: toDraftLines(lines) })
      } else {
        void clearDraft(draftStorageKey)
      }
    }, DRAFT_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [lines, existingNotes, reference, draftStorageKey])

  async function loadPassageByReference(ref: string): Promise<void> {
    if (!ref.trim()) return
    setLoadingPassage(true)
    try {
      const result = await getBibleVerse(ref.trim(), translation)
      if (result) setPassage(result)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingPassage(false)
    }
  }

  // Switching translation while a passage pane is already open re-fetches its
  // text in place (StudyMode has no single load-on-mount effect the way
  // BookDetailPage/ReadingMode do — loadPassageByReference is called
  // imperatively from several places — so this is the one spot that reacts to
  // the global preference changing). Guarded against firing on mount, since
  // the initial load is already handled by the effects above.
  const lastTranslationRef = useRef(translation)
  useEffect(() => {
    if (lastTranslationRef.current === translation) return
    lastTranslationRef.current = translation
    if (reference.trim()) void loadPassageByReference(reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation])

  // Reference-commit (Enter/Tab in the field): validate the reference
  // *synchronously*, move focus to the first note line immediately, and kick the
  // verse fetch off in the background. Returns false on parse failure so the
  // ReferenceInput keeps focus and shows its error — focus never moves on async.
  const commitReference = useCallback(
    (ref: string): boolean => {
      const trimmed = ref.trim()
      if (!trimmed || !parseReferenceLabel(trimmed)) return false
      setFocusedLineId(lines[0].id)
      setNoteFocusNonce(n => n + 1)
      void loadPassageByReference(trimmed)
      // A blank study (no initialPassageId) has no draft key until a
      // reference is committed for the first time — pick it up now and check
      // for a draft left from an earlier attempt at this same reference.
      if (!initialPassageId && !draftStorageKey) {
        const key = draftKey(null, trimmed)
        setDraftStorageKey(key)
        if (key) {
          const baseline = toDraftLines(lines)
          void readDraft(key).then(draft => {
            if (draft && !draftLinesEqual(draft.lines, baseline)) {
              const restored = fromDraftLines(draft.lines)
              setLines(restored)
              setFocusedLineId(restored[restored.length - 1].id)
              markDraftRestored(setDraftRestored)
            }
          })
        }
      }
      return true
    },
    [lines, initialPassageId, draftStorageKey]
  )

  const handleCursorLine = useCallback(
    (parsed: ReturnType<typeof parseNoteLine> | null) => {
      if (!parsed || !passage) {
        setHighlightedVerses(new Set())
        setHasHighlight(false)
        return
      }
      if (parsed.anchorStart !== null) {
        const start = parsed.anchorStart
        const end = parsed.anchorEnd ?? start
        const vSet = new Set<number>()
        for (let v = start; v <= end; v++) vSet.add(v)
        setHighlightedVerses(vSet)
        setHasHighlight(true)
        // Bring the tagged verse into view if it's scrolled out of the (often
        // bounded/collapsed-on-mobile) scripture panel — scrollIntoView on the
        // nearest scrollable ancestor only (block:'nearest'), so it's a no-op
        // when the verse is already visible and never scrolls the whole page.
        const row = scriptureBodyRef.current?.querySelector(`[data-verse="${start}"]`)
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      } else {
        setHighlightedVerses(new Set())
        setHasHighlight(false)
      }
    },
    [passage]
  )

  // Reconciling save: diff the editor lines against the notes this study opened
  // with (existingNotes) rather than deleting-all-then-recreating. Lines that
  // carry a noteId are matched to their source note — updated only when content
  // or indent actually changed (so unchanged notes keep their updated_at, and
  // the subtle timestamp doesn't reset to "just now"). New lines are created,
  // notes whose line was removed are deleted. New notes go to writeSessionId.
  async function reconcileNotes(writeSessionId: string): Promise<void> {
    const kept = new Set<string>()
    for (const line of lines) {
      const text = line.text.trim()
      const parsed = parseNoteLine(line.text)
      if (line.noteId && existingNotes.has(line.noteId)) {
        const src = existingNotes.get(line.noteId)!
        if (!text) {
          // An existing note emptied out → remove it (handled by the deletion
          // sweep below, since it won't be in `kept`).
          continue
        }
        kept.add(line.noteId)
        const changed = src.content !== line.text || (src.indent_level ?? 0) !== line.indent
        if (changed) {
          await api.updateNote(line.noteId, {
            content: line.text,
            anchor_start_verse: parsed.anchorStart,
            anchor_end_verse: parsed.anchorEnd,
            category: parsed.category,
            indent_level: line.indent
          })
        }
      } else if (text) {
        await api.createNote({
          session_id: writeSessionId,
          content: line.text,
          anchor_start_verse: parsed.anchorStart,
          anchor_end_verse: parsed.anchorEnd,
          anchor_book_override: null,
          anchor_chapter_override: null,
          category: parsed.category,
          indent_level: line.indent
        })
      }
    }
    // Deletion sweep: any note we opened with that no longer has a kept line.
    for (const id of existingNotes.keys()) {
      if (!kept.has(id)) await api.deleteNote(id)
    }
    // Everything above landed on the server — the local draft is now stale
    // (and would otherwise resurface later and overwrite newer server state).
    if (draftStorageKey) {
      // Bump the generation BEFORE awaiting. Any debounced save already
      // scheduled is invalidated synchronously, before this function yields —
      // otherwise a timer firing while clearDraft is in flight still passes
      // the guard and races a competing writeDraft against the same key.
      draftSaveGenRef.current += 1
      await clearDraft(draftStorageKey)
      setDraftRestored(false)
    }
  }

  // Resolve the passage + write session, creating them for a blank study. For an
  // existing passage we REUSE it (no duplicate passage created on open/save).
  async function ensureIds(): Promise<{ passageId: string; sessionId: string } | null> {
    if (initialPassageId) {
      let sessionId: string
      if (editSessionId) {
        sessionId = editSessionId
      } else {
        const sessions = await api.getSessionsByPassage(initialPassageId)
        if (sessions.length > 0) {
          sessionId = sessions[sessions.length - 1].id
        } else {
          const session = await api.createSession(initialPassageId)
          sessionId = session.id
        }
      }
      return { passageId: initialPassageId, sessionId }
    }
    if (!reference.trim()) return null
    const parsed = parseReferenceLabel(reference)
    if (!parsed) return null
    const bookNameMatch = reference.trim().match(/^([\d\s]?[a-zA-Z\s]+?)(?=\s+\d)/)
    const bookName = bookNameMatch ? bookNameMatch[1].trim() : ''
    const bookInfo = findBookByAlias(bookName)
    const newPassage = await api.createPassage({
      book_number: bookInfo?.number ?? 1,
      chapter_start: parsed.chapter_start,
      verse_start: parsed.verse_start,
      chapter_end: parsed.chapter_end,
      verse_end: parsed.verse_end,
      reference_label: reference.trim()
    })
    const session = await api.createSession(newPassage.id)
    return { passageId: newPassage.id, sessionId: session.id }
  }

  useImperativeHandle(
    ref,
    () => ({
      // A hydrated study is dirty when any line diverges from its source note,
      // or a note was removed; a blank study is dirty once any text is entered.
      isDirty: () => isLinesDirty(lines, existingNotes),
      save: async () => {
        const ids = await ensureIds()
        if (!ids) return null
        await reconcileNotes(ids.sessionId)
        return ids.passageId
      }
    }),
    [lines, reference, existingNotes, editSessionId, draftStorageKey]
  )

  const handleSaveRead = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const ids = await ensureIds()
      if (!ids) return
      await reconcileNotes(ids.sessionId)
      onSaveRead(ids.passageId)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNext = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const ids = await ensureIds()
      if (!ids) return
      await reconcileNotes(ids.sessionId)
      const nextRef = guessNextReference(reference)
      onSaveNext(nextRef)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`study-layout${scriptureExpanded ? ' study-layout--scripture-expanded' : ''}`}>
      <div className="study-left">
        <div className="passage-heading-wrap">
          <ReferenceInput
            className="passage-heading-input"
            value={reference}
            onChange={setReference}
            onSubmit={commitReference}
            placeholder="e.g. 1 Corinthians 7:1-15"
          />
          {/* "...or Tab" only makes sense with a physical keyboard — split by
              CSS breakpoint rather than a UA check, matching how the rest of
              the app splits mobile/desktop copy. */}
          <div className="passage-heading-hint">
            <span className="hint-text-desktop">Press Enter or Tab to load verse text</span>
            <span className="hint-text-mobile">Press Enter to load verse text</span>
          </div>
        </div>

        {draftRestored && (
          // Inline-styled rather than a new CSS class: this file's fence for
          // this task doesn't include src/assets/**. Colors are still theme
          // tokens (not literals) via var(--cat-application*) — every visual
          // theme (dark/scholarly/paper) redefines those, so a hardcoded hex
          // here wouldn't just clash with dark mode, it would look wrong in
          // every theme but the default. Deliberately distinct from the
          // per-line "saved Xh ago" timestamp (NoteEditor.tsx) so a recovered
          // draft is never mistaken for something already on the server — it
          // disappears the moment this study is saved.
          <div
            role="status"
            style={{
              fontSize: '0.8rem',
              color: 'var(--cat-application)',
              background: 'var(--cat-application-weak)',
              border: '1px solid var(--cat-application)',
              borderRadius: 6,
              padding: '6px 10px',
              margin: '0 0 8px'
            }}
          >
            Restored an unsaved draft from before — nothing here is on the server yet.
          </div>
        )}

        <NoteEditor
          lines={lines}
          focusedLineId={focusedLineId}
          onChange={setLines}
          onFocusChange={setFocusedLineId}
          onCursorLine={handleCursorLine}
          focusNonce={noteFocusNonce}
          existingNotes={existingNotes}
        />

        <div className="study-actions">
          <button
            className="btn-action btn-save-read"
            onClick={handleSaveRead}
            disabled={saving || !reference.trim() || blankAndEmpty}
            title={blankAndEmpty ? 'Type at least one note before saving' : undefined}
          >
            {saving ? (
              'Saving…'
            ) : (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Save & Read
              </>
            )}
          </button>
          <button
            className="btn-action btn-save-next"
            onClick={handleSaveNext}
            disabled={saving || !reference.trim() || blankAndEmpty}
            title={blankAndEmpty ? 'Type at least one note before saving' : undefined}
          >
            Save & Next
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className={`study-right${!passage && !loadingPassage ? ' study-right--empty' : ''}${isResizing ? ' study-right--resizing' : ''}`}
        ref={studyRightRef}
        style={customHeightPx !== null ? { maxHeight: `${customHeightPx}px` } : undefined}
      >
        {/* Mobile-only collapse toggle. On desktop the pane is always fully
            shown (this header is hidden via CSS). Scripture stays pinned at the
            top on mobile and never scrolls fully off-screen. Before a passage
            is loaded there's nothing to expand, so the toggle is inert
            (study-right--empty above hides its hint/chevron and collapses it
            to just this header bar). Tapping it clears any manual drag height
            so the two presets are always reachable again, not stuck behind
            wherever the panel was last dragged to. */}
        <button
          type="button"
          className="study-scripture-toggle"
          aria-expanded={scriptureExpanded}
          onClick={() => {
            if (!passage) return
            setCustomHeightPx(null)
            setScriptureExpanded(v => !v)
          }}
        >
          <span className="study-scripture-toggle-label">
            {passage ? passage.reference : 'Scripture'}
          </span>
          <span className="study-scripture-toggle-hint">
            {scriptureExpanded ? 'Tap to collapse' : 'Tap to expand'}
          </span>
          <svg
            className={`study-scripture-chevron${scriptureExpanded ? ' expanded' : ''}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div className="study-scripture-body" ref={scriptureBodyRef}>
          <ErrorBoundary variant="pane" key={passage?.reference ?? 'empty'}>
            <PassagePane
              passage={passage}
              loading={loadingPassage}
              highlightedVerses={highlightedVerses}
              hasAnyHighlight={hasHighlight}
            />
          </ErrorBoundary>
        </div>
        {/* Mobile-only manual resize handle — overlaid on the bottom edge
            (position:absolute in CSS) rather than taking its own flex row,
            so it doesn't eat into the scripture body's space. Only shown
            once there's something to resize (mirrors the toggle's own
            inertness in the empty state). */}
        {passage && (
          <div
            className="study-resize-handle"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize scripture panel"
          >
            <span className="study-resize-grip" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
})

export default StudyMode

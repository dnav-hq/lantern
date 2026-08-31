/**
 * The desktop study workbench — the notes panel that slides in beside clean
 * scripture when the reading page's Read/Study toggle is flipped to Study.
 *
 * It is the whole of "studying" now: there is no separate study destination to
 * navigate to any more (see BookDetailPage / App). A study is simply the notes
 * left on a chapter, so this panel edits exactly the notes the reading column
 * would otherwise render inline.
 *
 * The note's stored `content` stays the single source of truth — the same
 * "v4-6 @personal prose" line every other surface parses (see noteParser). So
 * the editor here is a raw-content editor with live pills (RichEditInput),
 * which is why typing `v4` both draws a pill and highlights verse 4 in the
 * scripture beside it: the parent watches the anchor this reports.
 *
 * Rendered through a portal onto document.body on purpose. The reading column
 * is shifted with a `transform` while Study is open (so the scripture never
 * re-wraps), and a transformed ancestor would become the containing block for
 * this fixed panel — dragging it around with the text.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NoteCategory, NoteWithPassageInfo } from '../types'
import { parseNoteLine } from '../utils/noteParser'
import { useCategoryLabels, useNoteCategories } from '../utils/useNoteCategories'
import RichEditInput from './RichEditInput'
import ConfirmDialog from './ConfirmDialog'

// The LEADING anchor token only. Clicking or dragging verses REFRESHES this one
// token rather than appending another, which is why a second drag re-aims the
// note instead of leaving "v4 v9-10" behind.
const LEADING_ANCHOR = /^\s*v\d+(?:-\d+)?\s*/i
const ANY_TAG = /@(?:obs(?:ervation)?|hist(?:orical)?|app(?:lication)?|per(?:sonal)?)\b[ \t]*/gi

export interface AnchorRequest {
  start: number
  end: number
  // Bumped by the parent on every verse click / marquee release, so re-selecting
  // the SAME range still re-aims the draft.
  nonce: number
}

export interface StudyRange {
  start: number
  end: number
}

const anchorLabel = (start: number, end: number): string =>
  start === end ? `v${start}` : `v${start}-${end}`

/** Replace (never append) the leading anchor token on a note line. */
function withAnchor(text: string, start: number, end: number): string {
  const rest = text.replace(LEADING_ANCHOR, '')
  return `${anchorLabel(start, end)} ${rest}`
}

/** Set (or clear) the @category tag on a note line, keeping the anchor first. */
function withCategory(text: string, category: NoteCategory | null): string {
  const stripped = text.replace(ANY_TAG, '')
  if (!category) return stripped
  const m = LEADING_ANCHOR.exec(stripped)
  const head = m ? m[0] : ''
  return `${head}@${category} ${stripped.slice(head.length)}`.trimStart()
}

/** The prose of a note — its content with the anchor and tag tokens removed. */
function noteProse(content: string): string {
  return parseNoteLine(content)
    .segments.filter(s => s.type !== 'tag' && s.type !== 'verse-anchor')
    .map(s => s.raw)
    .join('')
    .trim()
}

const rangeOf = (content: string): StudyRange | null => {
  const { anchorStart, anchorEnd } = parseNoteLine(content)
  if (anchorStart === null) return null
  return { start: anchorStart, end: anchorEnd ?? anchorStart }
}

// ─── a saved note, with hover Edit / Delete ──────────────────────────────────

function NoteCard({
  note,
  onEdit,
  onDelete
}: {
  note: NoteWithPassageInfo
  onEdit: () => void
  onDelete: () => void
}): React.ReactElement {
  const [confirming, setConfirming] = useState(false)
  const labels = useCategoryLabels()
  const range = rangeOf(note.content)
  const category = parseNoteLine(note.content).category ?? note.category
  return (
    <div
      className="study-note-card"
      onMouseLeave={() => setConfirming(false)}
      data-note-id={note.id}
    >
      <div
        className={`study-note cat-${category || 'none'}`}
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onEdit()
          }
        }}
      >
        {category && <span className="study-note-cat">{labels[category] ?? category}</span>}
        {range && <span className="pill-verse">{anchorLabel(range.start, range.end)}</span>}
        <span className="study-note-body">{noteProse(note.content)}</span>
      </div>
      <div className="study-note-actions">
        {confirming ? (
          <div className="study-note-act is-confirm">
            <span className="study-note-q">Delete note?</span>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="is-yes" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : (
          <div className="study-note-act">
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="is-del" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── the panel ───────────────────────────────────────────────────────────────

interface StudyWorkbenchProps {
  // "John 15" — the chapter the workbench is about.
  reference: string
  notes: NoteWithPassageInfo[]
  // A verse click / marquee release in the scripture column.
  anchorRequest: AnchorRequest | null
  saving: boolean
  // The anchor the editor currently carries, so the scripture can highlight it.
  onActiveRangeChange: (range: StudyRange | null) => void
  onSave: (noteId: string | null, content: string) => Promise<void>
  onDelete: (noteId: string) => Promise<void>
  // Draft persistence (host writes to IndexedDB, debounced). onDraftChange fires
  // with the live raw content as the reader types a not-yet-saved note; onDraftClear
  // fires when the editor is emptied by a save, discard or cancel. Optional so the
  // workbench still renders in tests/stories without a persistence host.
  onDraftChange?: (content: string, noteId: string | null) => void
  onDraftClear?: () => void
  // A draft handed back by the host's "recover" affordance: seeds the composer
  // once so an accidental reload can resume the in-progress note.
  recoverDraft?: { content: string; noteId: string | null } | null
}

export default function StudyWorkbench({
  reference,
  notes,
  anchorRequest,
  saving,
  onActiveRangeChange,
  onSave,
  onDelete,
  onDraftChange,
  onDraftClear,
  recoverDraft
}: StudyWorkbenchProps): React.ReactElement {
  // null = the blank composer at the top of the panel; otherwise the note being
  // edited in place (its card is replaced by the editor).
  const [editingId, setEditingId] = useState<string | null>(null)
  const categories = useNoteCategories()
  const [text, setText] = useState('')
  // Remount key for the editor. RichEditInput seeds itself from `initialValue`
  // once and then owns its own DOM (it must — it manages a caret), so an
  // EXTERNAL text change (a verse click re-aiming the anchor, a category chip)
  // is applied by re-seeding it. Focus and caret-to-end come free with that.
  const [seed, setSeed] = useState(0)
  const [confirming, setConfirming] = useState(false)
  // A dirty draft the reader is trying to walk away from: the centred dialog.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  // Two-phase exit for the composer: fade in place, then collapse the space.
  const [leaving, setLeaving] = useState<'fade' | 'collapse' | null>(null)
  const leaveTimers = useRef<number[]>([])

  const ordered = useMemo(
    () =>
      [...notes].sort((a, b) => {
        const ra = rangeOf(a.content)?.start ?? Number.MAX_SAFE_INTEGER
        const rb = rangeOf(b.content)?.start ?? Number.MAX_SAFE_INTEGER
        return ra - rb || a.created_at.localeCompare(b.created_at)
      }),
    [notes]
  )

  const editingNote = editingId ? (notes.find(n => n.id === editingId) ?? null) : null
  const parsed = parseNoteLine(text)
  const category = parsed.category
  const activeRange = rangeOf(text)
  const prose = noteProse(text)

  // Live verse highlighting: whatever the editor is anchored to right now.
  useEffect(() => {
    onActiveRangeChange(activeRange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRange?.start, activeRange?.end])

  useEffect(
    () => () => {
      leaveTimers.current.forEach(t => window.clearTimeout(t))
    },
    []
  )

  // Persist the in-progress note as it changes (host debounce-writes to
  // IndexedDB) so a reload can offer it back. Only a genuinely dirty draft —
  // prose present and, when editing, actually diverged from the saved note.
  const draftBaseline = editingNote ? editingNote.content : ''
  useEffect(() => {
    if (prose && text.trim() !== draftBaseline.trim()) onDraftChange?.(text.trim(), editingId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, prose, editingId, draftBaseline])

  // Seed the composer from a host "recover" action (an accidental reload's
  // draft). Once per distinct draft, so re-renders don't clobber later edits.
  const recoveredSig = useRef<string | null>(null)
  useEffect(() => {
    if (!recoverDraft) return
    const sig = `${recoverDraft.noteId ?? 'new'}:${recoverDraft.content}`
    if (recoveredSig.current === sig) return
    recoveredSig.current = sig
    setEditingId(recoverDraft.noteId)
    reseed(recoverDraft.content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoverDraft])

  // A verse click or a marquee release REFRESHES the draft's anchor.
  const lastNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!anchorRequest || anchorRequest.nonce === lastNonce.current) return
    lastNonce.current = anchorRequest.nonce
    setText(t => withAnchor(t, anchorRequest.start, anchorRequest.end))
    setSeed(s => s + 1)
  }, [anchorRequest])

  const reseed = (next: string): void => {
    setText(next)
    setSeed(s => s + 1)
  }

  const resetToComposer = (): void => {
    onDraftClear?.()
    recoveredSig.current = null
    setEditingId(null)
    setText('')
    setConfirming(false)
    setSeed(s => s + 1)
  }

  const handleSave = (): void => {
    if (!prose || saving) return
    void onSave(editingId, text.trim()).then(resetToComposer)
  }

  const handleDelete = (): void => {
    if (!editingNote) return
    void onDelete(editingNote.id).then(resetToComposer)
  }

  // Cancel on the composer: empty just clears in place; dirty asks first. The
  // discard itself is the two-phase fade-then-collapse.
  const fadeOutAndReset = (): void => {
    setConfirming(false)
    setLeaving('fade')
    leaveTimers.current.push(
      window.setTimeout(() => setLeaving('collapse'), 240),
      window.setTimeout(() => {
        setLeaving(null)
        resetToComposer()
      }, 560)
    )
  }

  const handleCancel = (): void => {
    if (editingNote) {
      resetToComposer()
      return
    }
    if (prose) setConfirming(true)
    else reseed('')
  }

  // Opening another note (or a fresh draft) while this one has unsaved text is
  // the "clicking away" case — a centred confirmation, never a silent loss.
  const guarded = (go: () => void): void => {
    if (!editingNote && prose) {
      setPendingLeave(() => go)
      return
    }
    go()
  }

  const openNote = (note: NoteWithPassageInfo): void =>
    guarded(() => {
      setEditingId(note.id)
      setConfirming(false)
      reseed(note.content)
    })

  const setCategory = (id: NoteCategory): void =>
    reseed(withCategory(text, category === id ? null : id))

  const editor = (
    <div
      className={`study-editor cat-${category || 'none'}${confirming ? ' is-confirming' : ''}${
        leaving ? ` is-${leaving}` : ''
      }`}
      data-editing={editingNote ? 'note' : 'draft'}
    >
      <div className="study-editor-inner">
        <RichEditInput
          key={`${editingId ?? 'new'}-${seed}`}
          initialValue={text}
          onChange={setText}
          onSave={handleSave}
          onCancel={handleCancel}
          className="study-editor-body"
        />
        <div className="study-editor-anchor">
          {activeRange ? (
            <>
              Anchored to{' '}
              <b>
                {reference}:
                {activeRange.start === activeRange.end
                  ? activeRange.start
                  : `${activeRange.start}–${activeRange.end}`}
              </b>
            </>
          ) : (
            <>
              Type <b>v5</b> or <b>v4-6</b>, or click a verse, to anchor
            </>
          )}
        </div>
        <div className="study-editor-foot">
          {!confirming && (
            <div className="study-chips">
              {categories.map(c => (
                <button
                  key={c.key}
                  type="button"
                  className={`study-chip cat-${c.key}`}
                  aria-pressed={category === c.key}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setCategory(c.key as NoteCategory)}
                >
                  <span className="study-chip-dot" />
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="study-editor-actions">
            {confirming ? (
              <>
                <span className="study-editor-q">
                  {editingNote ? 'Delete note?' : 'Discard note?'}
                </span>
                <button
                  type="button"
                  className="study-btn-ghost"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="study-btn-danger"
                  onClick={editingNote ? handleDelete : fadeOutAndReset}
                >
                  {editingNote ? 'Delete' : 'Discard'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`study-btn-ghost${editingNote ? ' is-danger' : ''}`}
                  onClick={editingNote ? () => setConfirming(true) : handleCancel}
                >
                  {editingNote ? 'Delete' : 'Cancel'}
                </button>
                <button
                  type="button"
                  className="study-btn-save"
                  disabled={!prose || saving}
                  onClick={handleSave}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(
    <>
      <aside className="study-aside" aria-label={`Notes on ${reference}`}>
        <div className="study-aside-head">
          <span className="study-aside-title">Notes</span>
          <span className="study-aside-ref">{reference}</span>
        </div>
        <div className="study-aside-body">
          {editingId === null && editor}
          {ordered.map(note =>
            note.id === editingId ? (
              <React.Fragment key={note.id}>{editor}</React.Fragment>
            ) : (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => openNote(note)}
                onDelete={() => void onDelete(note.id)}
              />
            )
          )}
          {ordered.length === 0 && (
            <p className="study-aside-empty">
              Nothing written on {reference} yet. Select verses, or type <b>v5</b>, and start.
            </p>
          )}
        </div>
      </aside>
      <ConfirmDialog
        isOpen={pendingLeave !== null}
        title="Discard this note?"
        message="Your note has unsaved changes that will be lost if you leave it."
        onClose={() => setPendingLeave(null)}
        actions={[
          {
            label: 'Keep editing',
            variant: 'ghost',
            autoFocus: true,
            onClick: () => setPendingLeave(null)
          },
          {
            label: 'Discard',
            variant: 'danger',
            onClick: () => {
              const go = pendingLeave
              setPendingLeave(null)
              go?.()
            }
          }
        ]}
      />
    </>,
    document.body
  )
}

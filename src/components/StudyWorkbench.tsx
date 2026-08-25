import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NoteCategory, NoteWithPassageInfo } from '../types'
import { parseNoteLine } from '../utils/noteParser'
import ConfirmDialog from './ConfirmDialog'

// ─── shared note-content helpers ─────────────────────────────────────────────
//
// A note is the only thing this app saves. Its anchor ("which verses") and its
// category are metadata carried INSIDE the note text as tokens (`v4-6`,
// `@personal`) — that is the existing storage model and nothing here changes it.
// These helpers are the one place that turns that text into the three things
// every note surface needs: the prose, the anchor, and a canonical content
// string to write back. They live in this module (rather than a new util file)
// so the reading view, the phone composer and the Journal all share one
// definition instead of three near-copies.

const ANCHOR_RE = /^\s*v\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*/i
// Every `vN` / `vN-M` token, wherever it appears — used to draw live pills in
// the editor as you type.
const TOKEN_RE = /v\s*\d+(?:\s*[-–]\s*\d+)?/gi

export interface VerseRange {
  from: number
  to: number
}

// "v4" / "v4-6" — the compact token form that lives in note text.
export function anchorLabel(from: number, to: number): string {
  return from === to ? `v${from}` : `v${from}-${to}`
}

// "John 15:4" / "John 15:4–6" — the human form shown in headings and bars.
export function referenceLabel(book: string, chapter: number, from: number, to: number): string {
  return from === to ? `${book} ${chapter}:${from}` : `${book} ${chapter}:${from}–${to}`
}

// The LEADING anchor token only. A `v12` mid-sentence is prose, not an anchor —
// the editor's anchor line and the saved note both read the first token.
export function parseLeadingAnchor(text: string): VerseRange | null {
  const m = ANCHOR_RE.exec(text)
  if (!m) return null
  const a = parseInt(m[1], 10)
  const b = m[2] ? parseInt(m[2], 10) : a
  return { from: Math.min(a, b), to: Math.max(a, b) }
}

export function stripLeadingAnchor(text: string): string {
  return text.replace(ANCHOR_RE, '')
}

// The prose a human actually wrote: no leading anchor, no `@category` token.
export function editableText(text: string): string {
  return stripLeadingAnchor(text).replace(/@\w*/g, '').trim()
}

// A saved note's readable body — what the Journal lists and the phone shows.
// Cross-references survive (they're content); anchor + category don't, because
// every surface renders those as their own affordance.
export function noteBodyText(content: string): string {
  const { segments } = parseNoteLine(content)
  return segments
    .filter(s => s.type !== 'tag')
    .map((s, i) => (i === 0 && s.type === 'verse-anchor' ? '' : s.raw))
    .join('')
    .trim()
}

// Rebuild the canonical stored form: anchor token, category token, prose. This
// is what every save writes, so a note captured on a phone and a note typed in
// the desktop workbench are byte-identical in shape.
export function composeNoteContent(
  range: VerseRange | null,
  category: NoteCategory | null,
  prose: string
): string {
  const parts: string[] = []
  if (range) parts.push(anchorLabel(range.from, range.to))
  if (category) parts.push(`@${category}`)
  parts.push(prose.trim())
  return parts.join(' ').trim()
}

// ─── the token field ─────────────────────────────────────────────────────────

const CATEGORIES: Array<[NoteCategory, string]> = [
  ['observation', 'Observation'],
  ['historical', 'Historical'],
  ['application', 'Application'],
  ['personal', 'Personal']
]
const CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: 'Observation',
  historical: 'Historical',
  application: 'Application',
  personal: 'Personal'
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

// Text → HTML with every verse token wrapped as an inert pill. The pill is
// `contenteditable="false"` so a caret can't land inside it and split it.
function pillsHtml(text: string): string {
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index))
    out += `<span class="vpill" contenteditable="false">${escapeHtml(m[0])}</span>`
    last = m.index + m[0].length
  }
  return out + escapeHtml(text.slice(last))
}

// Caret position as a plain character offset into the field's text, so it can
// survive the innerHTML rewrite that re-draws the pills on every keystroke.
function caretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!el.contains(r.endContainer)) return null
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString().length
}

function setCaret(el: HTMLElement, offset: number | null): void {
  if (offset == null) return
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
  let remaining = offset
  let node = walker.nextNode() as Text | null
  const sel = window.getSelection()
  if (!sel) return
  while (node) {
    if (node.length >= remaining) {
      const pill = node.parentElement?.closest('[contenteditable="false"]') ?? null
      const r = document.createRange()
      if (pill) r.setStartAfter(pill)
      else r.setStart(node, remaining)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
      return
    }
    remaining -= node.length
    node = walker.nextNode() as Text | null
  }
  const r = document.createRange()
  r.selectNodeContents(el)
  r.collapse(false)
  sel.removeAllRanges()
  sel.addRange(r)
}

// ─── one note editor (new draft or an existing note) ─────────────────────────

export interface NoteDraft {
  id?: string
  text: string
  category: NoteCategory | null
  range: VerseRange | null
}

interface NoteEditorProps {
  bookName: string
  chapter: number
  note?: NoteWithPassageInfo
  prefill?: VerseRange | null
  inline?: boolean
  saving?: boolean
  onSave: (draft: NoteDraft) => void
  onCancel: () => void
  onDelete?: () => void
  // Live "which verses does this note point at" as the field changes.
  onAnchorChange: (range: VerseRange | null) => void
  // Registers an imperative handle so a verse click/marquee can REPLACE the
  // leading anchor token (never append a second one).
  registerHandle: (handle: NoteEditorHandle | null) => void
}

export interface NoteEditorHandle {
  setAnchor: (range: VerseRange) => void
  isDirty: () => boolean
  focus: () => void
}

function NoteEditor({
  bookName,
  chapter,
  note,
  prefill,
  inline,
  saving,
  onSave,
  onCancel,
  onDelete,
  onAnchorChange,
  registerHandle
}: NoteEditorProps): React.ReactElement {
  const fieldRef = useRef<HTMLDivElement>(null)
  const [category, setCategory] = useState<NoteCategory | null>(note?.category ?? null)
  const [anchor, setAnchor] = useState<VerseRange | null>(() => {
    if (note && note.anchor_start_verse !== null) {
      return {
        from: note.anchor_start_verse,
        to: note.anchor_end_verse ?? note.anchor_start_verse
      }
    }
    return prefill ?? null
  })
  const [hasProse, setHasProse] = useState(!!note && !!noteBodyText(note.content))
  const [confirming, setConfirming] = useState(false)
  const [atOpen, setAtOpen] = useState(false)
  const [atIndex, setAtIndex] = useState(0)
  const [atMatches, setAtMatches] = useState<Array<[NoteCategory, string]>>([])

  const seed = useMemo(() => {
    if (note) {
      const a =
        note.anchor_start_verse !== null
          ? `${anchorLabel(note.anchor_start_verse, note.anchor_end_verse ?? note.anchor_start_verse)} `
          : ''
      return a + noteBodyText(note.content)
    }
    return prefill ? `${anchorLabel(prefill.from, prefill.to)} ` : ''
  }, [note, prefill])

  const initialProse = useRef(note ? noteBodyText(note.content) : '').current
  const initialCategory = useRef(note?.category ?? null).current

  const readText = (): string => fieldRef.current?.textContent ?? ''

  const render = useCallback((text: string, caret: number | null): void => {
    const el = fieldRef.current
    if (!el) return
    el.innerHTML = pillsHtml(text)
    if (caret != null) setCaret(el, caret)
  }, [])

  // Recompute everything derived from the field's text: the anchor line, the
  // save button's enabled state, the live verse highlight, and the @ menu.
  const sync = useCallback((): void => {
    const text = readText()
    const a = parseLeadingAnchor(text)
    setAnchor(a)
    setHasProse(!!editableText(text))
    onAnchorChange(a)
    const off = caretOffset(fieldRef.current!)
    const m = off == null ? null : /@(\w*)$/.exec(text.slice(0, off))
    if (!m) {
      setAtOpen(false)
      return
    }
    const frag = m[1].toLowerCase()
    const matches = CATEGORIES.filter(([c]) => c.startsWith(frag))
    if (matches.length === 0) {
      setAtOpen(false)
      return
    }
    setAtMatches(matches)
    setAtIndex(0)
    setAtOpen(true)
  }, [onAnchorChange])

  useEffect(() => {
    render(seed, null)
    const a = parseLeadingAnchor(seed)
    onAnchorChange(a)
    // Mount-only: re-seeding mid-edit would wipe what's being written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyAnchor = useCallback(
    (range: VerseRange): void => {
      // REPLACE, never concatenate — dragging a second range must move the
      // anchor, not leave "v2 v9-10 …" behind.
      const text = `${anchorLabel(range.from, range.to)} ${stripLeadingAnchor(readText())}`
      render(text, text.length)
      setAnchor(range)
      setHasProse(!!editableText(text))
      onAnchorChange(range)
      fieldRef.current?.focus()
    },
    [render, onAnchorChange]
  )

  const isDirty = useCallback((): boolean => {
    const prose = editableText(readText())
    return prose !== initialProse || category !== initialCategory
  }, [category, initialProse, initialCategory])

  useEffect(() => {
    registerHandle({
      setAnchor: applyAnchor,
      isDirty,
      focus: () => fieldRef.current?.focus()
    })
    return () => registerHandle(null)
  }, [registerHandle, applyAnchor, isDirty])

  const chooseCategory = (c: NoteCategory): void => {
    setCategory(c)
    const el = fieldRef.current
    if (!el) return
    const text = el.textContent ?? ''
    const off = caretOffset(el) ?? text.length
    const before = text.slice(0, off).replace(/@\w*$/, '')
    render(before + text.slice(off), before.length)
    setAtOpen(false)
    setHasProse(!!editableText(readText()))
  }

  const commit = (): void => {
    const text = readText()
    const prose = editableText(text)
    if (!prose || saving) return
    onSave({ id: note?.id, text: prose, category, range: parseLeadingAnchor(text) })
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (atOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAtIndex(i => (i + 1) % atMatches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAtIndex(i => (i - 1 + atMatches.length) % atMatches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        chooseCategory(atMatches[atIndex][0])
        return
      }
      if (e.key === 'Escape') {
        setAtOpen(false)
        return
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    // Enter saves; Shift+Enter is a newline. Matches every other quick capture
    // surface in the app.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
  }

  return (
    <div
      className={`sw-editor${inline ? ' sw-editor-inline' : ''}`}
      data-c={category ?? undefined}
      data-no-drag
    >
      <div
        ref={fieldRef}
        className="sw-field"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Note"
        suppressContentEditableWarning
        data-ph="Write a note…  type v5 or v4-6 to anchor, @ to tag"
        onInput={() => {
          const el = fieldRef.current
          if (!el) return
          const off = caretOffset(el)
          render(el.textContent ?? '', off)
          sync()
        }}
        onFocus={() => onAnchorChange(parseLeadingAnchor(readText()))}
        onKeyDown={handleKeyDown}
      />

      <div className="sw-anchor">
        {anchor ? (
          <>
            Anchored to <b>{referenceLabel(bookName, chapter, anchor.from, anchor.to)}</b>
          </>
        ) : (
          <>
            Type <b>v5</b> or <b>v4-6</b>, or click a verse, to anchor
          </>
        )}
      </div>

      {atOpen && (
        <div className="sw-atmenu" role="listbox">
          {atMatches.map(([c, label], i) => (
            <button
              type="button"
              key={c}
              className={`sw-atmenu-item${i === atIndex ? ' active' : ''}`}
              role="option"
              aria-selected={i === atIndex}
              onMouseDown={e => {
                e.preventDefault()
                chooseCategory(c)
              }}
            >
              <span className="sw-dot" style={{ background: `var(--cat-${c})` }} />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={`sw-foot${confirming ? ' confirming' : ''}`}>
        {!confirming && (
          <div className="sw-chips">
            {CATEGORIES.map(([c, label]) => (
              <button
                type="button"
                key={c}
                className="sw-chip"
                data-c={c}
                aria-pressed={category === c}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setCategory(category === c ? null : c)}
              >
                <span className="sw-dot" />
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="sw-actions">
          {confirming ? (
            <>
              <span className="sw-q">{note ? 'Delete note?' : 'Discard note?'}</span>
              <button type="button" className="sw-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sw-danger"
                onClick={() => (note ? onDelete?.() : onCancel())}
              >
                {note ? 'Delete' : 'Discard'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`sw-ghost${note ? ' sw-ghost-danger' : ''}`}
                onClick={() => {
                  if (note) setConfirming(true)
                  else if (isDirty()) setConfirming(true)
                  else onCancel()
                }}
              >
                {note ? 'Delete' : 'Cancel'}
              </button>
              <button type="button" className="sw-save" onClick={commit} disabled={!hasProse}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── a saved note card, with hover Edit / Delete ─────────────────────────────

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
  const body = noteBodyText(note.content)
  return (
    <div className="sw-card" onMouseLeave={() => setConfirming(false)}>
      <div className="sw-note" data-c={note.category ?? undefined} onClick={onEdit}>
        <div className="sw-note-body">
          {note.category && <span className="sw-cat-label">{CATEGORY_LABELS[note.category]}</span>}
          {note.anchor_start_verse !== null && (
            <span className="vpill">
              {anchorLabel(
                note.anchor_start_verse,
                note.anchor_end_verse ?? note.anchor_start_verse
              )}
            </span>
          )}
          {body}
        </div>
      </div>
      <div className="sw-card-actions">
        {confirming ? (
          <div className="sw-card-bar">
            <span className="sw-q">Delete note?</span>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="sw-card-yes" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : (
          <div className="sw-card-bar">
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="sw-card-del" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── the workbench ───────────────────────────────────────────────────────────

export interface StudyWorkbenchProps {
  bookName: string
  chapter: number
  notes: NoteWithPassageInfo[]
  saving?: boolean
  onSave: (draft: NoteDraft) => void
  onDelete: (note: NoteWithPassageInfo) => void
  // Which verses the active editor points at, so the scripture column can
  // highlight them live as you type or drag.
  onAnchorChange: (range: VerseRange | null) => void
  // A verse click / marquee release in the scripture column. Bumping `seq` is
  // what makes re-selecting the SAME range register again.
  anchorRequest: { range: VerseRange; seq: number } | null
}

// The notes panel that opens beside the scripture at desktop widths when the
// reading page is switched to Study. Everything you can do to a note lives
// here; the scripture column stays clean text you can select against.
export default function StudyWorkbench({
  bookName,
  chapter,
  notes,
  saving,
  onSave,
  onDelete,
  onAnchorChange,
  anchorRequest
}: StudyWorkbenchProps): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  // Bumped to force the blank composer to remount (and clear) after a save.
  const [composerKey, setComposerKey] = useState(0)
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null)
  const handleRef = useRef<NoteEditorHandle | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const registerHandle = useCallback((h: NoteEditorHandle | null) => {
    handleRef.current = h
  }, [])

  // Push a scripture-side selection into whichever editor is active.
  const lastSeq = useRef(-1)
  useEffect(() => {
    if (!anchorRequest || anchorRequest.seq === lastSeq.current) return
    lastSeq.current = anchorRequest.seq
    handleRef.current?.setAnchor(anchorRequest.range)
  }, [anchorRequest])

  // Click-away from a dirty draft: keep the writing, ask before losing it.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('.sw-editor') || target.closest('.dialog-backdrop')) return
      if (!handleRef.current?.isDirty()) return
      // Only an actionable click is worth interrupting for — a press on empty
      // space just leaves the draft where it is.
      if (!target.closest('button, .sw-card, .reading-verse-row')) return
      e.preventDefault()
      e.stopPropagation()
      setPendingDiscard(() => () => {
        setEditingId(null)
        setComposerKey(k => k + 1)
      })
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [])

  const ordered = useMemo(
    () =>
      [...notes].sort(
        (a, b) =>
          (a.anchor_start_verse ?? Number.MAX_SAFE_INTEGER) -
            (b.anchor_start_verse ?? Number.MAX_SAFE_INTEGER) ||
          a.created_at.localeCompare(b.created_at)
      ),
    [notes]
  )

  return (
    <div className="sw" ref={rootRef}>
      <div className="sw-head">
        <div className="sw-head-title">Notes</div>
        <div className="sw-head-sub">
          {bookName} {chapter}
        </div>
      </div>
      <div className="sw-list">
        {editingId === null && (
          <NoteEditor
            key={`composer-${composerKey}`}
            bookName={bookName}
            chapter={chapter}
            saving={saving}
            onSave={draft => {
              onSave(draft)
              setComposerKey(k => k + 1)
            }}
            onCancel={() => setComposerKey(k => k + 1)}
            onAnchorChange={onAnchorChange}
            registerHandle={registerHandle}
          />
        )}
        {ordered.map(n =>
          editingId === n.id ? (
            <NoteEditor
              key={n.id}
              bookName={bookName}
              chapter={chapter}
              note={n}
              saving={saving}
              onSave={draft => {
                onSave(draft)
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
              onDelete={() => {
                onDelete(n)
                setEditingId(null)
              }}
              onAnchorChange={onAnchorChange}
              registerHandle={registerHandle}
            />
          ) : (
            <NoteCard
              key={n.id}
              note={n}
              onEdit={() => setEditingId(n.id)}
              onDelete={() => onDelete(n)}
            />
          )
        )}
        {ordered.length === 0 && (
          <p className="sw-empty">
            Nothing noted here yet. Write above, or drag across the verses to anchor a note.
          </p>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingDiscard !== null}
        title="Discard this note?"
        message="Your note has unsaved changes that will be lost if you leave it."
        onClose={() => setPendingDiscard(null)}
        actions={[
          {
            label: 'Keep editing',
            variant: 'ghost',
            autoFocus: true,
            onClick: () => setPendingDiscard(null)
          },
          {
            label: 'Discard',
            variant: 'danger',
            onClick: () => {
              pendingDiscard?.()
              setPendingDiscard(null)
            }
          }
        ]}
      />
    </div>
  )
}

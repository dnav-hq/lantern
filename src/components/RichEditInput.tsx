/**
 * THE note editor. One contenteditable surface for both writing a new note and
 * editing an existing one — the create flow used to be a form control
 * (InlineTagInput), which could render no pills and could not wrap, so "v2-5"
 * and "@personal" read as plain text while you typed and a long note scrolled
 * sideways. There is one editor now; the create/edit distinction is only the
 * copy on the card around it.
 *
 * Renders pills (verse anchors, tags, cross-refs) exactly like study mode, with
 * the same @tag autocomplete dropdown. Enter → save, Escape → cancel.
 *
 * IT SEEDS ITSELF FROM `initialValue` ONCE and then owns its own DOM, because
 * it manages a caret. An EXTERNAL text change (a category chip rewriting the
 * tag, a verse click re-aiming the anchor) is applied by re-seeding it through
 * a fresh `key` — never by pushing a new `initialValue` at a mounted editor.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { NoteCategoryDef } from '../types'
import { useNoteCategories } from '../utils/useNoteCategories'
import { getRawText, getRawCursorPos, setRawCursorPos, renderRich } from '../utils/richText'

interface DropdownState {
  query: string
  anchorIndex: number
  cursorPos: number
  activeIdx: number
}

interface RichEditInputProps {
  initialValue: string
  onChange: (val: string) => void
  onSave: () => void
  onCancel: () => void
  className?: string
  /** Shown while the editor is empty (a contenteditable has no native one). */
  placeholder?: string
  /** Accessible name, since a contenteditable is not a labelled form control. */
  ariaLabel?: string
}

export default function RichEditInput({
  initialValue,
  onChange,
  onSave,
  onCancel,
  className,
  placeholder,
  ariaLabel
}: RichEditInputProps): React.ReactElement {
  const elRef = useRef<HTMLDivElement>(null)
  const [dropdown, setDropdown] = useState<DropdownState | null>(null)
  // Drives the CSS placeholder only. A contenteditable is not reliably `:empty`
  // once it has been typed into and cleared (browsers leave a <br> behind), so
  // emptiness is tracked here rather than asserted in a selector.
  const [empty, setEmpty] = useState(initialValue.length === 0)

  // The @tag dropdown reads the SHARED category store, like every other picker.
  // It used to hold its own hardcoded copy of the four built-ins — the same
  // private-map bug the desktop sweep found in StudyWorkbench, BookDetailPage
  // and ReadingMode, and the one removed from InlineTagInput on 2026-09-02.
  // A private list means a renamed category still offers its old name and a
  // reader's own categories are silently missing.
  const categories = useNoteCategories()

  const filteredTags: NoteCategoryDef[] = dropdown
    ? categories.filter(c => c.key.startsWith(dropdown.query.toLowerCase()))
    : []
  const isOpen = filteredTags.length > 0

  // Render initial value with pills and place cursor at end
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    renderRich(el, initialValue)
    el.focus()
    setRawCursorPos(el, initialValue.length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectTag = useCallback(
    (tag: NoteCategoryDef): void => {
      const el = elRef.current
      if (!el || !dropdown) return
      const text = getRawText(el)
      const before = text.slice(0, dropdown.anchorIndex)
      const after = text.slice(dropdown.cursorPos)
      const insertion = `@${tag.key} `
      const newText = before + insertion + after
      onChange(newText)
      renderRich(el, newText)
      setRawCursorPos(el, before.length + insertion.length)
      setEmpty(newText.length === 0)
      setDropdown(null)
      el.focus()
    },
    [dropdown, onChange]
  )

  const handleInput = (): void => {
    const el = elRef.current
    if (!el) return
    const cursorPos = getRawCursorPos(el)
    const text = getRawText(el)
    onChange(text)
    setEmpty(text.length === 0)
    renderRich(el, text, cursorPos)
    setRawCursorPos(el, cursorPos)

    const before = text.slice(0, cursorPos)
    const m = /@(\w*)$/.exec(before)
    if (m) {
      setDropdown({ query: m[1], anchorIndex: m.index, cursorPos, activeIdx: 0 })
    } else {
      setDropdown(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isOpen && dropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setDropdown(d =>
          d ? { ...d, activeIdx: Math.min(d.activeIdx + 1, filteredTags.length - 1) } : d
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setDropdown(d => (d ? { ...d, activeIdx: Math.max(d.activeIdx - 1, 0) } : d))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const tag = filteredTags[dropdown.activeIdx] ?? filteredTags[0]
        if (tag) selectTag(tag)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDropdown(null)
        return
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      onSave()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setDropdown(null)
      onCancel()
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (!elRef.current?.parentElement?.contains(e.target as Node)) setDropdown(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        className={`rich-edit${empty && placeholder ? ' is-empty' : ''}${className ? ` ${className}` : ''}`}
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        style={{
          outline: 'none',
          minHeight: '1.6em',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          cursor: 'text'
        }}
      />
      {isOpen && (
        <div className="tag-dropdown" style={{ left: 0 }}>
          {filteredTags.map((tag, i) => (
            <div
              key={tag.key}
              className={`tag-dropdown-item${i === dropdown?.activeIdx ? ' active' : ''}`}
              onMouseDown={e => {
                e.preventDefault()
                selectTag(tag)
              }}
              onMouseEnter={() => setDropdown(d => (d ? { ...d, activeIdx: i } : d))}
            >
              <span className={`tag-dropdown-swatch swatch-${tag.key}`} />
              {/* The KEY is what gets typed into the note, so it is what the row
                  shows; the reader's own label rides alongside it. */}
              <span className="tag-dropdown-label">@{tag.key}</span>
              {tag.label.toLowerCase() !== tag.key && (
                <span className="tag-dropdown-name">{tag.label}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

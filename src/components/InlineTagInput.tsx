/**
 * A single-line input (or multiline textarea) that shows the @tag picker dropdown.
 * Drop-in replacement for <input> in inline note contexts.
 * Pass multiline={true} for a textarea that auto-resizes and saves on Cmd/Ctrl+Enter.
 */
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle
} from 'react'
import type { NoteCategoryDef } from '../types'
import { useNoteCategories } from '../utils/useNoteCategories'

// The @tag dropdown reads the SHARED category store, like every other picker.
// It used to hold its own hardcoded copy of the four built-ins — the same
// private-map bug the desktop sweep found in StudyWorkbench, BookDetailPage and
// ReadingMode (finding 3), surviving in the one place nobody looked. It meant a
// renamed category still offered its old name here, and it would have silently
// ignored a reader's own categories the moment those can be created.
function filterTags(cats: NoteCategoryDef[], q: string): NoteCategoryDef[] {
  return cats.filter(c => c.key.startsWith(q.toLowerCase()))
}

export interface InlineTagInputHandle {
  focus: () => void
}

interface InlineTagInputProps {
  value: string
  onChange: (val: string) => void
  onEnter?: () => void
  onEscape?: () => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
  multiline?: boolean
}

const InlineTagInput = forwardRef<InlineTagInputHandle, InlineTagInputProps>(
  function InlineTagInput(
    { value, onChange, onEnter, onEscape, className, placeholder, autoFocus, multiline },
    ref
  ) {
    const categories = useNoteCategories()
    const inputRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [dropdown, setDropdown] = useState<{
      query: string
      anchorIndex: number
      cursorPos: number
      activeIdx: number
    } | null>(null)

    const filteredTags = dropdown ? filterTags(categories, dropdown.query) : []
    const isOpen = filteredTags.length > 0

    useImperativeHandle(ref, () => ({
      focus: () => (multiline ? textareaRef.current?.focus() : inputRef.current?.focus())
    }))

    // Auto-resize textarea when value changes
    useEffect(() => {
      if (!multiline) return
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }, [value, multiline])

    const getActiveEl = useCallback(
      (): HTMLInputElement | HTMLTextAreaElement | null =>
        multiline ? textareaRef.current : inputRef.current,
      [multiline]
    )

    const selectTag = useCallback(
      (tag: NoteCategoryDef): void => {
        if (!dropdown) return
        const before = value.slice(0, dropdown.anchorIndex)
        const after = value.slice(dropdown.cursorPos)
        const insertion = `@${tag.key} `
        onChange(before + insertion + after)
        setDropdown(null)
        setTimeout(() => {
          const el = getActiveEl()
          if (el) {
            const pos = before.length + insertion.length
            el.focus()
            el.setSelectionRange(pos, pos)
          }
        }, 0)
      },
      [dropdown, value, onChange, getActiveEl]
    )

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      const text = e.target.value
      const cursor = e.target.selectionStart ?? text.length
      onChange(text)
      const before = text.slice(0, cursor)
      const m = /@(\w*)$/.exec(before)
      if (m) {
        setDropdown({ query: m[1], anchorIndex: m.index, cursorPos: cursor, activeIdx: 0 })
      } else {
        setDropdown(null)
      }
    }

    const handleKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
    ): void => {
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

      if (multiline) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          onEnter?.()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setDropdown(null)
          onEscape?.()
        }
      } else {
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter?.()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setDropdown(null)
          onEscape?.()
        }
      }
    }

    useEffect(() => {
      const h = (e: MouseEvent): void => {
        const el = getActiveEl()
        if (!el?.parentElement?.contains(e.target as Node)) setDropdown(null)
      }
      document.addEventListener('mousedown', h)
      return () => document.removeEventListener('mousedown', h)
    }, [getActiveEl])

    const dropdownEl = isOpen && (
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
                shows. The reader's own label rides alongside it, so a renamed
                category is recognisable here without pretending the tag itself
                changed — renaming a category does not rewrite saved notes. */}
            <span className="tag-dropdown-label">@{tag.key}</span>
            {tag.label.toLowerCase() !== tag.key && (
              <span className="tag-dropdown-name">{tag.label}</span>
            )}
          </div>
        ))}
      </div>
    )

    return (
      <div style={{ position: 'relative', flex: 1 }}>
        {multiline ? (
          <textarea
            ref={textareaRef}
            className={className}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <input
            ref={inputRef}
            className={className}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {dropdownEl}
      </div>
    )
  }
)

export default InlineTagInput

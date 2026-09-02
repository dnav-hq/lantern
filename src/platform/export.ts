// platform/export.ts — "Export all notes" as a zip.
//
// EXPORT IS A TRUST PRECONDITION, not a retrieval nicety. The loudest and most
// durable complaints in this category come from people whose years of notes
// were locked inside a product that was discontinued, re-platformed, or moved
// to a subscription they would not pay. That anger is about custody, not
// features, and a personal spiritual journal is the most acute version of it.
// See docs/proposals/journal-retrieval.md §4.
//
// The zip therefore carries the same notes twice, on purpose:
//   notes/{Book}.md  — for humans. Readable, greppable, pasteable anywhere,
//                      each note carrying its reference, category and date.
//                      This is what makes someone feel un-trapped.
//   notes.json       — for machines. Every field verbatim, so a future import
//                      (or a migration to something that does not exist yet)
//                      never asks anyone to re-key years of work.
//
// This is a `platform/` module because a Capacitor/Tauri wrapper would
// reimplement only the "save this file somewhere" step natively. Everything
// above that line is pure and portable, and unit-tested as such.
//
// REPLACES the legacy per-passage vault format (one file per `passages` row,
// mirroring the frozen Electron app byte-for-byte). That format organised a
// reader's own notes by a storage container the product no longer has a
// concept of — opening the zip showed folders named after database rows. Its
// only consumer was the Electron app on `legacy/electron`, which is frozen, so
// nothing depends on it.

import { zipSync, strToU8 } from 'fflate'
import type { BereanApi } from '../api/types'
import type { NoteCategoryDef, NoteWithPassageInfo } from '../types'
import { bookByNumber } from '../utils/bibleBooks'
import { paletteHex, resolveCategories } from '../utils/noteCategories'
import { isHighlight } from '../utils/noteKind'

// Make a string safe for use as a filename on macOS, Windows, and Linux.
export function safeFilename(s: string): string {
  return s
    .replace(/:/g, '.') // "Romans 8:1-11" -> "Romans 8.1-11"
    .replace(/[\\/?*"|<>]/g, '')
    .trim()
}

/** "8:28", "8:28-30", or "8" when the note is anchored to the whole chapter. */
export function noteReference(note: NoteWithPassageInfo): string {
  const chapter = note.anchor_chapter_override ?? note.chapter_start
  const start = note.anchor_start_verse
  if (start === null) return String(chapter)
  const end = note.anchor_end_verse
  return end !== null && end > start ? `${chapter}:${start}-${end}` : `${chapter}:${start}`
}

/** The chapter a note belongs to, honouring the per-note override. */
function chapterOf(note: NoteWithPassageInfo): number {
  return note.anchor_chapter_override ?? note.chapter_start
}

/** Reading order: by chapter, then verse (whole-chapter notes first), then time. */
export function compareNotes(a: NoteWithPassageInfo, b: NoteWithPassageInfo): number {
  const ch = chapterOf(a) - chapterOf(b)
  if (ch !== 0) return ch
  const av = a.anchor_start_verse
  const bv = b.anchor_start_verse
  if (av !== bv) {
    if (av === null) return -1
    if (bv === null) return 1
    return av - bv
  }
  return a.created_at.localeCompare(b.created_at)
}

/**
 * One book's notes as Markdown, in canon order, grouped by chapter.
 *
 * Deliberately plain: a reader should be able to open this in any text editor
 * ten years from now and understand it without documentation. Sub-notes keep
 * their nesting as list indentation, since that nesting is meaning.
 */
export function serializeBookMarkdown(bookName: string, notes: NoteWithPassageInfo[]): string {
  const ordered = [...notes].sort(compareNotes)
  const lines: string[] = [`# ${bookName}`, '']

  let lastChapter: number | null = null
  for (const note of ordered) {
    const chapter = chapterOf(note)
    if (chapter !== lastChapter) {
      lines.push(`## ${bookName} ${chapter}`, '')
      lastChapter = chapter
    }
    // Metadata a reader would actually want back: where it was anchored, which
    // category it was filed under (the axis people index on), and when it was
    // written. Category is omitted rather than shown as "null" when unset.
    const meta = [noteReference(note), note.category, note.created_at.slice(0, 10)]
      .filter(Boolean)
      .join(' · ')
    const indent = '  '.repeat(Math.max(0, note.indent_level))
    if (isHighlight(note)) {
      // A highlight has no words. Say so, rather than writing a bullet that
      // trails off into nothing and reads as data loss.
      lines.push(`${indent}- **${meta}** — *(marked)*`)
      continue
    }
    // A multi-line note keeps its shape by indenting continuation lines to sit
    // under the bullet, which is ordinary Markdown list continuation.
    const body = note.content.split('\n').join(`\n${indent}  `)
    lines.push(`${indent}- **${meta}** — ${body}`)
  }

  lines.push('')
  return lines.join('\n')
}

export interface ExportResult {
  noteCount: number
  bookCount: number
  fileCount: number
}

/** Group notes by book, in canon order, skipping books with nothing in them. */
export function groupByBook(
  notes: NoteWithPassageInfo[]
): Array<{ bookNumber: number; bookName: string; notes: NoteWithPassageInfo[] }> {
  const byBook = new Map<number, NoteWithPassageInfo[]>()
  for (const note of notes) {
    const list = byBook.get(note.book_number)
    if (list) list.push(note)
    else byBook.set(note.book_number, [note])
  }
  return [...byBook.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bookNumber, bookNotes]) => ({
      bookNumber,
      bookName: bookByNumber(bookNumber)?.name ?? `Book ${bookNumber}`,
      notes: bookNotes
    }))
}

/** The whole export, as a map of path -> file contents. Pure, so it is testable. */
export function buildExportFiles(
  notes: NoteWithPassageInfo[],
  categories: NoteCategoryDef[] = []
): Record<string, string> {
  const files: Record<string, string> = {}
  for (const { bookName, notes: bookNotes } of groupByBook(notes)) {
    files[`notes/${safeFilename(bookName)}.md`] = serializeBookMarkdown(bookName, bookNotes)
  }
  // Every field verbatim, sorted the same way, so the JSON and the Markdown
  // describe the same thing in the same order.
  //
  // Categories ride along because a note stores its category as a KEY, and a
  // reader who renamed one would otherwise open the export and find their notes
  // filed under a word they had replaced. COLOUR IS RESOLVED TO A HEX here on
  // purpose: internally it is a palette slot id ("teal") that means one value in
  // light and another in dark, and an exported file has no themes to resolve
  // against — so the light field value, which is what they saw when they picked
  // it, is written out instead.
  files['notes.json'] = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      format: 'lantern-notes-v1',
      note_count: notes.length,
      categories: categories.map(c => ({
        key: c.key,
        label: c.label,
        color: paletteHex(c.color) ?? c.color
      })),
      notes: [...notes].sort(compareNotes)
    },
    null,
    2
  )
  return files
}

/**
 * Build the zip in memory and hand it to the browser.
 *
 * ONE database read, not one per passage: the previous implementation called
 * getPassages() then getNotesByPassage() in a loop, so a workspace with 400
 * passages did 401 round trips. getAllNotes() returns everything needed.
 */
export async function exportAllNotesAsZip(api: BereanApi): Promise<ExportResult> {
  const notes = await api.getAllNotes()
  // A failed definitions read is not worth failing an export over: the notes
  // are the thing being rescued, and the keys in them are still readable.
  let categories: NoteCategoryDef[] = []
  try {
    categories = resolveCategories(await api.getNoteCategories())
  } catch {
    // Fall through with none.
  }
  const contents = buildExportFiles(notes, categories)

  const files: Record<string, Uint8Array> = {}
  for (const [path, text] of Object.entries(contents)) files[path] = strToU8(text)

  const zipped = zipSync(files, { level: 6 })
  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lantern-notes-${new Date().toISOString().slice(0, 10)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return {
    noteCount: notes.length,
    bookCount: groupByBook(notes).length,
    fileCount: Object.keys(files).length
  }
}

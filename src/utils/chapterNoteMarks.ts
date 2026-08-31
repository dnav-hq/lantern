import type { NoteWithPassageInfo } from '../types'

/* ─── Chapter note marks ──────────────────────────────────────────────────────
   The pip under a chapter number in the reading strip, saying "you have written
   here". The strip already carried a neutral dot; this decides its COLOUR.

   Why colour: the strip is where a reader asks "which chapters have I worked
   in", and that question is asked at the moment of choosing where to go. A
   coloured pip answers a second question for free — what KIND of work — which
   is the axis people actually index their own notes on (see
   docs/proposals/note-object.md). Dennis's call, 2026-08-31.

   Why ONE pip and not one per category: a chapter usually holds several kinds
   of note, and stacking pips would turn a navigation control into a chart —
   noisy on a long book, and the beginning of the page keeping score. One pip
   for the dominant category is presence plus a hint, not a breakdown.

   Deliberately NO COUNT anywhere. Presence, not quantity. See
   design/chapter-note-count-v2.html for the options this came from.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The chapter a note belongs to.
 *
 * Honours the per-note override, which exists precisely because a note can be
 * anchored somewhere other than where its passage row says. The strip used to
 * read `chapter_start` directly, so a note moved to another chapter marked the
 * wrong one — and left the right one unmarked.
 */
export function chapterOfNote(note: NoteWithPassageInfo): number {
  return note.anchor_chapter_override ?? note.chapter_start
}

/**
 * Chapter number -> the category to colour its pip with, or null when the
 * chapter's notes carry no category at all (then the pip stays neutral).
 *
 * Ties break toward the category seen first in reading order, which is stable
 * for a given set of notes rather than dependent on Map iteration luck.
 */
export function chapterNoteCategories(notes: NoteWithPassageInfo[]): Map<number, string | null> {
  const counts = new Map<number, Map<string, number>>()
  const order = new Map<number, string[]>()

  for (const note of notes) {
    const chapter = chapterOfNote(note)
    if (!counts.has(chapter)) {
      counts.set(chapter, new Map())
      order.set(chapter, [])
    }
    if (!note.category) continue
    const perChapter = counts.get(chapter)!
    const seen = perChapter.get(note.category)
    if (seen === undefined) order.get(chapter)!.push(note.category)
    perChapter.set(note.category, (seen ?? 0) + 1)
  }

  const out = new Map<number, string | null>()
  for (const [chapter, perChapter] of counts) {
    let best: string | null = null
    let bestCount = 0
    // Walk in first-seen order so a tie resolves the same way every render.
    for (const category of order.get(chapter) ?? []) {
      const n = perChapter.get(category) ?? 0
      if (n > bestCount) {
        best = category
        bestCount = n
      }
    }
    out.set(chapter, best)
  }
  return out
}

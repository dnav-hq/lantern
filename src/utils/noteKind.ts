import type { Note } from '../types'
import { parseNoteLine } from './noteParser'

/* ─── What a highlight is ─────────────────────────────────────────────────────
   A HIGHLIGHT IS A NOTE WITH NO BODY. Same anchor, same categories, same
   colour, same Journal, same export. Not a second object, not a new table, not
   a `kind` column — see docs/proposals/note-object.md §2.

   WHY IT EXISTS. The cheapest thing Lantern could do until now was write a
   note, which presumes you can already articulate what you saw. There are
   moments in reading where you notice something and have no words for it yet,
   and today that moment produces nothing at all. A highlight catches it, and it
   can grow a body later, or never. It is the missing bottom rung.

   WHY DERIVED RATHER THAN STORED. Making "kind" a column would mean a
   migration, two write paths, and a note that could disagree with itself (a
   stored kind of 'highlight' on a note with text). Emptiness is already the
   truth; reading it is free, and a highlight that later gains a body simply
   stops being one.

   WHY VERSE-LEVEL, NOT WORD-LEVEL. Word offsets differ between translations, so
   a sub-verse highlight anchored in ESV cannot survive being read in BSB.
   Verse anchoring is exactly the property Lantern wins on and YouVersion users
   complain about lacking ("notes don't transfer between versions"). Sub-verse
   highlighting would forfeit it, and must be a deliberate trade if ever made.
   ──────────────────────────────────────────────────────────────────────────── */

export type NoteKind = 'note' | 'highlight'

/**
 * One line of a note as prose: the tag token (@observation) is dropped because
 * the category is carried separately, and a LEADING verse anchor (v4-5) is
 * dropped because the anchor is carried separately too.
 *
 * This is why "is it a highlight" is NOT `content === ''`. A wordless mark is
 * stored as `v4 @personal` — composeNoteContent always writes the anchor and
 * the tag — so the emptiness that matters is emptiness AFTER those are removed.
 * Getting this wrong made every mark look like a written note whose text had
 * gone missing.
 */
function lineProse(line: string): string {
  const { segments } = parseNoteLine(line)
  return segments
    .filter((seg, i) => seg.type !== 'tag' && !(i === 0 && seg.type === 'verse-anchor'))
    .map(seg => (seg.type === 'text' ? seg.raw : seg.display))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Everything the reader actually wrote, with anchors and tags stripped. */
export function noteProse(content: string): string {
  return content.split('\n').map(lineProse).filter(Boolean).join(' ')
}

/** True when the note carries no prose — i.e. it is a mark, not a written note. */
export function isHighlight(note: Pick<Note, 'content'>): boolean {
  return noteProse(note.content) === ''
}

export function noteKindOf(note: Pick<Note, 'content'>): NoteKind {
  return isHighlight(note) ? 'highlight' : 'note'
}

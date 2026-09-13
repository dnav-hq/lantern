/* ─── Finding a word-level mark in the verse on screen ────────────────────────
   A word-level highlight stores the WORDS the reader marked, not their
   position: `notes.highlighted_text` is a verbatim quote, and where it lands is
   worked out again every time the verse is rendered. That is the whole design —
   see docs/proposals/word-level-highlights.md §2.

   WHY A QUOTE AND NOT AN OFFSET. A character range (or word index) is measured
   against ONE translation's wording, so it lands on the wrong words, or off the
   end, the moment the reader switches translation. Verse anchoring is the
   property Lantern wins on and sub-verse highlighting was declined once for
   exactly this reason (docs/proposals/note-object.md §2). A quote has no such
   failure mode: it is either found in the text being displayed or it isn't.

   WHY A MISS IS NOT AN ERROR. When the quote isn't found — most often because
   the reader marked it in the BSB and is now reading the KJV, which keeps a BSB
   word-span verbatim about a third of the time (brief §3) — the caller falls
   back to tinting the WHOLE VERSE, which is what every highlight has done since
   highlights shipped. So a miss produces today's behaviour, never a broken or
   misplaced mark, which is what makes a partial hit rate an acceptable place to
   start.

   WHY TWO HITS ALSO FALL BACK. If the quoted words occur twice in the verse
   there is no honest way to know which run the reader meant, and tinting the
   wrong one is worse than tinting the verse. "Unique or nothing" keeps this
   function total and keeps the fallback safe.
   ──────────────────────────────────────────────────────────────────────────── */

/** Half-open character range into the verse text AS DISPLAYED. */
export interface HighlightSpan {
  start: number
  end: number
}

/** Anything that isn't a letter or a number, for edge trimming. */
const EDGE_JUNK = /[^\p{L}\p{N}]/u
const WORD_CHAR = /[\p{L}\p{N}]/u

/**
 * The comparison form of a piece of verse text: lower-cased, with every run of
 * whitespace collapsed to one space.
 *
 * Returned alongside a map from each normalised character back to its offset in
 * the original string, which is how a match found in normalised space becomes a
 * span in the text actually on screen. Without it a verse whose source has a
 * line break or a double space inside the marked phrase could never be mapped
 * back correctly.
 */
function normalise(text: string): { value: string; offsets: number[] } {
  let value = ''
  const offsets: number[] = []
  let pendingSpace = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (/\s/.test(ch)) {
      // One space for a whole run, mapped to the first character of the run so
      // a span starting at a space still points at real text.
      pendingSpace = value.length > 0
      continue
    }
    if (pendingSpace) {
      value += ' '
      offsets.push(i)
      pendingSpace = false
    }
    value += ch.toLowerCase()
    offsets.push(i)
  }
  return { value, offsets }
}

/**
 * Where the quoted words sit in this verse text, or null.
 *
 * Matching is case-insensitive and whitespace-normalised (the reader's
 * selection and the rendered verse disagree about both constantly), and must be
 * UNIQUE — zero or two-plus occurrences both return null, and the caller tints
 * the whole verse instead.
 */
export function findHighlightSpan(verseText: string, quote: string | null): HighlightSpan | null {
  if (!quote) return null
  const needle = normalise(quote).value.trim()
  if (!needle) return null
  const hay = normalise(verseText)

  const first = hay.value.indexOf(needle)
  if (first === -1) return null
  // Two places it could be is no place at all; see the header.
  if (hay.value.indexOf(needle, first + 1) !== -1) return null

  const start = hay.offsets[first]
  // The last normalised character's original offset, +1 for a half-open end.
  // Normalisation never expands a character, so the mapping is one-to-one.
  const end = hay.offsets[first + needle.length - 1] + 1
  return { start, end }
}

/**
 * The reader's raw selection, tidied into the quote worth storing.
 *
 * Two jobs, both about the fact that a finger is not a caret:
 *
 *  1. **Snap to whole words.** Dragging a selection handle lands mid-word all
 *     the time, and storing "ther" out of "there" would mark a fragment the
 *     reader never meant and would miss the word in every other translation.
 *     The selection is widened to the word boundaries of the verse it came
 *     from, which needs the verse text — hence the first argument.
 *  2. **Drop edge punctuation.** A selection that swallows the trailing comma
 *     of "light," is stored as "light". The quote reads properly in the Journal
 *     and in the export, and it matches MORE often across translations, not
 *     fewer, since punctuation is the first thing a different translation moves.
 *
 * Returns null when nothing usable is left (an empty or punctuation-only
 * selection), which the caller treats as "no words selected".
 */
export function trimToWordBoundaries(verseText: string, raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  // A selection of nothing but punctuation is not a selection of words. Without
  // this, snapping below would GROW a stray `,"` out into the word beside it and
  // mark a word the reader never touched.
  if (!WORD_CHAR.test(collapsed)) return null

  // Widen to whole words where we can locate the selection in the verse. A
  // selection we cannot find (a different translation already on screen, text
  // normalised differently) is still usable — it just gets the edge trim only.
  let text = collapsed
  const at = verseText.indexOf(collapsed)
  if (at !== -1) {
    let start = at
    let end = at + collapsed.length
    while (start > 0 && WORD_CHAR.test(verseText[start - 1])) start--
    while (end < verseText.length && WORD_CHAR.test(verseText[end])) end++
    text = verseText.slice(start, end).replace(/\s+/g, ' ')
  }

  while (text.length > 0 && EDGE_JUNK.test(text[0])) text = text.slice(1)
  while (text.length > 0 && EDGE_JUNK.test(text[text.length - 1])) text = text.slice(0, -1)
  return text.length > 0 ? text : null
}

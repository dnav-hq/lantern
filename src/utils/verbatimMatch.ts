// The one honest extra the cross-version panel is allowed to draw:
// docs/proposals/cross-version-renderings.md §5.1.3 / §1 rule 3. When the
// BSB translators' own alternative wording appears VERBATIM in another
// translation's verse, that is a fact the reader can check by reading —
// never a computed correspondence like the phrase alignment §2 of the brief
// measured and declined (28% wrong on the easiest subset available).
//
// So this file does exactly one honest thing: find a literal substring, and
// only when it occurs EXACTLY ONCE. A repeated occurrence gives no way to
// say which one is meant, and that is an alignment question again — so it
// counts as no match, silently, the same as the ~72% of notes with no
// verbatim hit at all.

/** Where the match sits, as indices into the verse text it was found in. */
export interface VerbatimMatch {
  start: number
  end: number
}

// The same lead words FootnoteDoor.tsx's NOTE_LEAD splits on for display.
// Duplicated rather than imported: footnoteSpan.ts (the file that already
// extracts a note's alternative precisely, trimming trailing asides like "; see
// also LXX") is out of this feature's files_in_scope. Taking the WHOLE
// remainder after the lead word, instead of that precise cut, only ever makes
// the verbatim match MORE conservative — a longer needle can fail to match, it
// can never match somewhere a shorter one wouldn't.
const NOTE_LEAD = /^(?:Or|Literally|Greek|Hebrew|Aramaic)\s+/

/**
 * The wording a BSB note offers in place of the text — what CrossVersionPanel
 * checks for verbatim in KJV/NET (the brief's §5.1.3 rule). `null` when the
 * note is not a substitution this simple cut recognises (e.g. it doesn't open
 * with one of the lead words), which the panel treats as "nothing to mark",
 * not an error.
 */
export function noteAlternative(note: string): string | null {
  const lead = NOTE_LEAD.exec(note.trim())
  if (!lead) return null
  const rest = note.trim().slice(lead[0].length).trim()
  return rest || null
}

/**
 * `needle` is the wording to look for (already extracted from the note —
 * see `FootnoteDoor.tsx`'s `noteAlternative`); `haystack` is a translation's
 * verse text. Case-insensitive, since a translation may open a sentence
 * where the note's own note-case does not, but the returned span indexes
 * into `haystack` as given — callers render the ACTUAL text at that span,
 * never the needle's spelling, so casing is always the target translation's
 * own.
 */
export function findVerbatimMatch(needle: string, haystack: string): VerbatimMatch | null {
  const trimmed = needle.trim()
  if (!trimmed) return null
  const hay = haystack.toLowerCase()
  const n = trimmed.toLowerCase()
  const first = hay.indexOf(n)
  if (first === -1) return null
  if (hay.indexOf(n, first + 1) !== -1) return null
  return { start: first, end: first + trimmed.length }
}

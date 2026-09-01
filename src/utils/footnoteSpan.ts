// Where the underline STARTS.
//
// The seam (src/bible/provider.ts) gives a note's END position and never its
// beginning: a BSB marker says "a note ends here" and says nothing about the
// phrase it refers to. So the span has to be inferred, and the choice is
// settled in docs/proposals/footnotes-door.md §10a:
//
//   B — underline back approximately as many words as the note's own
//       alternative offers to replace. That is the honest claim: *this much
//       could have been said differently*.
//   A — the last word alone. The fallback, used wherever the note is a gloss
//       rather than a substitution and B has nothing to align to.
//
// Rejected there, and not to be re-litigated here: A everywhere (roughly a
// third of markers land on a function word, and "*us*" is a meaningless door
// for a note about *tabernacled*), and C, back to the clause boundary, which
// is the prettiest and the most confidently wrong — it underlines words the
// note has no opinion about.
//
// This file is pure and offline on purpose: it takes the verse text, the
// marker offset and the note, and returns character indices. Nothing here
// fetches, and nothing here knows about React.

/** One resolved underline, as indices into the verse's flattened text. */
export interface FootnoteSpan {
  /** first character of the underlined phrase */
  start: number
  /** one past its last character — the marker offset, minus trailing punctuation */
  end: number
  /** which strategy produced it, so the measurement pass can count them */
  strategy: 'A' | 'B'
}

// A note's ALTERNATIVE is what follows one of these leads. The list is
// deliberately narrower than footnotes.ts's RENDERING_LEAD: that one decides
// whether a note may be seen at all, this one decides whether a note offers a
// SUBSTITUTION we can measure. "Forms of the Hebrew *chesed*…" and "The Greek
// word…" ship, and are glosses — they replace nothing, so they fall to A.
const ALTERNATIVE_LEAD =
  /^(?:Or|Literally|Lit\.|Greek|Hebrew|Aramaic|Possibly|Probably|Perhaps)\b[:,]?\s+/

// Where an alternative stops being the alternative. A note often carries a
// SECOND alternative ("Or the Only Begotten or the Unique One") or a citation
// ("Or *not a nation*; see also LXX") — the first phrase is the one whose
// length we can trust, so everything from these on is cut.
const ALTERNATIVE_TAIL = /(?:;|\s+\(|,?\s+or\s+|\s+see\s+|\s+cited\s+|\.\s)/

// And where the OFFERED PHRASE stops inside that alternative. A comma in a
// note usually introduces the translators' aside rather than more replacement
// text — "Hebrew *Gashmu*, a variant of *Geshem*" offers one word and then
// explains it; counting the aside underlines five words of verse it has no
// opinion about. Cutting here is measured, not assumed: it is what moves
// Ezekiel 40:8 from eight words to the six the note actually offers.
const OFFERED_TAIL = /,/

// A phrase longer than this is not a phrase, it is a sentence about the verse
// — an explanation with a rendering-shaped opening. Underlining eight-plus
// words on that basis claims more than the note supports, so B declines and A
// takes it. (Measured: this fires on 1.1% of the ship set.)
const MAX_B_WORDS = 8

// Letters, digits, and the marks that live INSIDE a word — the curly
// apostrophe in "Father’s", the hyphen in "well-being". Everything else is a
// boundary.
const WORD = /[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu

// Trailing punctuation is not part of the phrase. The v14 marker in John 1
// falls after "made His dwelling among us." — INCLUDING the stop, because
// that is where the content item ended — and an underline that runs under the
// full stop reads as a typo. The apostrophe is deliberately NOT in this set:
// a possessive ("Jesus’") is part of its word.
const TRAILING = /[\s.,;:!?"”)\]—–-]+$/

// A span that OPENS on a joining word reads as a mistake — the John 1:14
// "one and only Son" note offers three words and would otherwise underline
// "*and* only Son". These four join what is on either side of them rather
// than belonging to the phrase after them, so the span takes the word before
// instead, which is one word wider and reads as English. (48 spans, 2.3%.)
// "for", "so", "that" and "yet" are deliberately NOT here: they open real
// clauses, and widening those pulled the underline across a comma.
const CONNECTIVE = /^(?:and|or|but|nor)$/i

/**
 * How many words the note offers in place of the text, or `null` when the note
 * is not a substitution and strategy B has nothing to measure.
 */
export function alternativeWordCount(note: string): number | null {
  const lead = ALTERNATIVE_LEAD.exec(note.trim())
  if (!lead) return null
  let alternative = note.trim().slice(lead[0].length)
  const tail = ALTERNATIVE_TAIL.exec(alternative)
  if (tail) alternative = alternative.slice(0, tail.index)

  // The GATE is the whole alternative: a note offering a re-punctuated
  // sentence ("Or *If it were not so, I would have told you…*") is not
  // substituting a phrase, and the last N words of the verse would be an
  // arbitrary place to underline. A falls back to the last word, which is
  // never wrong, only modest.
  const whole = alternative.match(WORD)
  if (!whole || whole.length === 0) return null
  if (whole.length > MAX_B_WORDS) return null

  // The LENGTH is the offered phrase alone.
  const offered = OFFERED_TAIL.exec(alternative)
  const words = (offered ? alternative.slice(0, offered.index) : alternative).match(WORD)
  return words && words.length > 0 ? words.length : whole.length
}

/**
 * Resolve one note's underline.
 *
 * @param text    the verse's flattened text
 * @param offset  the marker offset — where the anchored phrase ENDS
 * @param note    the translators' note, verbatim
 * @param minStart floor for the span, so two notes in one verse never overlap
 * @returns the span, or `null` when there is no word to underline (which means
 *          no door at all — never a door in an arbitrary place)
 */
export function footnoteSpan(
  text: string,
  offset: number,
  note: string,
  minStart = 0
): FootnoteSpan | null {
  const clamped = Math.max(0, Math.min(offset, text.length))
  const head = text.slice(0, clamped).replace(TRAILING, '')
  const end = head.length
  if (end <= minStart) return null

  // Word positions in the part of the verse this note can reach back over.
  const words: { start: number; end: number }[] = []
  for (const m of head.slice(minStart).matchAll(WORD)) {
    const at = minStart + (m.index ?? 0)
    words.push({ start: at, end: at + m[0].length })
  }
  if (words.length === 0) return null

  // The phrase must END on a word: if the marker sat after punctuation we have
  // already trimmed it, but a stray bracket mid-verse can still leave a gap.
  const last = words[words.length - 1]

  const wanted = alternativeWordCount(note)
  if (wanted === null) {
    return { start: last.start, end: last.end, strategy: 'A' }
  }
  // B: take the last `wanted` words. A note that offers more words than the
  // verse has left is still B — it simply reaches the start of what it can.
  const take = Math.min(wanted, words.length)
  let first = words.length - take
  const gap = first > 0 ? head.slice(words[first - 1].end, words[first].start) : 'x'
  if (CONNECTIVE.test(head.slice(words[first].start, words[first].end)) && /^\s+$/.test(gap)) {
    first -= 1
  }
  return { start: words[first].start, end: last.end, strategy: 'B' }
}

/**
 * Every underline in one verse, in reading order and guaranteed not to
 * overlap: each span is floored at the previous note's end, so a long
 * alternative can never reach back across an earlier door.
 */
export function footnoteSpans<T extends { offset: number; text: string }>(
  text: string,
  notes: readonly T[]
): (FootnoteSpan & { note: T })[] {
  const ordered = [...notes].sort((a, b) => a.offset - b.offset)
  const spans: (FootnoteSpan & { note: T })[] = []
  let floor = 0
  for (const note of ordered) {
    const span = footnoteSpan(text, note.offset, note.text, floor)
    if (!span) continue
    spans.push({ ...span, note })
    floor = span.end
  }
  return spans
}

// The verse-selection gesture, as one pure rule — world-class pass 2026-10-28,
// finding 7 ("selection and highlighting").
//
// The old rule was "tap a verse, tap another to extend": a second tap on ANY
// verse grew the range to it, and a tap inside the range cleared everything.
// Nobody arriving from another Bible app expects either; what they expect is
// a tap to toggle one verse. A contiguous range is still the only shape a
// note can anchor to, so the toggle is bounded to it:
//
//   - nothing selected          → that verse
//   - the verse next to an end  → the range grows by one
//   - the only selected verse   → cleared
//   - an end of the range       → that end drops off
//   - inside the range          → just that verse (start again there)
//   - anywhere else             → just that verse
//
// `extend` (Shift-click on desktop, or a marquee) keeps the old "grow to here"
// meaning, since that is what Shift means everywhere else.

export type VerseRange = readonly [number, number]

export function nextSelection(
  range: VerseRange | null,
  verse: number,
  extend = false
): VerseRange | null {
  if (range === null) return [verse, verse]
  const [a, b] = range
  if (extend) return [Math.min(a, verse), Math.max(b, verse)]
  if (verse === a - 1) return [verse, b]
  if (verse === b + 1) return [a, verse]
  if (verse === a && verse === b) return null
  if (verse === a) return [a + 1, b]
  if (verse === b) return [a, b - 1]
  return [verse, verse]
}

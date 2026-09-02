// How a Journal chapter row counts what is under it.
//
// A MARK IS NOT A NOTE. It is a property of a verse — a tint and a category
// name on the verse itself — and everywhere else in the product it is treated
// that way. The chapter row was the one place that disagreed: it folded marks
// into the note total, so with the kind filter set to Marks a chapter holding a
// single highlight and no writing read "1 note" (desktop sweep, finding 10).
//
// Pure and separate from JournalPage so it can be tested without rendering, per
// this repo's src/utils convention.
export function chapterCountLabel(entries: { highlight: boolean }[]): string {
  const marks = entries.filter(e => e.highlight).length
  const notes = entries.length - marks
  const part = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
  if (notes && marks) return `${part(notes, 'note')} · ${part(marks, 'mark')}`
  if (marks) return part(marks, 'mark')
  return part(notes, 'note')
}

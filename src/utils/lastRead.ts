// The reader's last position: written every time a chapter is shown, read by
// the library's "Continue reading" card. Device-level (localStorage), like the
// other reading preferences, and guarded the same way: a storage failure means
// "no history", never a crash. The key keeps the `berean.` prefix every other
// persisted key uses (see CLAUDE.md on why those are not renamed).

const KEY = 'berean.last-read'

export interface LastRead {
  bookNumber: number
  chapter: number
  /** ISO timestamp of when the chapter was last shown. */
  at: string
}

export function readLastRead(): LastRead | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastRead> | null
    if (
      !parsed ||
      typeof parsed.bookNumber !== 'number' ||
      typeof parsed.chapter !== 'number' ||
      !Number.isInteger(parsed.bookNumber) ||
      !Number.isInteger(parsed.chapter) ||
      parsed.bookNumber < 1 ||
      parsed.bookNumber > 66 ||
      parsed.chapter < 1
    ) {
      return null
    }
    return {
      bookNumber: parsed.bookNumber,
      chapter: parsed.chapter,
      at: typeof parsed.at === 'string' ? parsed.at : ''
    }
  } catch {
    return null
  }
}

export function writeLastRead(bookNumber: number, chapter: number): void {
  try {
    const value: LastRead = { bookNumber, chapter, at: new Date().toISOString() }
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

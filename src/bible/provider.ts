// BibleProvider is the scripture source seam. BSB via bible.helloao.org
// (helloao.ts) is the first implementation; KJV (kjv.ts) is the second; a
// future user-keyed ESV provider implements the same interface. A cache layer
// (cache.ts) wraps any provider — chapters are immutable, so once fetched
// they're cached forever.
export interface BibleVerseLine {
  verse: number
  text: string
}

export interface BibleProvider {
  getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]>
}

// The translation dimension threaded through getBibleVerse (service.ts) and
// the reading surfaces. Each id maps to its own BibleProvider instance in
// service.ts — the provider itself is never asked for a translation, since a
// given instance only ever serves one (see cache.ts's `translation` ctor arg).
export type TranslationId = 'BSB' | 'KJV'

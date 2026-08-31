// BibleProvider is the scripture source seam. BSB via bible.helloao.org
// (helloao.ts) is the first implementation; KJV (kjv.ts) is the second; ESV
// (esv.ts) is the third, and the first that's copyrighted — it goes through a
// server-side key proxy (supabase/functions/esv-proxy) and a size-bounded
// evicting cache (esv-cache.ts) instead of cache.ts's cache-forever layer,
// per Crossway's terms. A cache layer (cache.ts) wraps BSB/KJV — chapters are
// immutable, so once fetched they're cached forever.
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
export type TranslationId = 'BSB' | 'KJV' | 'ESV' | 'NET' | 'IRV' | 'TCV'

// The LANGUAGE a reader reads scripture in — a separate choice from which
// translation, and the one that scopes the translation switcher (see
// useBibleLanguage.ts). Deliberately ISO 639-3 codes matching helloao's own
// `language` field, so adding a language is a data change, not a type change
// with a mapping table. Note anchoring is by verse number and therefore
// language-independent: switching language never touches a note.
export type BibleLanguageId = 'eng' | 'tam'

// Loading a verse's connections, lazily — docs/proposals/connections-door.md.
//
// The counterpart of wordIndexLoader.ts for the connections door, and the only
// thing in the app that asks the seam for cross-references:
//
//   - NOTHING is fetched until a door would show. The entrance asks
//     `connectionsPresence` for a selected verse; that costs ONE chapter fetch
//     (cached forever in IndexedDB, translation-free), and a verse below the
//     salience line stops there — no verse text is fetched for a door that
//     will not open (brief §8, last acceptance criterion).
//   - A verse that clears the line then reads the connected verses' own text,
//     in the translation on screen, to type each row quote-or-echo (§4). Those
//     reads go through the chapter cache, so the cost is one chapter per
//     DISTINCT chapter among the connections, once ever.
//   - Everything is memoized as a PROMISE, so the entrance and the door opened
//     from it share one load rather than racing two.
//   - Offline: a cached chapter's door works; an uncached one resolves to
//     "no door" — never an error, never a hint (§7).
//   - THE SETTING LINE rides along (docs/proposals/setting-line.md §7.2): the
//     static bundle of section headings is asked for only once a door has
//     actually opened, in parallel with the verse texts, memoized for the app's
//     lifetime, and it never throws — a row whose destination has no line just
//     shows what it showed before.
//
// Nothing here may import a Node API — this file lives under src/ and obeys the
// pure-web rule in CLAUDE.md.
import type { BibleVerseLine, TranslationId } from '../bible/provider'
import { getBibleVerse, getChapterConnections } from '../bible/service'
import { bookByNumber } from './bibleBooks'
import {
  connectionsForVerse,
  doorOpens,
  sharedPlaces,
  sharedRun,
  type ChapterConnections,
  type ConnectionKind,
  type RawConnection
} from './connections'
import { chapterKey, loadMapPlaces } from './mapData'
import { displayPlaceName } from './mapDataLoader'
import {
  loadSettingLines,
  settingLineIn,
  type SettingLine,
  type SettingLineFile
} from './settingLine'
import { currentTranslation } from './useTranslation'

/** One row of the door, ready to render. */
export interface ConnectionRow {
  book: number
  chapter: number
  verse: number
  endVerse?: number
  /** "Romans 4:3" or "Galatians 3:6–14" — the label the row shows. */
  label: string
  kind: ConnectionKind
  /**
   * The connected passage's own text in the translation on screen — the WHOLE
   * range for a ranged row, joined with spaces, so `shared` and `places` can
   * point anywhere in it. Null where it could not be read — the row still
   * exists, as a bare reference, and is an echo since nothing was compared.
   */
  text: string | null
  /** The lit run inside `text`, quote rows only. */
  shared: [number, number] | null
  /** The same run inside the held verse's text, so the source can show it too. */
  sharedInSource: [number, number] | null
  /**
   * Geocoded places of the HELD verse's chapter that this passage names too
   * (docs/proposals/dive-in-2.md): the marks that say "names Damascus too"
   * without a word of relation. Empty where the chapter has no places, or the
   * texts share none.
   */
  places: string[]
  /**
   * Where this row lands: the destination's own section heading, gated by
   * reach (docs/proposals/setting-line.md §4). Null where the file has nothing
   * to say about the verse, or is not loaded — a row without a line is exactly
   * the row we shipped before.
   */
  setting: SettingLine | null
}

export interface VerseConnections {
  /** The dataset's own order, unchanged. */
  rows: ConnectionRow[]
  quotes: number
  echoes: number
  /** The strongest connection's score — the salience fact, never shown. */
  top: number
  /** True where the door opened as a parallel account rather than on score. */
  parallel: boolean
}

/** What the loader needs from outside. Injected so tests need no network. */
export interface ConnectionsSources {
  chapterConnections(book: number, chapter: number): Promise<ChapterConnections>
  chapterText(
    book: number,
    chapter: number,
    translation: TranslationId
  ): Promise<BibleVerseLine[] | null>
  /**
   * The setting-line bundle. Lazy on purpose: it is asked for only once a door
   * has actually opened (setting-line.md §7.2), never with the chapter, and it
   * never throws — no lines is a quieter door, not an error.
   */
  settingLines?(): Promise<SettingLineFile | null>
  /**
   * The names of the geocoded places a chapter carries, as the text writes
   * them. Asked for the held verse's chapter only, to mark shared places and
   * to open a door on a parallel account; never throws — no places is simply
   * no marks.
   */
  chapterPlaces?(book: number, chapter: number): Promise<string[]>
}

const defaultSources: ConnectionsSources = {
  chapterConnections: getChapterConnections,
  async chapterText(book, chapter, translation) {
    const name = bookByNumber(book)?.name
    if (!name) return null
    const passage = await getBibleVerse(`${name} ${chapter}`, translation).catch(() => null)
    return passage?.verses ?? null
  },
  settingLines: () => loadSettingLines(),
  async chapterPlaces(book, chapter) {
    const bundle = await loadMapPlaces()
    const names = (bundle.ch[chapterKey(book, chapter)] ?? [])
      .map(i => bundle.p[i]?.n)
      .filter((n): n is string => typeof n === 'string')
      .map(displayPlaceName)
    return [...new Set(names)]
  }
}

export function connectionLabel(c: RawConnection): string {
  const name = bookByNumber(c.book)?.name ?? `Book ${c.book}`
  const range = c.endVerse !== undefined && c.endVerse !== c.verse ? `–${c.endVerse}` : ''
  return `${name} ${c.chapter}:${c.verse}${range}`
}

export interface ConnectionsLoader {
  /**
   * The verse's outgoing connections, typed against `translation`'s text — or
   * null where the verse has no door (below the salience line, no
   * connections, or the chapter could not be fetched).
   */
  verse(
    book: number,
    chapter: number,
    verse: number,
    translation: TranslationId
  ): Promise<VerseConnections | null>
}

export function createConnectionsLoader(
  sources: ConnectionsSources = defaultSources
): ConnectionsLoader {
  const chapters = new Map<string, Promise<ChapterConnections>>()
  const verses = new Map<string, Promise<VerseConnections | null>>()

  const chapterConnections = (book: number, chapter: number): Promise<ChapterConnections> => {
    const key = `${book}/${chapter}`
    let p = chapters.get(key)
    if (!p) {
      p = sources.chapterConnections(book, chapter)
      // A failed fetch (offline, provider down) is not remembered: the next
      // selection tries again, and meanwhile the verse simply has no door.
      p.catch(() => chapters.delete(key))
      chapters.set(key, p)
    }
    return p
  }

  const build = async (
    book: number,
    chapter: number,
    verse: number,
    translation: TranslationId
  ): Promise<VerseConnections | null | undefined> => {
    let all: ChapterConnections
    try {
      all = await chapterConnections(book, chapter)
    } catch {
      // Undefined, not null: "could not be fetched" is not memoized, so the
      // next selection tries again once the reader is back online.
      return undefined
    }
    const raw = connectionsForVerse(all, verse)
    if (raw.length === 0) return null

    // The chapter's own places, once: they mark shared names on every row, and
    // they are the measure for a parallel account, which can open a door the
    // score alone would keep shut. Never a reason to fail.
    const placesPromise = (sources.chapterPlaces ?? defaultSources.chapterPlaces!)(
      book,
      chapter
    ).catch((): string[] => [])

    let parallel = false
    if (!doorOpens(raw)) {
      // Below the line. One more question before giving up: does the strongest
      // row name a place this chapter names? That costs the chapter's places
      // and ONE chapter of text, both cached, and it is what lets Galatians
      // 1:17 open on Acts 9 (docs/proposals/dive-in-2.md).
      const names = await placesPromise
      if (names.length === 0) return null
      const top = raw[0]
      const [held, other] = await Promise.all([
        sources.chapterText(book, chapter, translation).catch(() => null),
        sources.chapterText(top.book, top.chapter, translation).catch(() => null)
      ])
      const source = held?.find(line => line.verse === verse)?.text ?? null
      const last = top.endVerse ?? top.verse
      const text =
        other
          ?.filter(line => line.verse >= top.verse && line.verse <= last)
          .map(line => line.text)
          .join(' ') || null
      if (source === null || text === null) return null
      parallel = sharedPlaces(names, source, text).length > 0
      if (!parallel) return null
    }

    // Only now — the door is real. One static file, once per app lifetime,
    // fetched alongside the verse texts rather than before them.
    const settingsPromise = (sources.settingLines ?? defaultSources.settingLines!)().catch(
      () => null
    )

    // The held verse's own words, and each connected chapter once.
    const wanted = new Map<string, [number, number]>()
    wanted.set(`${book}/${chapter}`, [book, chapter])
    for (const c of raw) wanted.set(`${c.book}/${c.chapter}`, [c.book, c.chapter])
    const texts = new Map<string, BibleVerseLine[] | null>()
    const entries = [...wanted.entries()]
    for (let i = 0; i < entries.length; i += 4) {
      const batch = await Promise.all(
        entries.slice(i, i + 4).map(async ([key, [b, ch]]) => {
          const lines = await sources.chapterText(b, ch, translation).catch(() => null)
          return [key, lines] as const
        })
      )
      for (const [key, lines] of batch) texts.set(key, lines)
    }
    const lineText = (b: number, ch: number, v: number): string | null =>
      texts.get(`${b}/${ch}`)?.find(line => line.verse === v)?.text ?? null

    const settings = await settingsPromise
    const placeNames = await placesPromise
    const source = lineText(book, chapter, verse)
    let quotes = 0
    const rows: ConnectionRow[] = raw.map(c => {
      // A ranged row is compared and marked against its WHOLE range, so a
      // place named in verse 22 of Acts 9:20-25 still counts.
      const last = c.endVerse ?? c.verse
      const text = lineText(c.book, c.chapter, c.verse)
      const whole =
        text === null
          ? null
          : Array.from({ length: last - c.verse + 1 }, (_, i) =>
              lineText(c.book, c.chapter, c.verse + i)
            )
              .filter((t): t is string => t !== null)
              .join(' ')
      const run = source !== null && whole !== null ? sharedRun(source, whole) : null
      if (run) quotes += 1
      return {
        book: c.book,
        chapter: c.chapter,
        verse: c.verse,
        ...(c.endVerse !== undefined ? { endVerse: c.endVerse } : {}),
        label: connectionLabel(c),
        kind: run ? 'quotes' : 'echoes',
        text: whole,
        shared: run ? run.target : null,
        sharedInSource: run ? run.source : null,
        places: source !== null && whole !== null ? sharedPlaces(placeNames, source, whole) : [],
        setting: settingLineIn(settings, c.book, c.chapter, c.verse)
      }
    })
    return { rows, quotes, echoes: rows.length - quotes, top: raw[0]?.score ?? 0, parallel }
  }

  return {
    verse(book, chapter, verse, translation) {
      const key = `${book}/${chapter}/${verse}/${translation}`
      let p = verses.get(key)
      if (!p) {
        p = build(book, chapter, verse, translation).then(found => {
          if (found === undefined) verses.delete(key)
          return found ?? null
        })
        verses.set(key, p)
      }
      return p
    }
  }
}

/** The app's one loader. A module singleton so its memoization is app-wide. */
export const connectionsLoader = createConnectionsLoader()

/**
 * Does this verse have a connections door, and what would the doorway say?
 *
 * The seam the doorways row is built against: null where the verse has no
 * door (its strongest connection scores under the line — brief §5 — or
 * nothing could be fetched), otherwise the counts. Typed against the
 * translation currently on screen, so the quote/echo split matches what the
 * door will show. Never throws.
 */
export async function connectionsPresence(
  book: number,
  chapter: number,
  verse: number
): Promise<{ count: number; quotes: number; echoes: number; top: number } | null> {
  try {
    const found = await connectionsLoader.verse(book, chapter, verse, currentTranslation())
    if (!found) return null
    return { count: found.rows.length, quotes: found.quotes, echoes: found.echoes, top: found.top }
  } catch {
    return null
  }
}

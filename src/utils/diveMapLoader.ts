// What a chapter has to show on the dive-in map card, loaded once per chapter
// — docs/proposals/dive-in-2.md.
//
// The card and the entrance line both ask this: the entrance to know whether
// the chapter has a journey or places at all (and what to say), the card to
// draw them. It costs the journeys table (18 KB) and the place bundle (145 KB,
// memoized for the app's lifetime in mapData.ts) — never the artwork, the sea
// mask or the relief raster, which the card fetches only when it mounts. The
// route is already FOLDED here (foldRegionStops), so every consumer sees the
// same legs. Memoized as a promise per chapter; a failed load is forgotten so
// the next ask tries again, and meanwhile the chapter simply has no map.
//
// Nothing here may import a Node API — this file lives under src/ and obeys
// the pure-web rule in CLAUDE.md.
import {
  chapterKey,
  loadMapJourneys,
  loadMapPlaces,
  projectToView,
  verseKey,
  type MapPlaceBundle
} from './mapData'
import {
  buildJourneyRoute,
  buildViewModel,
  displayPlaceName,
  findJourneyForChapter,
  foldRegionStops,
  indexMarkersByPlaceId,
  type JourneyRoute,
  type PlaceMarker
} from './mapDataLoader'
import { BEARING_NAMES, GREAT_SEA_LONLAT, type XY } from './diveMap'

/** One labelled point on the card: a chapter place, with same-point places merged. */
export interface CardPlace extends XY {
  name: string
  type: string
  /** The bundle indexes merged into this point, for `placesForVerse`. */
  indexes: number[]
  /** Named in the verse the reader is holding (set by `placesForVerse`). */
  inVerse: boolean
}

export interface ChapterMap {
  book: number
  chapter: number
  /** The chapter's geocoded places, one per point, same-point names joined. */
  places: CardPlace[]
  /** The names of every geocoded place the chapter carries, as the text writes them. */
  placeNames: string[]
  /** The folded journey through this chapter, or null. */
  route: JourneyRoute | null
  /** Fixed bearings that are not already the chapter's own places. */
  bearings: (XY & { name: string })[]
  /** The Great Sea's label position, in view units. */
  sea: XY
  /** Bundle indexes of the chapter's places, keyed by verse, for `inVerse`. */
  versePlaces: Record<number, number[]>
}

const chapters = new Map<string, Promise<ChapterMap | null>>()
let modelPromise: Promise<{
  bundle: MapPlaceBundle
  markers: PlaceMarker[]
  byIndex: Map<number, PlaceMarker>
  byId: Map<string, PlaceMarker>
}> | null = null

function model(): Promise<{
  bundle: MapPlaceBundle
  markers: PlaceMarker[]
  byIndex: Map<number, PlaceMarker>
  byId: Map<string, PlaceMarker>
}> {
  if (!modelPromise) {
    modelPromise = loadMapPlaces()
      .then(bundle => {
        const { markers } = buildViewModel(bundle)
        return {
          bundle,
          markers,
          byIndex: new Map(markers.map(m => [m.index, m])),
          byId: indexMarkersByPlaceId(markers, bundle)
        }
      })
      .catch(err => {
        modelPromise = null
        throw err
      })
  }
  return modelPromise
}

/**
 * Same-point places collapse to one label: a settlement wins over a region
 * ("Syria" sits on Damascus), two regions join ("Chaldea, Ur"). The label is
 * still every name the data gives that point, never an invention.
 */
export function mergeSamePoint(markers: readonly PlaceMarker[]): CardPlace[] {
  const byPoint = new Map<string, CardPlace>()
  for (const m of markers) {
    const key = `${m.point.x},${m.point.y}`
    const name = displayPlaceName(m.name)
    const cur = byPoint.get(key)
    if (!cur) {
      byPoint.set(key, {
        x: m.point.x,
        y: m.point.y,
        name,
        type: m.type,
        indexes: [m.index],
        inVerse: false
      })
    } else if (cur.type === 'region' && m.type !== 'region') {
      byPoint.set(key, { ...cur, name, type: m.type, indexes: [...cur.indexes, m.index] })
    } else if (cur.type === 'region' && m.type === 'region') {
      cur.name = `${cur.name}, ${name}`
      cur.indexes.push(m.index)
    } else cur.indexes.push(m.index)
  }
  return [...byPoint.values()]
}

async function build(book: number, chapter: number): Promise<ChapterMap | null> {
  const [journeys, { bundle, byIndex, byId }] = await Promise.all([loadMapJourneys(), model()])
  const indexes = bundle.ch[chapterKey(book, chapter)] ?? []
  const markers = indexes.map(i => byIndex.get(i)).filter((m): m is PlaceMarker => !!m)
  const journey = findJourneyForChapter(journeys, book, chapter)
  const raw = journey ? buildJourneyRoute(journey, journeys.gaps, id => byId.get(id)) : null
  const route = raw ? foldRegionStops(raw, stop => byIndex.get(stop.index)?.type) : null
  if (markers.length === 0 && !route) return null

  const versePlaces: Record<number, number[]> = {}
  for (const [key, list] of Object.entries(bundle.vs)) {
    // VerseKey is BBCCCVVV; only this chapter's keys matter here.
    if (key.startsWith(verseKey(book, chapter, 0).slice(0, 5))) {
      versePlaces[Number(key.slice(5))] = list
    }
  }
  const own = new Set(markers.map(m => `${m.point.x},${m.point.y}`))
  const bearings = BEARING_NAMES.map(n => byIndex.get(bundle.p.findIndex(p => p.n === n)))
    .filter((m): m is PlaceMarker => !!m && !own.has(`${m.point.x},${m.point.y}`))
    .map(m => ({ x: m.point.x, y: m.point.y, name: displayPlaceName(m.name) }))
  const [sx, sy] = projectToView(GREAT_SEA_LONLAT[0], GREAT_SEA_LONLAT[1])
  return {
    book,
    chapter,
    places: mergeSamePoint(markers),
    placeNames: [...new Set(markers.map(m => displayPlaceName(m.name)))],
    route,
    bearings,
    sea: { x: sx, y: sy },
    versePlaces
  }
}

/** The chapter's map, or null where it has neither places nor a journey. Never throws. */
export function loadChapterMap(book: number, chapter: number): Promise<ChapterMap | null> {
  const key = `${book}/${chapter}`
  let p = chapters.get(key)
  if (!p) {
    p = build(book, chapter).catch(() => {
      chapters.delete(key)
      return null
    })
    chapters.set(key, p)
  }
  return p
}

/**
 * Does THIS verse earn the map? Not every verse of a chapter with places
 * does (Dennis, 2026-09-17: Ecclesiastes 1 showed Jerusalem under all
 * eighteen verses, and the one verse with a connection was lost among them).
 * The map is on the page only where the verse itself names a geocoded place,
 * or the verse is one a journey leg is cited from — both facts of the data,
 * never a guess. A verse with connections but no place of its own gets its
 * rows and no map.
 */
export function verseHasMap(map: ChapterMap, verse: number): boolean {
  if ((map.versePlaces[verse]?.length ?? 0) > 0) return true
  if (!map.route) return false
  return map.route.legs.some(leg => {
    if (!leg.ref) return false
    const span = citationSpan(leg.ref)
    return span !== null && span.chapter === map.chapter && verse >= span.from && verse <= span.to
  })
}

/** "Galatians 1:17-18" → chapter 1, verses 17 to 18. Null where unreadable. */
export function citationSpan(ref: string): { chapter: number; from: number; to: number } | null {
  const m = /(\d+):(\d+)(?:-(\d+))?\s*$/.exec(ref)
  if (!m) return null
  const from = Number(m[2])
  return {
    chapter: Number(m[1]),
    from,
    to: Number(m[3] ?? m[2]) >= from ? Number(m[3] ?? m[2]) : from
  }
}

/** The card's places with `inVerse` set for one verse. */
export function placesForVerse(map: ChapterMap, verse: number): CardPlace[] {
  const here = new Set(map.versePlaces[verse] ?? [])
  if (here.size === 0) return map.places
  return map.places.map(p => ({ ...p, inVerse: p.indexes.some(i => here.has(i)) }))
}

/** Test seam. */
export function resetChapterMaps(): void {
  chapters.clear()
  modelPromise = null
}

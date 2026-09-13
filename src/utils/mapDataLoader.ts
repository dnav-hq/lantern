// The Bible map — turning the shipped bundles into something drawable.
//
// Slice 2 of docs/proposals/bible-map-v1.md. `mapData.ts` owns the vocabulary
// and the projection (slice 1); this file owns the render view-model built on
// top of it, and it is deliberately PURE so the fiddly parts — which places get
// a label when 1,342 of them overlap, what "contested" looks like as geometry —
// are under test rather than tangled into JSX.
//
// Nothing here imports React or touches the DOM.
import {
  chapterKey,
  confidenceBand,
  isContested,
  projectToView,
  type ChapterKey,
  type ConfidenceBand,
  type Journey,
  type JourneyBundle,
  type JourneyGap,
  type MapPlace,
  type MapPlaceBundle,
  type VerseKey
} from './mapData'
import { findBookByAlias } from './bibleBooks'

/** One candidate location, already projected into view-box coordinates. */
export interface MarkerPoint {
  x: number
  y: number
  /** OpenBible `time_total`, 0–1000, for this candidate. */
  score: number
  /** The modern location's name, where the dataset gives one. */
  modern?: string
  /**
   * Whether a hairline should tie this rival back to the best candidate. False
   * for a rival on the other side of the map — a few places (Tarshish, Ophir)
   * have candidates a continent apart, and drawing those ties turns the map
   * into a starburst that reads like trade routes. The rival is still DRAWN
   * either way; only the tether is dropped.
   */
  linked?: boolean
}

/** A place as the map draws it: a best point, its rivals, and its honesty band. */
export interface PlaceMarker {
  /** Index into the bundle's `p` array — a stable React key. */
  index: number
  name: string
  type: string
  band: ConfidenceBand
  contested: boolean
  /** Best candidate, already projected. */
  point: MarkerPoint
  /** The competing candidates, best first, projected. Empty unless contested. */
  alternatives: MarkerPoint[]
  /** Best candidate's score, 0–1000. */
  score: number
  /**
   * How many verses mention the place — its weight in the text, which is what
   * decides who gets a label when zoomed out and what a tap into a pile means.
   * 0 when the view model was built without the bundle's verse index.
   */
  references: number
}

/**
 * A place nobody can locate. These are NOT markers and must never be drawn as
 * if they were somewhere — brief section 3.3 rule 3. There are exactly 7 of them and
 * they are listed, not plotted.
 */
export interface UnlocatedPlace {
  index: number
  name: string
  type: string
}

export interface MapViewModel {
  markers: PlaceMarker[]
  unlocated: UnlocatedPlace[]
  /** How many places sit in each confidence band — the legend's own evidence. */
  counts: Record<ConfidenceBand, number>
}

/**
 * How far apart, in view-box units, two candidates can be and still be tied
 * together by a hairline. The view box is 1,000 units across 50° of longitude,
 * so 60 is roughly 3° — the scale at which a disagreement is about WHICH TELL,
 * which is the disagreement worth drawing as one.
 */
export const MAX_LINK_DISTANCE = 60

/**
 * Project every place in the bundle once. The projection is `projectToView`
 * from mapData.ts — the SAME function the build script ran over the Natural
 * Earth artwork, which is the only reason the markers land on their coastlines.
 */
export function buildViewModel(
  bundle: Pick<MapPlaceBundle, 'p'> & Partial<Pick<MapPlaceBundle, 'vs'>>,
  maxLinkDistance = MAX_LINK_DISTANCE
): MapViewModel {
  const references = countVersesByPlace(bundle.vs ?? {})
  const markers: PlaceMarker[] = []
  const unlocated: UnlocatedPlace[] = []
  const counts: Record<ConfidenceBand, number> = {
    settled: 0,
    high: 0,
    moderate: 0,
    low: 0,
    unknown: 0
  }

  bundle.p.forEach((place: MapPlace, index) => {
    const band = confidenceBand(place)
    counts[band] += 1
    const best = place.c[0]
    if (!best) {
      unlocated.push({ index, name: place.n, type: place.t })
      return
    }
    const point = toPoint(best.ll, best.s, best.m)
    markers.push({
      index,
      name: place.n,
      type: place.t,
      band,
      contested: isContested(place),
      point,
      alternatives: place.c.slice(1).map(c => {
        const alt = toPoint(c.ll, c.s, c.m)
        alt.linked = Math.hypot(alt.x - point.x, alt.y - point.y) <= maxLinkDistance
        return alt
      }),
      score: best.s,
      references: references.get(index) ?? 0
    })
  })

  return { markers, unlocated, counts }
}

function toPoint(ll: [number, number], score: number, modern?: string): MarkerPoint {
  const [x, y] = projectToView(ll[0], ll[1])
  return { x, y, score, modern }
}

/** A label the map decided it has room for. */
export interface PlaceLabel {
  index: number
  name: string
  x: number
  y: number
}

export interface LabelOptions {
  /** Approximate glyph width in view-box units, for the collision box. */
  charWidth?: number
  /** Approximate line height in view-box units. */
  lineHeight?: number
  /** Gap between the marker and the start of its text. */
  offsetX?: number
  /** Hard cap on labels drawn, to keep the SVG small. */
  limit?: number
}

/**
 * Greedy label decluttering (brief section 4.4). With 1,342 places every label
 * would overlap, so labels are awarded most-referenced-first — Jerusalem before
 * a village named once — and a label is dropped when its box hits one already
 * placed. Among places the text leans on equally, scholarship's confidence
 * decides, so the decluttering still doubles as a confidence cue.
 *
 * Ties break on name so the output is deterministic across runs and machines.
 */
export function selectLabels(markers: PlaceMarker[], options: LabelOptions = {}): PlaceLabel[] {
  const charWidth = options.charWidth ?? 3.1
  const lineHeight = options.lineHeight ?? 8
  const offsetX = options.offsetX ?? 4.5
  const limit = options.limit ?? Infinity

  const ranked = [...markers].sort(
    (a, b) => b.references - a.references || b.score - a.score || a.name.localeCompare(b.name)
  )
  const taken: [number, number, number, number][] = []
  const labels: PlaceLabel[] = []

  for (const marker of ranked) {
    if (labels.length >= limit) break
    const x = marker.point.x + offsetX
    const y = marker.point.y
    const box: [number, number, number, number] = [
      x,
      y - lineHeight / 2,
      x + marker.name.length * charWidth,
      y + lineHeight / 2
    ]
    if (taken.some(t => overlaps(t, box))) continue
    taken.push(box)
    labels.push({ index: marker.index, name: marker.name, x, y })
  }

  return labels
}

function overlaps(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
}

/** Human wording for a band, used by the legend and by each marker's `<title>`. */
export const BAND_LABEL: Record<ConfidenceBand, string> = {
  settled: 'Undisputed',
  high: 'High confidence',
  moderate: 'Moderate confidence',
  low: 'Low confidence',
  unknown: 'Location unknown'
}

/**
 * The accessible name for one marker. Confidence has to be conveyable
 * non-visually (brief section 3.3 rule 1), and in SVG that is a `<title>`.
 */
export function describeMarker(marker: PlaceMarker): string {
  const parts = [`${marker.name} — ${BAND_LABEL[marker.band]} (${marker.score}/1000)`]
  if (marker.point.modern) parts.push(`identified as ${marker.point.modern}`)
  if (marker.contested) {
    parts.push(
      `${marker.alternatives.length} competing location${marker.alternatives.length === 1 ? '' : 's'} also proposed`
    )
  }
  return parts.join('; ')
}

/**
 * How many verses mention each place, keyed by its index into the bundle's `p`
 * array. Inverts the bundle's verse → places index once; the place card reads
 * it, and it is the number a reader most wants beside a name ("Bethel: 66
 * verses") because it says how much the text leans on the place.
 */
export function countVersesByPlace(vs: Record<VerseKey, number[]>): Map<number, number> {
  const counts = new Map<number, number>()
  for (const indices of Object.values(vs)) {
    for (const index of indices) counts.set(index, (counts.get(index) ?? 0) + 1)
  }
  return counts
}

/**
 * The marker a tap at `point` (artwork units) means, or null if none is within
 * `radius` (also artwork units — the caller converts a finger-sized pixel
 * radius at the current zoom). Any distance under `tolerance` counts as zero,
 * and a dead heat goes to the place the text mentions most, then to the
 * better-attested one. That is for the Judean pile, where "the Angle" of
 * Nehemiah's wall is geocoded on top of Jerusalem and Ramah and Mozah sit a
 * pixel either side of it: a tap there means Jerusalem. Zoom in until they
 * separate and a tap on the village picks the village.
 */
export function pickMarker(
  markers: PlaceMarker[],
  point: { x: number; y: number },
  radius: number,
  tolerance = 0
): PlaceMarker | null {
  let best: PlaceMarker | null = null
  let bestDistance = Infinity
  for (const marker of markers) {
    const d = Math.hypot(marker.point.x - point.x, marker.point.y - point.y)
    if (d > radius) continue
    const effective = Math.max(d, tolerance)
    if (
      effective < bestDistance ||
      (effective === bestDistance &&
        best &&
        (marker.references > best.references ||
          (marker.references === best.references && marker.score > best.score)))
    ) {
      best = marker
      bestDistance = effective
    }
  }
  return best
}

/* ═══ Journeys — slice 5 (docs/proposals/map-in-the-story.md §2.2) ═════════
   The map's story layer. A journey arrives as a hand-authored list of legs
   plus a separate list of GAPS (mapData.ts), and the map needs one ordered
   route: stops numbered in reading order, each leg either stated by a verse
   or silent-and-therefore-dotted. That ordering is pure arithmetic over the
   data and lives here, under test, rather than in the component — the same
   split slice 2 made for labels. */

/** One arrival, in reading order. A revisited place is TWO stops, not one. */
export interface JourneyStop {
  /** 1-based position in the route — the number drawn on the map. */
  order: number
  /** The place id from the journeys file, e.g. `damascus`. */
  id: string
  /** The place's name for a route label (OpenBible's suffix dropped). */
  name: string
  /** Index into the bundle's `p` — the same key every marker already uses. */
  index: number
  x: number
  y: number
}

/** One drawn leg. `silent` is a gap: dotted, and it carries its own reason. */
export interface RouteLeg {
  from: JourneyStop
  to: JourneyStop
  /** The verse that states this move; null for a gap. */
  ref: string | null
  /** Why the text is silent here; null for a stated leg. */
  note: string | null
  silent: boolean
}

export interface JourneyRoute {
  id: string
  title: string
  source: string
  stops: JourneyStop[]
  legs: RouteLeg[]
  /**
   * Place ids the bundle cannot locate. Named, never plotted — brief §3's rule
   * that a journey through an unlocatable place must say so rather than
   * quietly skip it. None of the thirteen journeys hit this today.
   */
  unlocated: string[]
}

/** OpenBible disambiguates same-named records with a trailing number ("Arabia
 *  2", "Syria 2"). On a route drawn with NUMBERED stops that suffix reads as a
 *  stop number, so the route label drops it; the place card, the marker's
 *  `<title>` and the rest of the map keep the full, unambiguous name. */
export function displayPlaceName(name: string): string {
  return name.replace(/\s+\d+$/, '')
}

/** Place id (the url-slug half of `sl`) → its marker. */
export function indexMarkersByPlaceId(
  markers: PlaceMarker[],
  bundle: Pick<MapPlaceBundle, 'p'>
): Map<string, PlaceMarker> {
  const byId = new Map<string, PlaceMarker>()
  for (const marker of markers) {
    const sl = bundle.p[marker.index]?.sl
    if (!sl) continue
    const slash = sl.indexOf('/')
    byId.set(slash === -1 ? sl : sl.slice(slash + 1), marker)
  }
  return byId
}

/**
 * The journey as the map draws it: legs in reading order, with each GAP spliced
 * back into the position it belongs to — between the leg that ends where it
 * starts and the leg that resumes where it ends, or after the last leg when the
 * text simply stops (Paul's fourteen silent years before Jerusalem again).
 *
 * A discontinuity with NO gap record is still drawn dotted rather than as a
 * confident line: the data would be saying the route jumps and giving no verse
 * for it, and the one thing this map must never do is draw that as fact.
 */
export function buildJourneyRoute(
  journey: Journey,
  gaps: JourneyGap[],
  lookup: (placeId: string) => PlaceMarker | undefined
): JourneyRoute | null {
  const mine = gaps.filter(g => g.journey === journey.id)
  const spent = new Set<JourneyGap>()
  const take = (from: string, to?: string): JourneyGap | undefined => {
    const gap = mine.find(
      g => !spent.has(g) && g.from === from && (to === undefined || g.to === to)
    )
    if (gap) spent.add(gap)
    return gap
  }

  interface Transition {
    from: string
    to: string
    ref: string | null
    note: string | null
    silent: boolean
  }
  const transitions: Transition[] = []
  journey.legs.forEach((leg, i) => {
    const previous = i > 0 ? journey.legs[i - 1].to : null
    if (previous !== null && previous !== leg.from) {
      const gap = take(previous, leg.from)
      transitions.push({
        from: previous,
        to: leg.from,
        ref: null,
        note: gap?.note ?? null,
        silent: true
      })
    }
    transitions.push({ from: leg.from, to: leg.to, ref: leg.ref, note: null, silent: false })
  })

  // A trailing gap (or a chain of them): the text names one more destination
  // and nothing about getting there.
  let tail = journey.legs[journey.legs.length - 1]?.to
  for (;;) {
    if (!tail) break
    const gap = take(tail)
    if (!gap) break
    transitions.push({ from: gap.from, to: gap.to, ref: null, note: gap.note, silent: true })
    tail = gap.to
  }

  const stops: JourneyStop[] = []
  const legs: RouteLeg[] = []
  const unlocated: string[] = []
  const arrive = (id: string): JourneyStop | null => {
    const marker = lookup(id)
    if (!marker) {
      if (!unlocated.includes(id)) unlocated.push(id)
      return null
    }
    const stop: JourneyStop = {
      order: stops.length + 1,
      id,
      name: displayPlaceName(marker.name),
      index: marker.index,
      x: marker.point.x,
      y: marker.point.y
    }
    stops.push(stop)
    return stop
  }

  let head: JourneyStop | null = null
  for (const t of transitions) {
    const from: JourneyStop | null = head && head.id === t.from ? head : arrive(t.from)
    if (!from) {
      head = null
      continue
    }
    const to = arrive(t.to)
    if (!to) {
      head = from
      continue
    }
    legs.push({ from, to, ref: t.ref, note: t.note, silent: t.silent })
    head = to
  }

  if (legs.length === 0) return null
  return { id: journey.id, title: journey.title, source: journey.source, stops, legs, unlocated }
}

/** A route label, already placed. `anchor` is the SVG `text-anchor`. */
export interface JourneyLabel {
  /** The place's bundle index — a stable React key, one per place drawn. */
  index: number
  name: string
  x: number
  y: number
  anchor: 'start' | 'end'
}

/**
 * Every stop gets a name. This is NOT `selectLabels`: that one is a budget for
 * 1,342 competing places and DROPS the losers, which is exactly wrong for five
 * stops the reader is being asked to follow. Here a label that collides moves —
 * left of its dot, then above, then below — and is only allowed to overlap when
 * every placement does, which is what happens when two stops share a coordinate
 * (OpenBible puts the region "Syria" on Damascus). A revisited place is
 * labelled once, at its first arrival.
 */
export function placeJourneyLabels(
  stops: JourneyStop[],
  options: LabelOptions & { lineGap?: number } = {}
): JourneyLabel[] {
  const charWidth = options.charWidth ?? 3.1
  const lineHeight = options.lineHeight ?? 8
  const offsetX = options.offsetX ?? 4.5
  const lineGap = options.lineGap ?? lineHeight
  const taken: [number, number, number, number][] = []
  const labels: JourneyLabel[] = []
  const seen = new Set<number>()

  for (const stop of stops) {
    if (seen.has(stop.index)) continue
    seen.add(stop.index)
    const width = stop.name.length * charWidth
    const candidates: { x: number; y: number; anchor: 'start' | 'end' }[] = []
    for (const dy of [0, -lineGap, lineGap, -2 * lineGap, 2 * lineGap]) {
      candidates.push({ x: stop.x + offsetX, y: stop.y + dy, anchor: 'start' })
      candidates.push({ x: stop.x - offsetX, y: stop.y + dy, anchor: 'end' })
    }
    const box = (c: { x: number; y: number; anchor: 'start' | 'end' }) =>
      [
        c.anchor === 'start' ? c.x : c.x - width,
        c.y - lineHeight / 2,
        c.anchor === 'start' ? c.x + width : c.x,
        c.y + lineHeight / 2
      ] as [number, number, number, number]
    const chosen = candidates.find(c => !taken.some(t => overlaps(t, box(c)))) ?? candidates[0]
    taken.push(box(chosen))
    labels.push({ index: stop.index, name: stop.name, ...chosen })
  }

  return labels
}

/**
 * Which chapters a journey belongs to, as `chapterKey`s. Read from the
 * journey's own `source` range and from every leg's citation, so a journey is
 * found from any chapter it actually travels through — no new data, and no
 * second list to keep in step with the first.
 */
export function journeyChapters(journey: Journey): Set<ChapterKey> {
  const keys = new Set<ChapterKey>()
  for (const key of referenceChapters(journey.source)) keys.add(key)
  for (const leg of journey.legs) {
    for (const key of referenceChapters(leg.ref)) keys.add(key)
  }
  return keys
}

const REFERENCE_RE =
  /^([1-3]?\s*[A-Za-z][A-Za-z.\s]*?)\s+(\d+):(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?$/
const CHAPTER_ONLY_RE = /^(\d+):(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?$/

/**
 * "Galatians 1:15-2:1" → 48001, 48002. Handles the shapes the journeys file
 * actually uses: a single verse, a range inside one chapter, a range across
 * chapters, and several parts separated by `;` where a later part may drop the
 * book name ("Luke 9:51; 17:11-19:41").
 */
export function referenceChapters(reference: string): ChapterKey[] {
  const keys: ChapterKey[] = []
  let book: number | null = null
  for (const part of reference.split(';')) {
    const text = part.trim()
    if (!text) continue
    let first = 0
    let last = 0
    const full = REFERENCE_RE.exec(text)
    if (full) {
      const found = findBookByAlias(full[1].replace(/\s+/g, ' ').trim())
      if (!found) continue
      book = found.number
      first = Number(full[2])
      last = full[4] ? Number(full[4]) : first
    } else {
      const bare = CHAPTER_ONLY_RE.exec(text)
      if (!bare || book === null) continue
      first = Number(bare[1])
      last = bare[3] ? Number(bare[3]) : first
    }
    if (book === null) continue
    for (let chapter = first; chapter <= last; chapter++) keys.push(chapterKey(book, chapter))
  }
  return keys
}

/** The journey a chapter is part of, or null. First match wins; the table is
 *  hand-authored and no two journeys share a chapter today. */
export function findJourneyForChapter(
  bundle: Pick<JourneyBundle, 'journeys'>,
  book: number,
  chapter: number
): Journey | null {
  const key = chapterKey(book, chapter)
  return bundle.journeys.find(journey => journeyChapters(journey).has(key)) ?? null
}

/**
 * The one quiet line the connections door shows for a chapter with a journey.
 * "Paul: Damascus, Arabia and Jerusalem" → "Follow Paul’s route"; a title
 * without a leading subject ("The Exodus, station by station") falls back to
 * the plain form rather than inventing a possessive.
 */
export function journeyDoorLabel(journey: Pick<Journey, 'title'>): string {
  const subject = /^([A-Z][A-Za-z]+):/.exec(journey.title)
  return subject ? `Follow ${subject[1]}’s route` : 'Follow the route'
}

/** A numbered badge on the route: one per PLACE, carrying every visit's number
 *  ("1 · 3" for a place the route returns to), nudged clear of a badge already
 *  sitting on the same coordinate — OpenBible puts the region Syria on
 *  Damascus, so two different places really can share a point. `offset` is in
 *  SCREEN pixels, applied inside the marker's pixel-space group so the nudge
 *  stays the same size at every zoom. */
export interface JourneyBadge {
  index: number
  x: number
  y: number
  orders: number[]
  offset: number
}

export function journeyBadges(stops: JourneyStop[], spacing = 17): JourneyBadge[] {
  const badges: JourneyBadge[] = []
  const byIndex = new Map<number, JourneyBadge>()
  for (const stop of stops) {
    const existing = byIndex.get(stop.index)
    if (existing) {
      existing.orders.push(stop.order)
      continue
    }
    const badge: JourneyBadge = {
      index: stop.index,
      x: stop.x,
      y: stop.y,
      orders: [stop.order],
      offset: 0
    }
    badge.offset = badges.filter(b => Math.hypot(b.x - stop.x, b.y - stop.y) < 0.5).length * spacing
    badges.push(badge)
    byIndex.set(stop.index, badge)
  }
  return badges
}

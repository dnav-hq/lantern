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
  confidenceBand,
  isContested,
  projectToView,
  type ConfidenceBand,
  type MapPlace,
  type MapPlaceBundle,
  type VerseKey
} from './mapData'

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

// The dive-in map card's pure half — docs/proposals/dive-in-2.md.
//
// Everything here is geometry and placement over the shipped bundles, with no
// DOM and no fetch, so the rules the card draws by are under test:
//
//   - a LEG is a straight line, or a gentle arc where the route comes back
//     over a leg it already drew, so an out-and-back reads as a loop;
//   - a CHEVRON is the arrowhead: two strokes in the leg's own line weight,
//     with its tip pulled back from the stop so the dot never covers it;
//   - LABELS are placed greedily — right of the dot, else left, else below,
//     else above — the first spot that stays inside the frame and clear of
//     the labels already placed;
//   - the CALM curve is the app's cubic-bezier(0.45, 0, 0.15, 1) solved for a
//     time, so a JavaScript-driven draw-in follows the same easing as the CSS.
//
// Nothing here may import a Node API — this file lives under src/ and obeys
// the pure-web rule in CLAUDE.md.
import type { ViewBox } from './mapViewport'

export interface XY {
  x: number
  y: number
}

/** A leg's path: straight, or bowed by `bow` (a fraction of its length) to one side. */
export function legPathData(from: XY, to: XY, bow = 0): string {
  const r = (v: number): string => v.toFixed(2)
  if (!bow) return `M${r(from.x)},${r(from.y)}L${r(to.x)},${r(to.y)}`
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  return `M${r(from.x)},${r(from.y)}Q${r(mx - dy * bow)},${r(my + dx * bow)} ${r(to.x)},${r(to.y)}`
}

/**
 * How much each leg bows: a leg that retraces an earlier leg in the opposite
 * direction (Arabia back to Damascus) arcs a little so the two do not lie on
 * top of each other. Same-direction repeats stay straight: they ARE the same
 * line, and drawing them twice is honest.
 */
export function legBows(legs: readonly { from: XY; to: XY }[], bow = 0.14): number[] {
  const seen = new Set<string>()
  const key = (a: XY, b: XY): string => `${a.x},${a.y}>${b.x},${b.y}`
  return legs.map(l => {
    const fwd = key(l.from, l.to)
    const out = seen.has(key(l.to, l.from)) && !seen.has(fwd) ? bow : 0
    seen.add(fwd)
    return out
  })
}

/** An open chevron with its tip at `tip`, pointing along `angle` (radians). */
export function chevronPathData(tip: XY, angle: number, size: number): string {
  const pt = (dx: number, dy: number): string =>
    `${(tip.x + Math.cos(angle) * dx - Math.sin(angle) * dy).toFixed(2)},${(
      tip.y +
      Math.sin(angle) * dx +
      Math.cos(angle) * dy
    ).toFixed(2)}`
  return `M${pt(-size, -size * 0.62)}L${pt(0, 0)}L${pt(-size, size * 0.62)}`
}

/** The app's calm curve, cubic-bezier(0.45, 0, 0.15, 1), solved for a time t in [0, 1]. */
export function easeCalm(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const [x1, y1, x2, y2] = [0.45, 0, 0.15, 1]
  const bx = (u: number): number => 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3
  const by = (u: number): number => 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3
  let lo = 0
  let hi = 1
  let u = t
  for (let i = 0; i < 24; i++) {
    u = (lo + hi) / 2
    if (bx(u) < t) lo = u
    else hi = u
  }
  return by(u)
}

export interface PlacedLabel<T> {
  item: T
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
}

/**
 * Greedy label placement in view-box units. `size` is the font size (in the
 * same units); a label's box is estimated from its text length. Points are
 * taken top to bottom so the placement is stable. A label with no clear spot
 * inside the frame takes the first clear spot anyway, and failing that the
 * right-hand default: a label always exists, it is never dropped.
 */
export function placeLabels<T extends XY & { name: string }>(
  points: readonly T[],
  frame: ViewBox,
  size: number
): PlacedLabel<T>[] {
  const placed: [number, number, number, number][] = []
  const gap = size * 0.45
  const inside = (b: [number, number, number, number]): boolean =>
    b[0] >= frame.x + 1 &&
    b[0] + b[2] <= frame.x + frame.w - 1 &&
    b[1] >= frame.y + 1 &&
    b[1] + b[3] <= frame.y + frame.h - 1
  const clear = (b: [number, number, number, number]): boolean =>
    !placed.some(
      q => b[0] < q[0] + q[2] && q[0] < b[0] + b[2] && b[1] < q[1] + q[3] && q[1] < b[1] + b[3]
    )
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x)
  return sorted.map(p => {
    const tw = p.name.length * size * 0.56
    // the collision box is the x-height band, not the full em, so labels on
    // neighbouring rows are allowed to be close without touching
    const th = size * 0.85
    const candidates: (PlacedLabel<T> & { box: [number, number, number, number] })[] = [
      {
        item: p,
        x: p.x + gap,
        y: p.y + size * 0.35,
        anchor: 'start',
        box: [p.x + gap, p.y - th / 2, tw, th]
      },
      {
        item: p,
        x: p.x - gap,
        y: p.y + size * 0.35,
        anchor: 'end',
        box: [p.x - gap - tw, p.y - th / 2, tw, th]
      },
      {
        item: p,
        x: p.x,
        y: p.y + gap + th * 0.9,
        anchor: 'middle',
        box: [p.x - tw / 2, p.y + gap, tw, th]
      },
      {
        item: p,
        x: p.x,
        y: p.y - gap - th * 0.2,
        anchor: 'middle',
        box: [p.x - tw / 2, p.y - gap - th, tw, th]
      }
    ]
    const pick =
      candidates.find(c => inside(c.box) && clear(c.box)) ??
      candidates.find(c => clear(c.box)) ??
      candidates[0]
    placed.push(pick.box)
    return { item: pick.item, x: pick.x, y: pick.y, anchor: pick.anchor }
  })
}

/**
 * The fixed bearings: places kept faintly on every card so a reader is never
 * lost, even when the chapter never names them. Drawn only where they fall in
 * frame and are not already the chapter's own.
 */
export const BEARING_NAMES: readonly string[] = [
  'Jerusalem',
  'Damascus',
  'Egypt',
  'Babylon',
  'Rome',
  'Nineveh',
  'Antioch 1'
]

/** Where the Great Sea's label sits: on open water, editorially. */
export const GREAT_SEA_LONLAT: [number, number] = [31.6, 33.6]

/** Where the arrow tip stops before a stop dot, in view units, for a frame `w` wide. */
export function arrowPull(w: number): number {
  return w / 110 + w / 220
}

/** A point sits inside a view box. */
export function inFrame(p: XY, vb: ViewBox, margin = 0): boolean {
  return (
    p.x >= vb.x - margin &&
    p.x <= vb.x + vb.w + margin &&
    p.y >= vb.y - margin &&
    p.y <= vb.y + vb.h + margin
  )
}

/* ── Context landmarks (2026-10-28) ──
   Dennis, reviewing Genesis 8: the card was "one zoomed-in picture with a
   label that doesn't mean anything to the person" — Ararat alone, at a scale
   where nothing familiar is in frame. A place-only chapter is now framed with
   a few LANDMARKS beside its own places: well-known names, chosen near the
   chapter and spread around it, drawn muted so the eye still lands on the
   chapter's place first. The journey card is untouched. */

/**
 * The landmarks, by the place bundle's own `n` (OpenBible friendly ids, so
 * the numbered homonyms are spelled out: "Babylon 1" is the city on the
 * Euphrates, "Antioch 1" the Syrian one). A name the bundle lacks is simply
 * absent from the resolved list.
 */
export const LANDMARK_NAMES: readonly string[] = [
  'Jerusalem',
  'Damascus',
  'Babylon 1',
  'Nineveh',
  'Ur 2',
  'Haran',
  'Memphis',
  'Mount Sinai',
  'Tyre',
  'Sidon',
  'Antioch 1',
  'Ephesus',
  'Athens',
  'Rome',
  'Susa',
  'Samaria 1',
  'Bethlehem 1',
  'Jericho 1',
  'Hebron',
  'Shechem',
  'Mount Carmel',
  'Beersheba 1',
  'Joppa',
  'Caesarea',
  'Dan'
]

/** Jerusalem is always a landmark within this reach (view units; ≈ 15°). */
export const JERUSALEM_REACH = 300

/**
 * How a place-only chapter is framed once its landmarks are in: less padding
 * than the bare chapter frame (the landmarks already push the edges out) and
 * a far wider floor — 160 units is about 8° of longitude, enough that a
 * Judean village sits in a frame that shows the coast, the Jordan and the
 * Negev rather than a few streets of hills.
 */
export const CONTEXT_FRAME = { padding: 0.25, minSpan: 160 } as const

/**
 * Pick the landmarks that orient a chapter's places: never one of the
 * chapter's own (same name or same point), Jerusalem whenever it is within
 * reach, then the nearest to the chapter's centre — preferring, among the
 * near ones, candidates in a DIFFERENT direction from those already chosen
 * (at least 60° apart) so the chapter sits among its references instead of
 * at one end of a line of them. Three or four in all, fewer only when the
 * list runs out. Pure, so the rule is under test (diveMap.test.ts).
 */
export function chooseLandmarks<T extends XY & { name: string }>(
  own: readonly XY[],
  landmarks: readonly T[],
  options: { count?: number; jerusalemReach?: number; spreadDeg?: number } = {}
): T[] {
  if (own.length === 0 || landmarks.length === 0) return []
  const count = options.count ?? 4
  const reach = options.jerusalemReach ?? JERUSALEM_REACH
  const spread = ((options.spreadDeg ?? 60) * Math.PI) / 180
  const ownKeys = new Set(own.map(p => `${p.x},${p.y}`))
  const cx = own.reduce((s, p) => s + p.x, 0) / own.length
  const cy = own.reduce((s, p) => s + p.y, 0) / own.length
  const pool = landmarks
    .filter(l => !ownKeys.has(`${l.x},${l.y}`))
    .map(l => ({ l, d: Math.hypot(l.x - cx, l.y - cy), a: Math.atan2(l.y - cy, l.x - cx) }))
    .sort((p, q) => p.d - q.d)
  const chosen: typeof pool = []
  const jerusalem = pool.find(p => p.l.name === 'Jerusalem')
  if (jerusalem && jerusalem.d <= reach) chosen.push(jerusalem)
  const apart = (a: number, b: number): boolean => {
    const diff = Math.abs(a - b) % (2 * Math.PI)
    return Math.min(diff, 2 * Math.PI - diff) >= spread
  }
  // First pass: nearest-first, but only in a fresh direction.
  for (const p of pool) {
    if (chosen.length >= count) break
    if (chosen.includes(p)) continue
    if (chosen.every(c => apart(c.a, p.a))) chosen.push(p)
  }
  // Second pass: fill any slots left with the nearest remaining, regardless.
  for (const p of pool) {
    if (chosen.length >= count) break
    if (!chosen.includes(p)) chosen.push(p)
  }
  return chosen.map(p => p.l)
}

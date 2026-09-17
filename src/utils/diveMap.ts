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

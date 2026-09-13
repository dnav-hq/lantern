// The Bible map — pan and zoom as pure viewBox arithmetic.
//
// Slice 3 of docs/proposals/bible-map-v1.md, section 4.4: "the whole interaction
// model is one SVG viewBox". Zoom narrows it, pan translates it, and every
// gesture the component handles reduces to one question — given this viewBox,
// this screen rectangle and this pointer movement, what is the next viewBox?
// That question is answered here, with no DOM, so it can be tested with numbers
// (mapViewport.test.ts) and the component stays a thin event adapter.
//
// Conventions: a ViewBox is in artwork units (the bundle's own 1000-wide frame);
// a ScreenPoint is client pixels (pointer clientX/Y); a ScreenRect is the SVG
// element's bounding client rect. The viewBox always keeps the aspect ratio of
// the rect it is shown in, so one unit-per-pixel scale holds on both axes and
// nothing is ever letterboxed inside the SVG — the letterbox, where the
// container is taller or wider than the artwork, is part of the viewBox itself.

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/** How far past the full extent the map will zoom. Brief: "roughly 20×". */
export const MAX_ZOOM = 20

/** `[minX, minY, width, height]` (the bundle's `viewBox`) → a ViewBox. */
export function toViewBox(box: readonly [number, number, number, number]): ViewBox {
  return { x: box[0], y: box[1], w: box[2], h: box[3] }
}

/** The `viewBox` attribute string. */
export function formatViewBox(vb: ViewBox): string {
  return `${round(vb.x)} ${round(vb.y)} ${round(vb.w)} ${round(vb.h)}`
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}

/**
 * The zoomed-out home view: the smallest box with the viewport's aspect ratio
 * that shows the whole extent, centred. This is "zoom 1"; every clamp below is
 * relative to it.
 */
export function fitViewBox(extent: ViewBox, viewport: { width: number; height: number }): ViewBox {
  const aspect = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 1
  let w = extent.w
  let h = extent.w / aspect
  if (h < extent.h) {
    h = extent.h
    w = extent.h * aspect
  }
  return { x: extent.x + (extent.w - w) / 2, y: extent.y + (extent.h - h) / 2, w, h }
}

/** How far in the map is, relative to the fitted home view. 1 = home. */
export function zoomLevel(vb: ViewBox, fit: ViewBox): number {
  return fit.w / vb.w
}

/**
 * Whether `vb` IS `target` (within a small floating-point tolerance), used to
 * disable a "return to X" control once pressing it would be a no-op.
 *
 * Not the same question as "is `vb` zoomed IN on `target`" — `zoomLevel(vb,
 * target) <= 1 + tolerance` looks similar but is true for the whole zoomed-OUT
 * half too (a ratio below 1), which is exactly wrong for a control whose
 * target can be zoomed out PAST (the map door's chapter frame, unlike the
 * whole-world view slice 3 shipped this against, is smaller than the world
 * fit, so panning/zooming out past it is a real, reachable state). Reached
 * only within `tolerance` of ratio 1, in either direction.
 */
export function isAtViewBox(vb: ViewBox, target: ViewBox, tolerance = 0.001): boolean {
  return Math.abs(zoomLevel(vb, target) - 1) <= tolerance
}

/** Artwork units per CSS pixel at this viewBox in this rect. */
export function unitsPerPixel(vb: ViewBox, rect: ScreenRect): number {
  return rect.width > 0 ? vb.w / rect.width : 1
}

/** Client pixel → artwork coordinate under it. */
export function screenToView(vb: ViewBox, rect: ScreenRect, p: ScreenPoint): ScreenPoint {
  const k = unitsPerPixel(vb, rect)
  return { x: vb.x + (p.x - rect.left) * k, y: vb.y + (p.y - rect.top) * k }
}

/**
 * Keep the viewBox honest: never larger than the home view, never smaller than
 * `fit / maxZoom`, always the home aspect, and never panned so the artwork
 * leaves the screen. On an axis where the box is wider than the extent (the
 * letterbox axis at low zoom) it is centred on the extent instead of clamped.
 */
export function clampViewBox(
  vb: ViewBox,
  extent: ViewBox,
  fit: ViewBox,
  maxZoom: number = MAX_ZOOM
): ViewBox {
  const w = Math.min(fit.w, Math.max(fit.w / maxZoom, vb.w))
  const h = (w * fit.h) / fit.w
  return {
    x: clampAxis(vb.x + (vb.w - w) / 2, w, extent.x, extent.w),
    y: clampAxis(vb.y + (vb.h - h) / 2, h, extent.y, extent.h),
    w,
    h
  }
}

function clampAxis(start: number, size: number, extentStart: number, extentSize: number): number {
  if (size >= extentSize) return extentStart + (extentSize - size) / 2
  return Math.min(Math.max(start, extentStart), extentStart + extentSize - size)
}

/**
 * The one move every gesture is made of: resize the box by `sizeFactor`
 * (< 1 zooms in) so that artwork point `anchor` lands under screen pixel `at`.
 * Drag is this with factor 1 (the point under the finger follows the finger);
 * wheel zoom is this with `at` fixed; pinch is this with both changing.
 * Unclamped — callers clamp.
 */
export function anchorViewBox(
  vb: ViewBox,
  sizeFactor: number,
  anchor: ScreenPoint,
  at: ScreenPoint,
  rect: ScreenRect
): ViewBox {
  const w = vb.w * sizeFactor
  const h = vb.h * sizeFactor
  const k = rect.width > 0 ? w / rect.width : 1
  return { x: anchor.x - (at.x - rect.left) * k, y: anchor.y - (at.y - rect.top) * k, w, h }
}

/** One-finger drag from `from` to `to`, in client pixels. */
export function panViewBox(
  vb: ViewBox,
  rect: ScreenRect,
  from: ScreenPoint,
  to: ScreenPoint,
  extent: ViewBox,
  fit: ViewBox
): ViewBox {
  return clampViewBox(anchorViewBox(vb, 1, screenToView(vb, rect, from), to, rect), extent, fit)
}

/** Zoom by `factor` (> 1 zooms in) keeping the artwork under `at` still. */
export function zoomViewBox(
  vb: ViewBox,
  rect: ScreenRect,
  factor: number,
  at: ScreenPoint,
  extent: ViewBox,
  fit: ViewBox,
  maxZoom: number = MAX_ZOOM
): ViewBox {
  if (!(factor > 0) || !Number.isFinite(factor)) return clampViewBox(vb, extent, fit, maxZoom)
  return clampViewBox(
    anchorViewBox(vb, 1 / factor, screenToView(vb, rect, at), at, rect),
    extent,
    fit,
    maxZoom
  )
}

/**
 * Two fingers moved from `prev` to `next`: the box scales by the ratio of the
 * finger distances and the artwork under the old midpoint follows the new one.
 */
export function pinchViewBox(
  vb: ViewBox,
  rect: ScreenRect,
  prev: [ScreenPoint, ScreenPoint],
  next: [ScreenPoint, ScreenPoint],
  extent: ViewBox,
  fit: ViewBox,
  maxZoom: number = MAX_ZOOM
): ViewBox {
  const dPrev = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y)
  const dNext = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y)
  const factor = dPrev < 1 || dNext < 1 ? 1 : dNext / dPrev
  const prevMid = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 }
  const nextMid = { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 }
  return clampViewBox(
    anchorViewBox(vb, 1 / factor, screenToView(vb, rect, prevMid), nextMid, rect),
    extent,
    fit,
    maxZoom
  )
}

/** Linear blend, for the short animated zoom (double-tap, buttons). */
export function interpolateViewBox(a: ViewBox, b: ViewBox, t: number): ViewBox {
  const u = Math.min(1, Math.max(0, t))
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    w: a.w + (b.w - a.w) * u,
    h: a.h + (b.h - a.h) * u
  }
}

/**
 * The map door's chapter frame (docs/proposals/map-in-the-story.md §2.1): the
 * smallest viewport-shaped box that contains a chapter's places with padding,
 * clamped exactly like any other viewBox so it can never show less than the
 * artwork or more than `fit` (the whole-world view stays reachable by
 * zooming out from the frame, it is just not where the frame starts).
 *
 * Degenerate on purpose: a single place (or several that happen to coincide)
 * has a zero-size bounding box, which would ask for an infinite zoom, so
 * each axis is never narrower than `minSpan` artwork units.
 */
export function frameViewBox(
  points: { x: number; y: number }[],
  viewport: { width: number; height: number },
  extent: ViewBox,
  fit: ViewBox,
  options: { padding?: number; minSpan?: number; maxZoom?: number } = {}
): ViewBox {
  if (points.length === 0) return fit
  const padding = options.padding ?? 0.35
  const minSpan = options.minSpan ?? 40
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const w = Math.max(maxX - minX, minSpan) * (1 + padding)
  const h = Math.max(maxY - minY, minSpan) * (1 + padding)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const bounds: ViewBox = { x: cx - w / 2, y: cy - h / 2, w, h }
  return clampViewBox(fitViewBox(bounds, viewport), extent, fit, options.maxZoom ?? MAX_ZOOM)
}

/**
 * Zoom snapped to half-octaves (1, 1.41, 2, 2.83, 4 …). Label decluttering is
 * recomputed only when this changes, so a pan or a small pinch never re-lays
 * out 1,300 labels mid-gesture.
 */
export function quantizeZoom(zoom: number): number {
  return Math.pow(2, Math.round(Math.log2(Math.max(zoom, 1)) * 2) / 2)
}

/**
 * How many labels the map may draw at this zoom. Zoomed out, only the
 * best-attested handful; the budget grows with the square of the zoom because
 * the screen area each label competes for grows the same way.
 */
export function labelBudget(zoom: number, base = 40): number {
  return Math.round(base * zoom * zoom)
}

/**
 * The journey frame (slice 5, docs/proposals/map-in-the-story.md §2.2): the
 * same arithmetic as `frameViewBox`, with two different numbers.
 *
 * A journey is padded MORE than a chapter's places (0.5 against 0.35) because
 * the route's labels and numbered stops sit around the outermost points rather
 * than between them, and a frame tight on the dots crops the names off the
 * screen. And a journey's `minSpan` is wider: a two-stop journey between
 * neighbouring towns is a real route, not a reason to zoom to street level.
 */
export function journeyViewBox(
  points: { x: number; y: number }[],
  viewport: { width: number; height: number },
  extent: ViewBox,
  fit: ViewBox,
  options: { padding?: number; minSpan?: number; maxZoom?: number } = {}
): ViewBox {
  return frameViewBox(points, viewport, extent, fit, {
    padding: options.padding ?? 0.5,
    minSpan: options.minSpan ?? 70,
    maxZoom: options.maxZoom
  })
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  chapterKey,
  loadMapArtwork,
  loadMapJourneys,
  loadMapPlaces,
  type JourneyBundle,
  type MapBaseArtwork,
  type MapPlaceBundle
} from '../utils/mapData'
import {
  BAND_LABEL,
  buildJourneyRoute,
  buildViewModel,
  describeMarker,
  findJourneyForChapter,
  indexMarkersByPlaceId,
  journeyBadges,
  pickMarker,
  placeJourneyLabels,
  selectLabels,
  type JourneyRoute,
  type PlaceMarker
} from '../utils/mapDataLoader'
import {
  clampViewBox,
  fitViewBox,
  formatViewBox,
  frameViewBox,
  interpolateViewBox,
  isAtViewBox,
  journeyViewBox,
  labelBudget,
  panViewBox,
  pinchViewBox,
  quantizeZoom,
  screenToView,
  toViewBox,
  unitsPerPixel,
  zoomLevel,
  zoomViewBox,
  type ScreenPoint,
  type ScreenRect,
  type ViewBox
} from '../utils/mapViewport'
import { BIBLE_BOOKS } from '../utils/bibleBooks'
import { usePrefersReducedMotion } from '../utils/useChapterNavigation'

/** Matches --dur-3 — the close fade/slide MapView plays before telling its
 *  caller to unmount (the same own-the-exit shape as DeepDiveSheet). */
const CLOSE_EXIT_MS = 260

// The Bible map — slice 3 of docs/proposals/bible-map-v1.md: it MOVES.
//
// Slice 2 drew the world at one fixed viewBox. This slice makes that viewBox
// the whole interaction model, exactly as brief section 4.4 prescribes: zoom
// narrows it, pan translates it, and every gesture (drag, pinch, wheel,
// double-tap, the +/− buttons) is a pure function in src/utils/mapViewport.ts
// that this file merely feeds pointer events to. No map library.
//
// Two things keep it smooth. During a gesture the viewBox is written straight
// to the DOM (one attribute + one CSS custom property per frame) and React is
// told only when the gesture ends, so 1,335 markers are never re-rendered
// mid-drag. And markers and labels never scale with zoom: each sits in a group
// that CSS scales by `--map-k` (artwork units per pixel), so a dot is 3 px at
// every zoom and the coastline, with non-scaling strokes, never fattens.
//
// That still left one thing expensive: writing the `viewBox` ATTRIBUTE every
// frame forces the browser to recompute the coordinate system for the whole
// subtree underneath it (all 1,335 markers, their labels, the relief raster)
// — a main-thread layout cost, not a compositor one, and it is what made a
// drag or pinch janky on a phone regardless of how little else changed. The
// fix: the `viewBox` attribute only changes once, when a gesture ENDS (React
// commits it, same as before); while the gesture is live, the same visual
// effect is produced instead by a `transform` on `.map-content` (one element,
// not 1,335), which the browser can composite on the GPU with `will-change:
// transform` and never re-lays-out the artwork underneath. `--map-k` is
// unaffected — it already accounted for the true live viewBox, not the
// committed one.
//
// Slice 4 (docs/proposals/map-in-the-story.md) adds the chapter FRAME: given a
// chapter address, the map opens already zoomed on that chapter's places
// (`frameViewBox` in mapViewport.ts, fed the chapter index's markers) instead
// of the whole world, and the home control returns to the frame rather than
// the world — the world is still one zoom-out away, never removed.
//
// Slice 5 draws the STORY. Where the chapter has a hand-authored journey
// (mapDataLoader.ts's `buildJourneyRoute` over public/bible/map/journeys.json)
// the map draws that route: legs in reading order, dotted where the text is
// silent, stops numbered, and the frame fitted to the journey. And it draws
// NOTHING ELSE — every place outside the story is HIDDEN, not faded, because
// a thousand grey dots behind five numbered ones is the noise Dennis saw when
// he looked at the framed map and found no story in it. The rest of the world
// is one control away ("All", which shows every place at world zoom) and home
// comes straight back to the story.
//
// Still NOT here, on purpose: tapping a verse count to go and read those
// verses, clustering, edge indicators for the ~65 out-of-frame places, and
// the atlas-style visual pass (brief §4).

/** The two base layers. `relief` fetches terrain.png; `plain` never touches it. */
export type MapBaseView = 'plain' | 'relief'

/** A chapter to open the map framed on (`?book=1&chapter=12` → Genesis 12). */
export interface MapChapterAddress {
  book: number
  chapter: number
}

/**
 * How many of a framed chapter's places get a label before the rest fold
 * behind the existing zoom-in-to-reveal-more behaviour (docs/proposals/
 * map-in-the-story.md §2.1 — Joshua 15's 164 places is the stress case this
 * rule exists for). Fed to `labelBudget` as its base instead of the whole-map
 * default of 40, so the SAME formula that grows the budget with zoom just
 * starts from a tighter number when the map is framed.
 */
const FRAME_LABEL_BASE = 20

/** Pixels a pointer may wander and still count as a tap, not a drag. */
const TAP_SLOP = 8
/** How far (px) from a marker's centre a tap still means that marker. */
const TAP_RADIUS = 14
/** Markers within this many px of each other are a dead heat: confidence decides. */
const TAP_TIE = 3
/** Two taps within this gap (ms) and distance (px) are a double-tap. */
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_PX = 30
/** A double-tap or a button press zooms by this much. */
const ZOOM_STEP = 2
const ZOOM_ANIM_MS = 220

/** The label collision box, in screen pixels (the label font is 11 px). */
const LABEL_METRICS = { charWidth: 6.2, lineHeight: 14, offsetX: 9 }

/** How long each leg of a journey takes to draw itself in, and how long after
 *  the previous leg it starts. Stops land as their leg arrives. Ignored under
 *  prefers-reduced-motion, where the whole route is simply there. */
const LEG_DRAW_MS = 420
const LEG_STAGGER_MS = 260

interface MapCanvasProps {
  artwork: MapBaseArtwork
  places: MapPlaceBundle
  view: MapBaseView
  /** Index (into the bundle's `p`) of the place whose card is open. */
  selected?: number | null
  onSelect?: (index: number | null) => void
  /**
   * Indices (into the bundle's `p`) of the places a chapter names, from the
   * bundle's own `ch` index — the map door's frame. Omitted or empty: the map
   * behaves exactly as before slice 4, opening on the whole world.
   */
  chapterIndices?: number[] | null
  /**
   * The chapter's journey, already ordered and projected (slice 5). When
   * present it REPLACES the chapter frame: the route is drawn and framed, and
   * only its own stops are on the map.
   */
  journey?: JourneyRoute | null
}

/**
 * The drawing itself. Still a pure function of the two bundles on first render
 * (MapView.test.tsx asserts on its static markup); the gesture handling is
 * attached on top and only ever changes the viewBox and `--map-k`.
 */
export function MapCanvas({
  artwork,
  places,
  view,
  selected = null,
  onSelect,
  chapterIndices = null,
  journey = null
}: MapCanvasProps): React.ReactElement {
  const extent = useMemo(() => toViewBox(artwork.viewBox), [artwork])
  const model = useMemo(() => buildViewModel(places), [places])
  const reducedMotion = usePrefersReducedMotion()

  // The places this map is about: the journey's stops where there is one, the
  // chapter's own places otherwise. Everything else is not drawn at all. Null —
  // not an empty set — is what tells `home` there is nothing to frame.
  const storySet = useMemo(() => {
    if (journey) return new Set(journey.stops.map(stop => stop.index))
    return chapterIndices && chapterIndices.length > 0 ? new Set(chapterIndices) : null
  }, [journey, chapterIndices])
  const storyMarkers = useMemo(
    () => (storySet ? model.markers.filter(m => storySet.has(m.index)) : null),
    [model, storySet]
  )
  // The reader's way out to the whole dataset: every place, at world zoom. The
  // home control (and this button again) comes back to the story.
  const [showAll, setShowAll] = useState(false)
  useEffect(() => setShowAll(false), [storySet])
  const visibleMarkers = showAll || !storyMarkers ? model.markers : storyMarkers

  const svgRef = useRef<SVGSVGElement>(null)
  // The SVG's measured size. Null until mounted; the first render fits the
  // extent to itself, which is what the static markup tests see.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // `fit` is the WORLD view — the one thing a chapter frame must never be
  // clamped tighter than, so zooming out from the frame always reaches it.
  const fit = useMemo(() => (size ? fitViewBox(extent, size) : extent), [extent, size])
  // `home` is where the map opens and what the home control returns to: the
  // chapter frame when one was given and has geocoded places, the world
  // otherwise (slice 4's "with no chapter it behaves exactly as today").
  const home = useMemo(() => {
    if (!size) return fit
    if (journey && journey.stops.length > 0) {
      return journeyViewBox(journey.stops, size, extent, fit)
    }
    if (storyMarkers && storyMarkers.length > 0) {
      return frameViewBox(
        storyMarkers.map(m => m.point),
        size,
        extent,
        fit
      )
    }
    return fit
  }, [size, journey, storyMarkers, extent, fit])

  // The committed viewBox — what React renders (and what the `viewBox`
  // attribute is set to). The ref is the live one that gestures move; they
  // are reconciled at the end of each gesture.
  const [viewBox, setViewBox] = useState<ViewBox>(extent)
  const liveRef = useRef<ViewBox>(extent)
  // The viewBox the `<svg>` is actually rendering right now — always equal to
  // `viewBox` above. Frame-by-frame gesture updates fake the rest of the way
  // there with a `.map-content` transform instead of touching the attribute.
  const baseRef = useRef<ViewBox>(extent)
  const contentRef = useRef<SVGGElement>(null)
  const rectRef = useRef<ScreenRect | null>(null)
  const fitRef = useRef(fit)
  fitRef.current = fit

  // `.is-live` brackets a gesture: only while it is present does the browser
  // promote `.map-content` to its own GPU layer. Scoped rather than always-on
  // because Chrome drops text to grayscale AA on a promoted layer, which
  // would otherwise make every at-rest screenshot a (harmless but real)
  // pixel diff from the pre-gesture ones.
  const setLive = useCallback((live: boolean) => {
    contentRef.current?.classList.toggle('is-live', live)
  }, [])

  const applyToDom = useCallback((vb: ViewBox) => {
    liveRef.current = vb
    const svg = svgRef.current
    const content = contentRef.current
    if (!svg || !content) return
    const base = baseRef.current
    const scale = base.w / vb.w
    const tx = base.x - scale * vb.x
    const ty = base.y - scale * vb.y
    content.setAttribute('transform', `matrix(${scale} 0 0 ${scale} ${tx} ${ty})`)
    const rect = rectRef.current ?? svg.getBoundingClientRect()
    svg.style.setProperty('--map-k', String(unitsPerPixel(vb, rect)))
  }, [])

  // Measure, and re-measure on resize. On a size change the map keeps its zoom
  // and centre rather than snapping home, so rotating a phone is not a reset.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = (): void => {
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      rectRef.current = rect
      setSize(prev =>
        prev && prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  const homeSeen = useRef<ViewBox | null>(null)
  useEffect(() => {
    if (!size) return
    const prevHome = homeSeen.current
    homeSeen.current = home
    let next: ViewBox
    if (!prevHome) {
      next = home
    } else {
      const live = liveRef.current
      const zoom = zoomLevel(live, prevHome)
      const w = home.w / zoom
      const h = home.h / zoom
      next = clampViewBox(
        { x: live.x + live.w / 2 - w / 2, y: live.y + live.h / 2 - h / 2, w, h },
        extent,
        fit
      )
    }
    baseRef.current = next
    applyToDom(next)
    setViewBox(next)
  }, [home, fit, size, extent, applyToDom])

  // Keep the DOM in step with the committed state whenever React renders it:
  // the `viewBox` attribute comes from state via JSX below, but `--map-k` and
  // `.map-content`'s transform do not, and `baseRef` must land on the value
  // the attribute now holds before any gesture measures a delta against it.
  useEffect(() => {
    baseRef.current = viewBox
    applyToDom(viewBox)
  }, [viewBox, applyToDom])

  /* ── Gestures ── */
  const pointers = useRef(new Map<number, ScreenPoint>())
  const gesture = useRef<{
    start: ScreenPoint
    startedAt: number
    moved: boolean
  } | null>(null)
  const lastTap = useRef<{ at: number; point: ScreenPoint } | null>(null)
  const animation = useRef<number | null>(null)

  const cancelAnimation = useCallback(() => {
    if (animation.current !== null) {
      cancelAnimationFrame(animation.current)
      animation.current = null
    }
  }, [])

  const commit = useCallback(() => {
    setLive(false)
    setViewBox(liveRef.current)
  }, [setLive])

  const animateTo = useCallback(
    (target: ViewBox) => {
      cancelAnimation()
      setLive(true)
      if (reducedMotion) {
        applyToDom(target)
        commit()
        return
      }
      const from = liveRef.current
      const started = performance.now()
      const step = (now: number): void => {
        const t = Math.min(1, (now - started) / ZOOM_ANIM_MS)
        const eased = 1 - Math.pow(1 - t, 3)
        applyToDom(interpolateViewBox(from, target, eased))
        if (t < 1) {
          animation.current = requestAnimationFrame(step)
        } else {
          animation.current = null
          commit()
        }
      }
      animation.current = requestAnimationFrame(step)
    },
    [applyToDom, cancelAnimation, commit, reducedMotion, setLive]
  )

  const zoomBy = useCallback(
    (factor: number, at?: ScreenPoint) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      rectRef.current = rect
      const focus = at ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      animateTo(zoomViewBox(liveRef.current, rect, factor, focus, extent, fitRef.current))
    },
    [animateTo, extent]
  )

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    cancelAnimation()
    setLive(true)
    const svg = e.currentTarget
    try {
      svg.setPointerCapture(e.pointerId)
    } catch {
      // A pointer that is already gone (or a synthetic one) cannot be captured;
      // the gesture still works, it just will not follow the finger off-map.
    }
    rectRef.current = svg.getBoundingClientRect()
    const point = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, point)
    if (pointers.current.size === 1) {
      gesture.current = { start: point, startedAt: e.timeStamp, moved: false }
    } else if (gesture.current) {
      gesture.current.moved = true
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const prev = pointers.current.get(e.pointerId)
    const rect = rectRef.current
    if (!prev || !rect) return
    const next = { x: e.clientX, y: e.clientY }
    const g = gesture.current
    if (g && !g.moved && Math.hypot(next.x - g.start.x, next.y - g.start.y) > TAP_SLOP) {
      g.moved = true
    }
    const ids = [...pointers.current.keys()]
    if (ids.length === 1) {
      if (g?.moved) {
        applyToDom(panViewBox(liveRef.current, rect, prev, next, extent, fitRef.current))
      }
    } else if (ids.length >= 2) {
      const otherId = ids.find(id => id !== e.pointerId)!
      const other = pointers.current.get(otherId)!
      applyToDom(
        pinchViewBox(liveRef.current, rect, [prev, other], [next, other], extent, fitRef.current)
      )
    }
    pointers.current.set(e.pointerId, next)
  }

  const endPointer = (e: React.PointerEvent<SVGSVGElement>, cancelled: boolean): void => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    if (pointers.current.size > 0) return
    const g = gesture.current
    gesture.current = null
    commit()
    if (cancelled || !g || g.moved || e.timeStamp - g.startedAt > 500) return

    // A tap. Double-tap zooms in a step about the finger; a single tap picks a
    // place or, on the background, dismisses the card.
    const point = { x: e.clientX, y: e.clientY }
    const last = lastTap.current
    if (
      last &&
      e.timeStamp - last.at < DOUBLE_TAP_MS &&
      Math.hypot(point.x - last.point.x, point.y - last.point.y) < DOUBLE_TAP_PX
    ) {
      lastTap.current = null
      zoomBy(ZOOM_STEP, point)
      return
    }
    lastTap.current = { at: e.timeStamp, point }
    // Nearest marker within a finger's reach wins, not the topmost element:
    // in the Judean cluster a tap on Jerusalem must pick Jerusalem.
    const rect = rectRef.current ?? e.currentTarget.getBoundingClientRect()
    const live = liveRef.current
    const k = unitsPerPixel(live, rect)
    const hit = pickMarker(
      visibleMarkers,
      screenToView(live, rect, point),
      TAP_RADIUS * k,
      TAP_TIE * k
    )
    onSelect?.(hit ? hit.index : null)
  }

  // Wheel needs `passive: false` to stop the page scrolling under the map,
  // which React's synthetic onWheel cannot promise; attach it by hand.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let commitTimer: number | null = null
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      cancelAnimation()
      setLive(true)
      const rect = svg.getBoundingClientRect()
      rectRef.current = rect
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      // A trackpad pinch arrives as ctrl+wheel with small deltas; treat it as
      // a direct scale. A mouse wheel notch is ~100 and gets a gentler curve.
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0022))
      applyToDom(
        zoomViewBox(
          liveRef.current,
          rect,
          factor,
          { x: e.clientX, y: e.clientY },
          extent,
          fitRef.current
        )
      )
      if (commitTimer !== null) window.clearTimeout(commitTimer)
      commitTimer = window.setTimeout(commit, 120)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('wheel', onWheel)
      if (commitTimer !== null) window.clearTimeout(commitTimer)
    }
  }, [applyToDom, cancelAnimation, commit, extent, setLive])

  /* ── Labels: decluttered in screen space at the committed zoom ──
     Framed on a chapter, only that chapter's own places are candidates — the
     rest are faded dots and never earn a label — and the budget starts from
     FRAME_LABEL_BASE rather than the whole-map default, which is what caps a
     dense chapter (Joshua 15's 164 places) at ~20 labels before the SAME
     zoom-in-reveals-more formula takes back over (labelBudget below). */
  const homeZoom = zoomLevel(viewBox, home)
  const zoomStep = quantizeZoom(homeZoom)
  const width = size?.width ?? extent.w
  const labelCandidates = showAll ? model.markers : (storyMarkers ?? model.markers)
  const framedLabels = !showAll && storyMarkers !== null
  const labels = useMemo(() => {
    // Units per pixel at the quantised zoom step, so a pan never relays out.
    const k = home.w / zoomStep / width
    return selectLabels(labelCandidates, {
      charWidth: LABEL_METRICS.charWidth * k,
      lineHeight: LABEL_METRICS.lineHeight * k,
      offsetX: LABEL_METRICS.offsetX * k,
      limit: labelBudget(zoomStep, framedLabels ? FRAME_LABEL_BASE : undefined)
    })
  }, [labelCandidates, framedLabels, home.w, zoomStep, width])

  /* The route's own labels never go through that budget: five stops the reader
     is being asked to follow must ALL be named, so a collision moves the name
     rather than dropping it (placeJourneyLabels). */
  const routeLabels = useMemo(() => {
    if (!journey || showAll) return null
    const k = home.w / zoomStep / width
    return placeJourneyLabels(journey.stops, {
      charWidth: LABEL_METRICS.charWidth * k,
      lineHeight: LABEL_METRICS.lineHeight * k,
      offsetX: (LABEL_METRICS.offsetX + 4) * k,
      lineGap: LABEL_METRICS.lineHeight * 1.2 * k
    })
  }, [journey, showAll, home.w, zoomStep, width])
  const badges = useMemo(() => (journey ? journeyBadges(journey.stops) : null), [journey])

  const [, , vbWidth, vbHeight] = artwork.viewBox
  const terrain = artwork.terrain
  // "Home" is the frame when one was given, the world otherwise; the world
  // EDGE (nothing left to zoom out to) is judged against `fit`, always the
  // world, so a framed map never disables the reader's way back out to it.
  // `isAtViewBox` (not a plain `zoomLevel(...) <= 1.001` test) matters once a
  // frame makes home smaller than the world: zooming OUT past the frame drives
  // that ratio BELOW 1, and a `<=` test reads that as "still at home" and
  // never re-enables the button — exactly backwards, since zoomed out past
  // the frame is the one moment the home control must work.
  const atHome = isAtViewBox(viewBox, home) && !showAll
  const atWorldEdge = isAtViewBox(viewBox, fit)
  const framed = storyMarkers !== null && storyMarkers.length > 0

  return (
    <div className="map-stage">
      <svg
        ref={svgRef}
        className={`map-svg${atWorldEdge ? ' is-home' : ''}`}
        viewBox={formatViewBox(viewBox)}
        role="img"
        aria-label={
          journey && !showAll
            ? `${journey.title}: ${journey.stops.length} stops in order — ${journey.stops.map(stop => stop.name).join(', ')}. Only this journey is drawn; the rest of the Bible world is one control away. Drag to pan, pinch or scroll to zoom, tap a place for details.`
            : framed && !showAll
              ? `${storyMarkers!.length} places in this chapter, framed on modern coastlines; the rest of the Bible world is not drawn, and is one control away. Drag to pan, pinch or scroll to zoom, tap a place for details.`
              : `The Bible world: ${model.markers.length} places from Genesis to Revelation, drawn on modern coastlines. Drag to pan, pinch or scroll to zoom, tap a place for details.`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => endPointer(e, false)}
        onPointerCancel={e => endPointer(e, true)}
      >
        {/* Everything drawn moves together as one unit during a live gesture:
            see the note at the top of this file for why this group, not the
            `viewBox` attribute, is what a drag or pinch writes to per frame. */}
        <g ref={contentRef} className="map-content">
          {/* The opt-in relief layer. Rendered ONLY in the relief view, which is
              what makes the fetch lazy: with no <image> in the tree the browser
              never asks for terrain.png, so the default paint is vectors only. */}
          {view === 'relief' && terrain && (
            <image
              className="map-terrain"
              href={terrain.url}
              x={0}
              y={0}
              width={vbWidth}
              height={vbHeight}
              preserveAspectRatio="none"
            />
          )}

          <g className="map-layer map-layer-lakes" aria-hidden="true">
            {artwork.layers.lakes.map((d, i) => (
              <path key={i} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <g className="map-layer map-layer-rivers" aria-hidden="true">
            {artwork.layers.rivers.map((d, i) => (
              <path key={i} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <g className="map-layer map-layer-coast" aria-hidden="true">
            {artwork.layers.coastline.map((d, i) => (
              <path key={i} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>

          {/* The journey, under its own stops: legs in reading order, a dotted
              one where the text is silent about the course. Each draws itself
              in after the one before (the CSS animation reads --leg-len, the
              leg's own length in artwork units, so the stroke grows along the
              line rather than fading in). */}
          {journey && !showAll && (
            <g className={`map-route${reducedMotion ? '' : ' is-drawing'}`} aria-hidden="true">
              {journey.legs.map((leg, i) => (
                <line
                  key={`${leg.from.order}-${leg.to.order}`}
                  className={`map-leg${leg.silent ? ' is-silent' : ''}`}
                  x1={leg.from.x}
                  y1={leg.from.y}
                  x2={leg.to.x}
                  y2={leg.to.y}
                  style={
                    {
                      '--leg-len': Math.hypot(leg.to.x - leg.from.x, leg.to.y - leg.from.y),
                      animationDelay: `${i * LEG_STAGGER_MS}ms`,
                      animationDuration: `${LEG_DRAW_MS}ms`
                    } as React.CSSProperties
                  }
                />
              ))}
            </g>
          )}

          <g className="map-markers">
            {visibleMarkers.map(marker => (
              <PlaceGlyph key={marker.index} marker={marker} selected={marker.index === selected} />
            ))}
          </g>

          {/* The numbered stops. One badge per PLACE, carrying every visit's
              number, so a route that returns to Damascus says "1 · 3" there
              rather than stacking two discs on one dot. */}
          {badges && !showAll && (
            <g
              className={`map-route-stops${reducedMotion ? '' : ' is-drawing'}`}
              aria-hidden="true"
            >
              {badges.map(badge => {
                const text = badge.orders.join('·')
                const width = Math.max(15, text.length * 5.4 + 9)
                return (
                  <g key={badge.index} transform={`translate(${badge.x} ${badge.y})`}>
                    <g className="map-place-scale">
                      <g
                        transform={`translate(0 ${badge.offset})`}
                        style={{
                          animationDelay: `${(badge.orders[0] - 1) * LEG_STAGGER_MS}ms`
                        }}
                      >
                        <rect
                          className="map-stop"
                          x={-width / 2}
                          y={-7.5}
                          width={width}
                          height={15}
                          rx={7.5}
                        />
                        <text className="map-stop-num" x={0} y={3.4} textAnchor="middle">
                          {text}
                        </text>
                      </g>
                    </g>
                  </g>
                )
              })}
            </g>
          )}

          <g className="map-labels" aria-hidden="true">
            {routeLabels
              ? routeLabels.map(label => (
                  <g key={label.index} transform={`translate(${label.x} ${label.y})`}>
                    <g className="map-place-scale">
                      <text className="map-label is-route" x={0} y={0} textAnchor={label.anchor}>
                        {label.name}
                      </text>
                    </g>
                  </g>
                ))
              : labels.map(label => (
                  <g key={label.index} transform={`translate(${label.x} ${label.y})`}>
                    <g className="map-place-scale">
                      <text className="map-label" x={0} y={0}>
                        {label.name}
                      </text>
                    </g>
                  </g>
                ))}
          </g>
        </g>
      </svg>

      <div className="map-zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          className="map-zoom-btn"
          aria-label="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="map-zoom-btn"
          aria-label="Zoom out"
          disabled={atWorldEdge}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="map-zoom-btn map-zoom-home"
          aria-label={
            journey
              ? 'Return to the journey'
              : framed
                ? 'Return to this chapter'
                : 'Show the whole map'
          }
          disabled={atHome}
          onClick={() => {
            setShowAll(false)
            animateTo(home)
          }}
        >
          ⌂
        </button>
        {/* Framed, the map draws the story and NOTHING else — so the whole
            dataset needs a door of its own. One press shows every place at
            world zoom; home (above) comes straight back to the story. */}
        {framed && (
          <button
            type="button"
            className="map-zoom-btn map-zoom-all"
            aria-label="Show every place on the whole map"
            aria-pressed={showAll}
            onClick={() => {
              setShowAll(true)
              animateTo(fit)
            }}
          >
            All
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * One place. Confidence is carried by SHAPE and FILL, never by colour alone
 * (brief section 3.3 rule 1): an undisputed place is a solid disc, a moderate one a
 * hollow ring, a low-confidence one a dashed hollow ring. A contested place
 * additionally draws its rivals as small open marks tied to the best candidate
 * by a hairline — the brief's rule 2, that showing only the winner is exactly
 * the false certainty this map is supposed to refuse.
 *
 * Geometry is in PIXELS around each point: the `.map-place-scale` group is
 * scaled by `--map-k` in CSS, which is what keeps a marker the same size on
 * screen at every zoom. Only the tether lines live in artwork units.
 *
 * Memoized: MapCanvas re-renders once at the end of every gesture (the
 * viewBox commit), and without this every one of the 1,335 markers would be
 * re-invoked and reconciled at that instant even though only the viewBox
 * changed — the exact one-time spike a smooth gesture end should not have.
 */
const PlaceGlyph = React.memo(function PlaceGlyph({
  marker,
  selected
}: {
  marker: PlaceMarker
  selected: boolean
}): React.ReactElement {
  const { point, band, contested, alternatives } = marker
  return (
    <g
      className={`map-place is-${band}${contested ? ' is-contested' : ''}${selected ? ' is-selected' : ''}`}
    >
      <title>{describeMarker(marker)}</title>
      {alternatives.map((alt, i) => (
        <React.Fragment key={i}>
          {alt.linked && (
            <line
              className="map-place-link"
              x1={point.x}
              y1={point.y}
              x2={alt.x}
              y2={alt.y}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <g transform={`translate(${alt.x} ${alt.y})`}>
            <g className="map-place-scale">
              <circle className="map-place-alt" cx={0} cy={0} r={1.9} />
            </g>
          </g>
        </React.Fragment>
      ))}
      <g transform={`translate(${point.x} ${point.y})`}>
        <g className="map-place-scale">
          {selected && <circle className="map-place-halo" cx={0} cy={0} r={8} />}
          <circle className="map-place-dot" cx={0} cy={0} r={band === 'settled' ? 3.4 : 3} />
        </g>
      </g>
    </g>
  )
})

const BAND_ORDER = ['settled', 'high', 'moderate', 'low'] as const

function MapLegend({
  counts,
  unlocatedCount,
  contestedCount
}: {
  counts: Record<string, number>
  unlocatedCount: number
  contestedCount: number
}): React.ReactElement {
  return (
    <div className="map-legend">
      <h2 className="map-legend-title">How sure is this?</h2>
      <ul className="map-legend-list">
        {BAND_ORDER.map(band => (
          <li key={band} className={`map-legend-row is-${band}`}>
            <svg className="map-legend-swatch" viewBox="0 0 12 12" aria-hidden="true">
              <g className={`map-place is-${band}`}>
                <circle
                  className="map-place-dot"
                  cx={6}
                  cy={6}
                  r={band === 'settled' ? 3.2 : 2.8}
                />
              </g>
            </svg>
            <span className="map-legend-name">{BAND_LABEL[band]}</span>
            <span className="map-legend-count">{counts[band]}</span>
          </li>
        ))}
        <li className="map-legend-row is-contested-row">
          <svg className="map-legend-swatch" viewBox="0 0 12 12" aria-hidden="true">
            <g className="map-place is-moderate is-contested">
              <line className="map-place-link" x1={3} y1={6} x2={10} y2={4} />
              <circle className="map-place-alt" cx={10} cy={4} r={1.4} />
              <circle className="map-place-dot" cx={3} cy={6} r={2.4} />
            </g>
          </svg>
          <span className="map-legend-name">Competing locations proposed</span>
          <span className="map-legend-count">{contestedCount}</span>
        </li>
        <li className="map-legend-row is-unknown-row">
          <span className="map-legend-swatch map-legend-swatch-none" aria-hidden="true">
            —
          </span>
          <span className="map-legend-name">Location unknown — not drawn</span>
          <span className="map-legend-count">{unlocatedCount}</span>
        </li>
      </ul>
    </div>
  )
}

/**
 * The small card a tapped place opens: its name, how sure scholarship is, and
 * how many verses it is in. Verse navigation is deliberately not wired yet.
 */
function PlaceCard({
  marker,
  verses,
  onClose
}: {
  marker: PlaceMarker
  verses: number
  onClose: () => void
}): React.ReactElement {
  const rivals = marker.alternatives.length
  return (
    <div className="map-card" role="dialog" aria-label={marker.name}>
      <div className="map-card-head">
        <div>
          <h2 className="map-card-name">{marker.name}</h2>
          <p className="map-card-type">{marker.type}</p>
        </div>
        <button type="button" className="map-card-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <dl className="map-card-facts">
        <div className="map-card-fact">
          <dt>Confidence</dt>
          <dd>
            <span className={`map-card-band is-${marker.band}`}>{BAND_LABEL[marker.band]}</span>
            <span className="map-card-score">{marker.score}/1000</span>
          </dd>
        </div>
        {marker.point.modern && (
          <div className="map-card-fact">
            <dt>Identified as</dt>
            <dd>{marker.point.modern}</dd>
          </div>
        )}
        {rivals > 0 && (
          <div className="map-card-fact">
            <dt>Also proposed</dt>
            <dd>
              {rivals} other location{rivals === 1 ? '' : 's'}
            </dd>
          </div>
        )}
        <div className="map-card-fact">
          <dt>In scripture</dt>
          <dd>
            {verses} verse{verses === 1 ? '' : 's'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

interface MapViewProps {
  /** Leaves the map; the page underneath is untouched. */
  onClose: () => void
  /**
   * Frame the map on this chapter's geocoded places (docs/proposals/
   * map-in-the-story.md) instead of opening on the whole world. Omit for the
   * plain, unframed open slice 3 shipped with.
   */
  chapter?: MapChapterAddress | null
}

/**
 * The map surface: loads both bundles lazily on mount (nothing fetches them at
 * app start — see `loadMapPlaces`), then draws.
 */
export default function MapView({ chapter = null, onClose }: MapViewProps): React.ReactElement {
  const [artwork, setArtwork] = useState<MapBaseArtwork | null>(null)
  const [places, setPlaces] = useState<MapPlaceBundle | null>(null)
  const [journeys, setJourneys] = useState<JourneyBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<MapBaseView>('plain')
  const [selected, setSelected] = useState<number | null>(null)
  // Plays the close motion (fade + settle) before telling App.tsx to swap the
  // map back out — the same own-the-exit shape as DeepDiveSheet/
  // MobileSelectionBar, so leaving the map is as calm as every other surface.
  const [closing, setClosing] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const requestClose = useCallback(() => {
    if (reducedMotion) {
      onClose()
      return
    }
    setClosing(true)
    window.setTimeout(onClose, CLOSE_EXIT_MS)
  }, [onClose, reducedMotion])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  // The journeys table: 18 KB of plain JSON, fetched only where a chapter
  // could have one. A failure here is not a broken map — it is a map with no
  // route on it, so it is swallowed rather than shown as an error.
  useEffect(() => {
    if (!chapter) return
    let live = true
    loadMapJourneys()
      .then(bundle => live && setJourneys(bundle))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [chapter])

  useEffect(() => {
    let live = true
    Promise.all([loadMapArtwork(), loadMapPlaces()])
      .then(([base, bundle]) => {
        if (!live) return
        setArtwork(base)
        setPlaces(bundle)
      })
      .catch(err => {
        if (live) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      live = false
    }
  }, [])

  const model = useMemo(() => (places ? buildViewModel(places) : null), [places])
  const selectedMarker =
    selected === null ? null : (model?.markers.find(m => m.index === selected) ?? null)

  // The chapter index lookup slice 4 adds no new data for (docs/proposals/
  // map-in-the-story.md §2.1): `places.ch` is already shipped, keyed BBCCC.
  const chapterIndices = useMemo(
    () => (chapter && places ? (places.ch[chapterKey(chapter.book, chapter.chapter)] ?? []) : null),
    [chapter, places]
  )
  const chapterBook = chapter ? BIBLE_BOOKS.find(b => b.number === chapter.book) : undefined
  const chapterLabel = chapterBook ? `${chapterBook.name} ${chapter!.chapter}` : null

  // The chapter's journey, ordered into a drawable route. Everything fiddly
  // here — splicing the gaps back into reading order, numbering the stops — is
  // mapDataLoader's, under test; this is the lookup and nothing else.
  const route = useMemo(() => {
    if (!chapter || !journeys || !places || !model) return null
    const journey = findJourneyForChapter(journeys, chapter.book, chapter.chapter)
    if (!journey) return null
    const byPlaceId = indexMarkersByPlaceId(model.markers, places)
    return buildJourneyRoute(journey, journeys.gaps, id => byPlaceId.get(id))
  }, [chapter, journeys, places, model])
  const silentLegs = route ? route.legs.filter(leg => leg.silent && leg.note) : []

  return (
    <div className={`map-view${closing ? ' is-closing' : ''}`}>
      <header className="map-view-head">
        <div>
          <p className="map-view-eyebrow">{chapterLabel ?? 'Preview'}</p>
          <h1 className="map-view-title">
            {route ? route.title : chapterLabel ? 'This chapter’s places' : 'The Bible world'}
          </h1>
        </div>
        <div className="map-view-head-actions">
          <div className="map-view-toggle" role="group" aria-label="Base layer">
            {(['plain', 'relief'] as MapBaseView[]).map(option => (
              <button
                key={option}
                type="button"
                className={`map-view-toggle-btn${view === option ? ' is-active' : ''}`}
                aria-pressed={view === option}
                onClick={() => setView(option)}
              >
                {option === 'plain' ? 'Plain' : 'Relief'}
              </button>
            ))}
          </div>
          {/* The map's own way home — in the same register as a deep-dive
              sheet's close control (same class, same ✕), since until now a
              reader who opened the map from a verse had no way back at all. */}
          <button type="button" className="word-close" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </div>
      </header>

      {error && <p className="map-view-error">The map could not load: {error}</p>}

      {!error && (!artwork || !places || !model) && (
        <p className="map-view-loading">Drawing the map…</p>
      )}

      {artwork && places && model && (
        <>
          <div className="map-canvas">
            <MapCanvas
              artwork={artwork}
              places={places}
              view={view}
              selected={selected}
              onSelect={setSelected}
              chapterIndices={chapterIndices}
              journey={route}
            />
            {selectedMarker && (
              <PlaceCard
                marker={selectedMarker}
                verses={selectedMarker.references}
                onClose={() => setSelected(null)}
              />
            )}
          </div>

          {route && (
            <section className="map-route-key">
              <h2 className="map-route-key-title">The route, in order, from {route.source}</h2>
              <ol className="map-route-key-list">
                {route.stops.map(stop => (
                  <li key={stop.order}>
                    <span className="map-route-key-num">{stop.order}</span>
                    {stop.name}
                  </li>
                ))}
              </ol>
              {/* A dotted leg is a claim about the TEXT, not about the map, so
                  the reason is on the page rather than behind a tap. */}
              {silentLegs.map(leg => (
                <p key={leg.to.order} className="map-route-key-gap">
                  <strong>
                    {leg.from.name} to {leg.to.name}
                  </strong>{' '}
                  is drawn dotted: {leg.note}
                </p>
              ))}
              {route.unlocated.length > 0 && (
                <p className="map-route-key-gap">
                  Not drawn, because nobody can locate {route.unlocated.join(', ')}.
                </p>
              )}
            </section>
          )}

          <MapLegend
            counts={model.counts}
            unlocatedCount={model.unlocated.length}
            contestedCount={model.markers.filter(m => m.contested).length}
          />

          <section className="map-unlocated">
            <h2 className="map-unlocated-title">Places nobody can locate</h2>
            <p className="map-unlocated-note">
              These are in the Bible and in the dataset, and no one knows where they were. They are
              listed rather than plotted — putting a dot on the map for them would be a guess.
            </p>
            <ul className="map-unlocated-list">
              {model.unlocated.map(place => (
                <li key={place.index}>
                  <span className="map-unlocated-name">{place.name}</span>
                  <span className="map-unlocated-type">{place.type}</span>
                </li>
              ))}
            </ul>
          </section>

          <footer className="map-attribution">
            <p>{places.attribution}</p>
            <p>{artwork.terrain?.attribution ?? 'Base map: Natural Earth (public domain)'}</p>
            <p>
              The coastlines and rivers are <strong>modern</strong> geography, with ancient places
              plotted on them. The Dead Sea, the Nile delta and Tyre&rsquo;s isthmus have all moved
              since; this is the land as it is now, not as it was.
            </p>
            <p>
              The scholarly sources behind each identification are published at{' '}
              <a href="https://www.openbible.info/geo/" rel="noreferrer noopener" target="_blank">
                openbible.info
              </a>
              .
            </p>
          </footer>
        </>
      )}
    </div>
  )
}

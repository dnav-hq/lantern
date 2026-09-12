import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadMapArtwork,
  loadMapPlaces,
  type MapBaseArtwork,
  type MapPlaceBundle
} from '../utils/mapData'
import {
  BAND_LABEL,
  buildViewModel,
  describeMarker,
  pickMarker,
  selectLabels,
  type PlaceMarker
} from '../utils/mapDataLoader'
import {
  clampViewBox,
  fitViewBox,
  formatViewBox,
  interpolateViewBox,
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
import { usePrefersReducedMotion } from '../utils/useChapterNavigation'

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
// Still NOT here, on purpose: how the map is reached from a verse (App.tsx's
// temporary `?map` entry stands), tapping a verse count to go and read those
// verses, clustering, and edge indicators for the ~65 out-of-frame places.

/** The two base layers. `relief` fetches terrain.png; `plain` never touches it. */
export type MapBaseView = 'plain' | 'relief'

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

interface MapCanvasProps {
  artwork: MapBaseArtwork
  places: MapPlaceBundle
  view: MapBaseView
  /** Index (into the bundle's `p`) of the place whose card is open. */
  selected?: number | null
  onSelect?: (index: number | null) => void
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
  onSelect
}: MapCanvasProps): React.ReactElement {
  const extent = useMemo(() => toViewBox(artwork.viewBox), [artwork])
  const model = useMemo(() => buildViewModel(places), [places])
  const reducedMotion = usePrefersReducedMotion()

  const svgRef = useRef<SVGSVGElement>(null)
  // The SVG's measured size. Null until mounted; the first render fits the
  // extent to itself, which is what the static markup tests see.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const fit = useMemo(() => (size ? fitViewBox(extent, size) : extent), [extent, size])

  // The committed viewBox — what React renders. The ref is the live one that
  // gestures move; they are reconciled at the end of each gesture.
  const [viewBox, setViewBox] = useState<ViewBox>(extent)
  const liveRef = useRef<ViewBox>(extent)
  const rectRef = useRef<ScreenRect | null>(null)
  const fitRef = useRef(fit)
  fitRef.current = fit

  const applyToDom = useCallback((vb: ViewBox) => {
    liveRef.current = vb
    const svg = svgRef.current
    if (!svg) return
    svg.setAttribute('viewBox', formatViewBox(vb))
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

  const fitSeen = useRef<ViewBox | null>(null)
  useEffect(() => {
    if (!size) return
    const prevFit = fitSeen.current
    fitSeen.current = fit
    let next: ViewBox
    if (!prevFit) {
      next = fit
    } else {
      const live = liveRef.current
      const zoom = zoomLevel(live, prevFit)
      const w = fit.w / zoom
      const h = fit.h / zoom
      next = clampViewBox(
        { x: live.x + live.w / 2 - w / 2, y: live.y + live.h / 2 - h / 2, w, h },
        extent,
        fit
      )
    }
    applyToDom(next)
    setViewBox(next)
  }, [fit, size, extent, applyToDom])

  // Keep the DOM in step with the committed state whenever React renders it
  // (the attribute below is rendered from state, but `--map-k` is not).
  useEffect(() => {
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
    setViewBox(liveRef.current)
  }, [])

  const animateTo = useCallback(
    (target: ViewBox) => {
      cancelAnimation()
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
    [applyToDom, cancelAnimation, commit, reducedMotion]
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
      model.markers,
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
  }, [applyToDom, cancelAnimation, commit, extent])

  /* ── Labels: decluttered in screen space at the committed zoom ── */
  const zoom = zoomLevel(viewBox, fit)
  const zoomStep = quantizeZoom(zoom)
  const width = size?.width ?? extent.w
  const labels = useMemo(() => {
    // Units per pixel at the quantised zoom step, so a pan never relays out.
    const k = fit.w / zoomStep / width
    return selectLabels(model.markers, {
      charWidth: LABEL_METRICS.charWidth * k,
      lineHeight: LABEL_METRICS.lineHeight * k,
      offsetX: LABEL_METRICS.offsetX * k,
      limit: labelBudget(zoomStep)
    })
  }, [model, fit.w, zoomStep, width])

  const [, , vbWidth, vbHeight] = artwork.viewBox
  const terrain = artwork.terrain
  const atHome = zoom <= 1.001

  return (
    <div className="map-stage">
      <svg
        ref={svgRef}
        className={`map-svg${atHome ? ' is-home' : ''}`}
        viewBox={formatViewBox(viewBox)}
        role="img"
        aria-label={`The Bible world: ${model.markers.length} places from Genesis to Revelation, drawn on modern coastlines. Drag to pan, pinch or scroll to zoom, tap a place for details.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => endPointer(e, false)}
        onPointerCancel={e => endPointer(e, true)}
      >
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

        <g className="map-markers">
          {model.markers.map(marker => (
            <PlaceGlyph key={marker.index} marker={marker} selected={marker.index === selected} />
          ))}
        </g>

        <g className="map-labels" aria-hidden="true">
          {labels.map(label => (
            <g key={label.index} transform={`translate(${label.x} ${label.y})`}>
              <g className="map-place-scale">
                <text className="map-label" x={0} y={0}>
                  {label.name}
                </text>
              </g>
            </g>
          ))}
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
          disabled={atHome}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="map-zoom-btn map-zoom-home"
          aria-label="Show the whole map"
          disabled={atHome}
          onClick={() => animateTo(fit)}
        >
          ⌂
        </button>
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
 */
function PlaceGlyph({
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
}

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

/**
 * The map surface: loads both bundles lazily on mount (nothing fetches them at
 * app start — see `loadMapPlaces`), then draws.
 */
export default function MapView(): React.ReactElement {
  const [artwork, setArtwork] = useState<MapBaseArtwork | null>(null)
  const [places, setPlaces] = useState<MapPlaceBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<MapBaseView>('plain')
  const [selected, setSelected] = useState<number | null>(null)

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

  return (
    <div className="map-view">
      <header className="map-view-head">
        <div>
          <p className="map-view-eyebrow">Preview</p>
          <h1 className="map-view-title">The Bible world</h1>
        </div>
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
            />
            {selectedMarker && (
              <PlaceCard
                marker={selectedMarker}
                verses={selectedMarker.references}
                onClose={() => setSelected(null)}
              />
            )}
          </div>

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

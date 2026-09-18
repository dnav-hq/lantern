/**
 * The dive-in map card — docs/proposals/dive-in-2.md, sections "The view",
 * "The journey" and "Motion". design/dive-in-2.html is the look, and this file
 * is that page's JavaScript made into a component, decision for decision:
 *
 *   - THE CARD IS THE MAP. A live viewport, not a door to a page: drag to pan,
 *     pinch or wheel to zoom, quiet zoom buttons, and a recentre mark that
 *     appears only once the reader has moved. There is no full-screen step.
 *   - PARCHMENT RELIEF (atlas treatment a). Parchment land, the shipped
 *     hillshade under a hypsometric ramp multiplied onto it, and the sea
 *     painted back over the raster's own water through the flood-filled sea
 *     mask (public/map/sea.png). The coast is strokes only: the coastline
 *     layer is open lines, so no polygon fill can tell land from sea. The
 *     relief is the opt-in 700 KB raster, fetched only once the card is on
 *     screen and faded in when it lands; until then the card is finished
 *     parchment, not a placeholder.
 *   - LABELS are sized to the frame and placed greedily so none collides or
 *     leaves the frame (diveMap.ts). Fixed bearings stay faint. They scale
 *     with zoom like a printed map's.
 *   - THE JOURNEY: the whole route faint with an open chevron on every leg,
 *     one leg lit, its chevron riding the tip as it draws in on the calm curve
 *     (950 ms, driven per frame). The strip of stops under the map is the
 *     control — past is ink, present accent, future a hairline; a leg is
 *     chosen by its own segment or the dot it arrives at, never the dot it
 *     leaves — and the caption is a carousel that slides with the step, with
 *     chevrons at its sides so nobody has to discover the swipe. Every leg is
 *     a solid line; the silent stretch is explained in its caption.
 *   - MOTION lives in motion.css inside the reduced-motion guard; the one
 *     JavaScript-driven piece (the draw-in) checks the same preference and
 *     simply draws the finished leg under it.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TranslationId } from '../bible/provider'
import { getBibleVerse } from '../bible/service'
import { bookByNumber } from '../utils/bibleBooks'
import {
  arrowPull,
  chevronPathData,
  easeCalm,
  inFrame,
  legBows,
  legPathData,
  placeLabels,
  type XY
} from '../utils/diveMap'
import { placesForVerse, type ChapterMap } from '../utils/diveMapLoader'
import { loadMapArtwork, MAP_VIEW_BOX, type MapBaseArtwork } from '../utils/mapData'
import { legArrivalVerse, type RouteLeg } from '../utils/mapDataLoader'
import {
  clampViewBox,
  fitViewBox,
  formatViewBox,
  frameViewBox,
  journeyViewBox,
  panViewBox,
  pinchViewBox,
  toViewBox,
  zoomViewBox,
  type ScreenPoint,
  type ViewBox
} from '../utils/mapViewport'
import { growClosed, growOpen } from '../utils/measuredHeight'
import { usePrefersReducedMotion } from '../utils/useChapterNavigation'
import Marked from './Marked'

interface Props {
  map: ChapterMap
  /** The verse the reader is holding: its places are drawn a shade stronger. */
  verse: number
  /** The translation on screen, for each leg's verse in the caption. */
  translation: TranslationId
  /** Opens the whole map (MapView) framed on this chapter, when the app offers it. */
  onOpenWhole?: () => void
}

/** Matches --dur-5: how long the lit leg takes to draw itself in. */
const DRAW_MS = 950
/** The card can zoom this far past its home frame. */
const MAX_ZOOM = 6
/** Pixels of sideways travel that count as a swipe on the caption. */
const SWIPE_PX = 40

const EXTENT = toViewBox(MAP_VIEW_BOX)

// The hypsometric ramp over the hillshade's luminance — the atlas mockup's
// treatment (a). Luminance is not elevation; this is what the colour would do
// drawn from the only raster we ship, which the atlas note says plainly.
const HYP_R = '0.42 0.55 0.66 0.76 0.85 0.91 0.96'
const HYP_G = '0.36 0.47 0.57 0.68 0.79 0.87 0.93'
const HYP_B = '0.20 0.26 0.33 0.44 0.58 0.72 0.86'

// ── leg verses: the arrival verse of each citation, once per chapter ────────
const chapterTexts = new Map<string, Promise<Map<number, string> | null>>()
function chapterText(
  book: number,
  chapter: number,
  translation: TranslationId
): Promise<Map<number, string> | null> {
  const key = `${book}/${chapter}/${translation}`
  let p = chapterTexts.get(key)
  if (!p) {
    const name = bookByNumber(book)?.name
    p = name
      ? getBibleVerse(`${name} ${chapter}`, translation)
          .then(passage => {
            if (!passage) return null
            return new Map(passage.verses.map(line => [line.verse, line.text]))
          })
          .catch(() => null)
      : Promise.resolve(null)
    p.then(v => {
      if (v === null) chapterTexts.delete(key)
    })
    chapterTexts.set(key, p)
  }
  return p
}

/** What one leg says under the map. */
function legTitle(leg: RouteLeg): string {
  return `${leg.from.name} to ${leg.to.name}${leg.via ? `, through ${leg.via}` : ''}`
}

export default function DiveMap({
  map,
  verse,
  translation,
  onOpenWhole
}: Props): React.ReactElement {
  const reduced = usePrefersReducedMotion()
  const route = map.route
  const legs = useMemo(() => route?.legs ?? [], [route])
  const [artwork, setArtwork] = useState<MapBaseArtwork | null>(null)
  const [reliefReady, setReliefReady] = useState(false)
  const [wantRelief, setWantRelief] = useState(false)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [lit, setLit] = useState(0)
  const [moved, setMoved] = useState(false)
  const [legText, setLegText] = useState<Record<string, string | null>>({})

  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const litRef = useRef<SVGPathElement>(null)
  const arrowRef = useRef<SVGPathElement>(null)
  const faintRefs = useRef<(SVGPathElement | null)[]>([])
  const [faintArrows, setFaintArrows] = useState<string[]>([])

  // ── data the card fetches itself: artwork now, relief once it is on screen ──
  useEffect(() => {
    let live = true
    loadMapArtwork()
      .then(a => live && setArtwork(a))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    // The relief is the opt-in raster: ask for it only once the card has been
    // on screen for a moment, so the parchment is finished before it arrives.
    const t = window.setTimeout(() => setWantRelief(true), 600)
    return () => window.clearTimeout(t)
  }, [])

  // ── the frame: measured, then fitted to the journey or the chapter's places ──
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const read = (): void => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize({ width: r.width, height: r.height })
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useMemo(() => (size ? fitViewBox(EXTENT, size) : null), [size])
  const home = useMemo<ViewBox | null>(() => {
    if (!size || !fit) return null
    const points: XY[] = route ? route.stops : map.places
    if (points.length === 0) return fit
    return route
      ? journeyViewBox(points, size, EXTENT, fit, { padding: 0.28, minSpan: 60 })
      : frameViewBox(points, size, EXTENT, fit, { padding: 0.3, minSpan: 60 })
  }, [size, fit, route, map.places])

  const [vb, setVb] = useState<ViewBox | null>(null)
  const vbRef = useRef<ViewBox | null>(null)
  useEffect(() => {
    // A new home (first measure, or a resize) recentres unless the reader has
    // moved the map themselves.
    if (home && (!vbRef.current || !moved)) {
      vbRef.current = home
      setVb(home)
    }
  }, [home, moved])

  const applyLive = useCallback((next: ViewBox) => {
    vbRef.current = next
    svgRef.current?.setAttribute('viewBox', formatViewBox(next))
  }, [])
  const commit = useCallback(
    (next: ViewBox) => {
      applyLive(next)
      setVb(next)
      if (home) {
        setMoved(
          Math.abs(next.x - home.x) > 0.5 ||
            Math.abs(next.y - home.y) > 0.5 ||
            Math.abs(next.w - home.w) > 0.5
        )
      }
    },
    [applyLive, home]
  )
  const rect = useCallback(
    (): DOMRect | null => svgRef.current?.getBoundingClientRect() ?? null,
    []
  )
  // The card's own zoom ceiling: MAX_ZOOM past its HOME frame, expressed in
  // the world-fit terms clampViewBox speaks.
  const maxZoom = useMemo(() => (home && fit ? (fit.w / home.w) * MAX_ZOOM : MAX_ZOOM), [home, fit])
  const clamp = useCallback(
    (next: ViewBox): ViewBox => (fit ? clampViewBox(next, EXTENT, fit, maxZoom) : next),
    [fit, maxZoom]
  )

  // ── gestures ────────────────────────────────────────────────────────────────
  const pointers = useRef(new Map<number, ScreenPoint>())
  const dragged = useRef(false)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragged.current = false
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const prev = pointers.current.get(e.pointerId)
    const r = rect()
    const cur = vbRef.current
    if (!prev || !r || !cur || !fit) return
    const now = { x: e.clientX, y: e.clientY }
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId)
    let next: ViewBox
    if (others.length > 0) {
      const [, o] = others[0]
      next = pinchViewBox(cur, r, [prev, o], [now, o], EXTENT, fit, maxZoom)
    } else {
      next = panViewBox(cur, r, prev, now, EXTENT, fit)
    }
    pointers.current.set(e.pointerId, now)
    dragged.current = true
    applyLive(clamp(next))
  }
  const endPointer = (e: React.PointerEvent<SVGSVGElement>): void => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0 && dragged.current && vbRef.current) commit(vbRef.current)
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent): void => {
      const r = rect()
      const cur = vbRef.current
      if (!r || !cur || !fit) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      commit(zoomViewBox(cur, r, factor, { x: e.clientX, y: e.clientY }, EXTENT, fit, maxZoom))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [commit, fit, maxZoom, rect])
  const zoomBy = (factor: number): void => {
    const r = rect()
    const cur = vbRef.current
    if (!r || !cur || !fit) return
    const centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    commit(zoomViewBox(cur, r, factor, centre, EXTENT, fit, maxZoom))
  }
  const recentre = (): void => {
    if (!home) return
    applyLive(home)
    setVb(home)
    setMoved(false)
  }

  // ── the route: bows, chevrons, the lit leg's draw-in ────────────────────────
  const bows = useMemo(() => legBows(legs), [legs])
  const stops = useMemo(() => {
    if (!route) return []
    const byPoint = new Map<string, { x: number; y: number; name: string; orders: number[] }>()
    for (const s of route.stops) {
      const k = `${s.x},${s.y}`
      const cur = byPoint.get(k)
      if (cur) cur.orders.push(s.order)
      else byPoint.set(k, { x: s.x, y: s.y, name: s.name, orders: [s.order] })
    }
    return [...byPoint.values()]
  }, [route])
  const current = legs[lit] ?? null

  const w = home?.w ?? EXTENT.w
  // Map units per screen pixel at the home frame: every size below is stated
  // in pixels and converted, so a label is 11 px whether the card is a phone
  // width or a desktop panel. Zooming scales them from there, like a printed
  // map's type under a glass.
  const unit = size ? w / size.width : 1
  const px = useCallback((n: number): number => n * unit, [unit])
  const pull = arrowPull(px(354)) // = 3.2 px dot + 1.6 px halo, in map units

  // Faint chevrons need the DOM (path lengths), so they are read once the
  // legs are in the document and again whenever the frame changes.
  useLayoutEffect(() => {
    if (!home) return
    setFaintArrows(
      faintRefs.current.map(path => {
        if (!path) return ''
        const len = path.getTotalLength()
        const at = Math.max(0, len - pull)
        const p = path.getPointAtLength(at)
        const b = path.getPointAtLength(Math.max(0, at - 1))
        return chevronPathData(p, Math.atan2(p.y - b.y, p.x - b.x), px(5))
      })
    )
  }, [home, legs, pull, px])

  useEffect(() => {
    const path = litRef.current
    const arrow = arrowRef.current
    const svg = svgRef.current
    if (!path || !arrow || !svg || !current || !home) return
    const len = path.getTotalLength()
    const endAt = Math.max(0, len - pull)
    const size = px(6.5)
    const shapeAt = (at: number): string => {
      const p = path.getPointAtLength(at)
      const b = path.getPointAtLength(Math.max(0, at - 1))
      return chevronPathData(p, Math.atan2(p.y - b.y, p.x - b.x), size)
    }
    const settle = (): void => {
      path.style.strokeDasharray = ''
      path.style.strokeDashoffset = ''
      arrow.setAttribute('d', shapeAt(endAt))
      arrow.style.opacity = '1'
    }
    if (reduced) {
      settle()
      return
    }
    // One motion on the calm curve: the line extends from its start and the
    // chevron rides its tip, so the arrow IS the front of the line. The reveal
    // is a dash in SCREEN pixels (the stroke does not scale with the map) and
    // it is a transient: cleared the moment the leg is complete, and at once
    // on any pan or zoom (which re-runs this effect through `vb`).
    const scale = svg.getBoundingClientRect().width / (vbRef.current?.w ?? home.w)
    const dashPx = len * scale
    path.style.strokeDasharray = `${dashPx}`
    path.style.strokeDashoffset = `${dashPx}`
    arrow.style.opacity = '1'
    const t0 = performance.now()
    let frame = 0
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / DRAW_MS)
      const e = easeCalm(t)
      path.style.strokeDashoffset = `${dashPx * (1 - e)}`
      arrow.setAttribute('d', shapeAt(Math.max(pull, endAt * e)))
      if (t < 1) frame = requestAnimationFrame(step)
      else settle()
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      settle()
    }
    // `vb` is a dependency on purpose: a pan or zoom mid-draw completes it.
  }, [current, home, pull, reduced, px, vb])

  // ── leg verses ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!route) return
    let live = true
    for (const leg of route.legs) {
      if (!leg.ref) continue
      const at = legArrivalVerse(leg.ref)
      if (!at) continue
      chapterText(map.book, at.chapter, translation).then(lines => {
        if (!live) return
        setLegText(prev => ({ ...prev, [leg.ref!]: lines?.get(at.verse) ?? null }))
      })
    }
    return () => {
      live = false
    }
  }, [route, map.book, translation])

  // The strip settles one segment after another in the direction of travel
  // on a jump of several legs (90 ms apart), so `prevLit` decides each delay.
  const prevLit = useRef(0)
  useEffect(() => {
    prevLit.current = lit
  }, [lit])
  const stagger = (i: number): number => {
    const from = prevLit.current
    const dist = lit > from ? i - from : from - i
    return Math.max(0, Math.min(dist, Math.abs(lit - from))) * 90
  }
  const stepTo = (next: number): void => {
    if (!route) return
    setLit(Math.max(0, Math.min(route.legs.length - 1, next)))
  }

  // ── the caption: a carousel, swiped or stepped with the chevrons ────────────
  const swipe = useRef<ScreenPoint | null>(null)
  const onCapDown = (e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest('.dive-cap-nav')) return
    swipe.current = { x: e.clientX, y: e.clientY }
  }
  const onCapUp = (e: React.PointerEvent): void => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5)
      stepTo(lit + (dx < 0 ? 1 : -1))
  }
  const toggleText = (e: React.MouseEvent<HTMLParagraphElement>): void => {
    const el = e.currentTarget
    if (el.classList.contains('is-open')) growClosed(el)
    else growOpen(el)
  }

  // ── labels ──────────────────────────────────────────────────────────────────
  const fontSize = px(11)
  const places = useMemo(() => placesForVerse(map, verse), [map, verse])
  const routeNames = useMemo(() => new Set(stops.map(s => s.name)), [stops])
  const labelled = useMemo(() => {
    if (!home) return []
    const plain = route ? places.filter(p => !routeNames.has(p.name)) : places
    return placeLabels(plain, home, fontSize)
  }, [home, places, route, routeNames, fontSize])
  const bearings = useMemo(
    () => (home ? map.bearings.filter(b => inFrame(b, home, w * 0.6)) : []),
    [home, map.bearings, w]
  )

  const view = vb ?? home
  const terrain = artwork?.terrain ?? null
  const sea = artwork?.sea ?? null
  const relief = wantRelief && terrain && sea

  return (
    <div className={`dive-map${route ? ' has-journey' : ''}${moved ? ' is-moved' : ''}`}>
      <div className="dive-map-stage" ref={stageRef}>
        {view && (
          <svg
            ref={svgRef}
            className="dive-map-svg"
            viewBox={formatViewBox(view)}
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            style={{ fontSize }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onDoubleClick={e => {
              const r = rect()
              const cur = vbRef.current
              if (!r || !cur || !fit) return
              commit(zoomViewBox(cur, r, 1.8, { x: e.clientX, y: e.clientY }, EXTENT, fit, maxZoom))
            }}
          >
            <defs>
              <filter id="dive-hyp" colorInterpolationFilters="sRGB">
                <feComponentTransfer>
                  <feFuncR type="table" tableValues={HYP_R} />
                  <feFuncG type="table" tableValues={HYP_G} />
                  <feFuncB type="table" tableValues={HYP_B} />
                </feComponentTransfer>
              </filter>
              {sea && (
                <mask
                  id="dive-sea"
                  maskUnits="userSpaceOnUse"
                  x={EXTENT.x}
                  y={EXTENT.y}
                  width={EXTENT.w}
                  height={EXTENT.h}
                >
                  <image
                    href={sea.url}
                    x={EXTENT.x}
                    y={EXTENT.y}
                    width={EXTENT.w}
                    height={EXTENT.h}
                    preserveAspectRatio="none"
                  />
                </mask>
              )}
            </defs>
            {/* land, the relief over it, then the sea painted back through its mask */}
            <rect
              className="dive-land"
              x={EXTENT.x - 20}
              y={EXTENT.y - 20}
              width={EXTENT.w + 40}
              height={EXTENT.h + 40}
            />
            {relief && (
              <image
                className={`dive-relief${reliefReady ? ' is-ready' : ''}`}
                href={terrain.url}
                x={EXTENT.x}
                y={EXTENT.y}
                width={EXTENT.w}
                height={EXTENT.h}
                preserveAspectRatio="none"
                filter="url(#dive-hyp)"
                onLoad={() => setReliefReady(true)}
              />
            )}
            {sea ? (
              <rect
                className="dive-sea"
                x={EXTENT.x}
                y={EXTENT.y}
                width={EXTENT.w}
                height={EXTENT.h}
                mask="url(#dive-sea)"
              />
            ) : null}
            {artwork && (
              <g className="dive-artwork">
                {artwork.layers.lakes.map((d, i) => (
                  <path key={`l${i}`} className="dive-lake" d={d} />
                ))}
                {artwork.layers.rivers.map((d, i) => (
                  <path key={`r${i}`} className="dive-river" d={d} />
                ))}
                {artwork.layers.coastline.map((d, i) => (
                  <path key={`c${i}`} className="dive-coast" d={d} />
                ))}
              </g>
            )}
            <text
              className="dive-sea-label"
              style={{ fontSize: px(8) }}
              x={map.sea.x}
              y={map.sea.y}
              textAnchor="middle"
              transform={`rotate(-8 ${map.sea.x} ${map.sea.y})`}
            >
              The Great Sea
            </text>
            {bearings.map(b => (
              <g key={b.name} className="dive-bearing" style={{ fontSize: px(9) }}>
                <circle cx={b.x} cy={b.y} r={px(1.4)} />
                <text x={b.x + px(4)} y={b.y - px(3)}>
                  {b.name}
                </text>
              </g>
            ))}
            {route && (
              <g className="dive-route">
                {legs.map((leg, i) => (
                  <path
                    key={`leg${i}`}
                    ref={el => {
                      faintRefs.current[i] = el
                    }}
                    className={`dive-leg${i < lit ? ' is-done' : ''}`}
                    d={legPathData(leg.from, leg.to, bows[i])}
                  />
                ))}
                {faintArrows.map((d, i) =>
                  d ? (
                    <path
                      key={`arrow${i}`}
                      className={`dive-chevron is-faint${i < lit ? ' is-done' : ''}`}
                      d={d}
                    />
                  ) : null
                )}
                {current && (
                  <>
                    <path
                      ref={litRef}
                      key={`lit${lit}`}
                      className="dive-leg-lit"
                      d={legPathData(current.from, current.to, bows[lit])}
                    />
                    <path
                      ref={arrowRef}
                      className="dive-chevron is-lit"
                      d=""
                      style={{ opacity: 0 }}
                    />
                  </>
                )}
                {stops.map(s => {
                  const on =
                    current !== null &&
                    (s.orders.includes(current.from.order) || s.orders.includes(current.to.order))
                  const done = !on && current !== null && s.orders.some(o => o < current.from.order)
                  return (
                    <g
                      key={`${s.x},${s.y}`}
                      className={`dive-stop${on ? ' is-on' : ''}${done ? ' is-done' : ''}`}
                    >
                      <circle cx={s.x} cy={s.y} r={px(3.2)} />
                      <text x={s.x + px(6)} y={s.y + px(3.5)}>
                        {s.name}
                      </text>
                    </g>
                  )
                })}
              </g>
            )}
            {labelled.map(l => (
              <g
                key={`${l.item.x},${l.item.y}`}
                className={`dive-place${l.item.inVerse ? ' in-verse' : ''}`}
              >
                <circle cx={l.item.x} cy={l.item.y} r={px(2.7)} />
                <text x={l.x} y={l.y} textAnchor={l.anchor}>
                  {l.item.name}
                </text>
              </g>
            ))}
          </svg>
        )}
        <div className="dive-map-tools">
          <button type="button" onClick={() => zoomBy(1.5)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="dive-map-home" onClick={recentre} aria-label="Recentre">
            ⌖
          </button>
        </div>
      </div>

      {route && (
        <>
          <div className="dive-legs" role="group" aria-label={route.title}>
            {legs.map((_, i) => (
              <span
                key={`seg${i}`}
                className={`dive-seg${i < lit ? ' is-done' : i === lit ? ' is-cur' : ''}`}
                style={{
                  left: `calc(var(--pad) + (100% - 2 * var(--pad)) * ${(i / legs.length).toFixed(4)})`,
                  width: `calc((100% - 2 * var(--pad)) * ${(1 / legs.length).toFixed(4)})`,
                  transitionDelay: `${stagger(i)}ms`
                }}
                aria-hidden="true"
              />
            ))}
            {Array.from({ length: legs.length + 1 }, (_, i) => {
              const name = i === 0 ? legs[0].from.name : legs[i - 1].to.name
              const cls = i === lit || i === lit + 1 ? ' is-on' : i < lit ? ' is-done' : ''
              return (
                <span
                  key={`node${i}`}
                  className={`dive-node${cls}${i % 2 ? ' is-low' : ''}`}
                  style={{
                    left: `calc(var(--pad) + (100% - 2 * var(--pad)) * ${(i / legs.length).toFixed(4)})`,
                    transitionDelay: `${stagger(lit > prevLit.current ? i - 1 : i)}ms`
                  }}
                  aria-hidden="true"
                >
                  <i className="dive-node-dot" />
                  <span className="dive-node-name">{name}</span>
                </span>
              )
            })}
            {legs.map((leg, i) => (
              <button
                key={`hit${i}`}
                type="button"
                className="dive-hit"
                aria-label={legTitle(leg)}
                aria-pressed={i === lit}
                onClick={() => stepTo(i)}
                style={{
                  left:
                    i === 0
                      ? `calc(var(--pad) - 28px)`
                      : `calc(var(--pad) + (100% - 2 * var(--pad)) * ${(i / legs.length).toFixed(4)} + 10px)`,
                  width:
                    i === 0
                      ? `calc((100% - 2 * var(--pad)) * ${(1 / legs.length).toFixed(4)} + 38px)`
                      : `calc((100% - 2 * var(--pad)) * ${(1 / legs.length).toFixed(4)})`
                }}
              />
            ))}
          </div>
          <div className="dive-cap" onPointerDown={onCapDown} onPointerUp={onCapUp}>
            <button
              type="button"
              className="dive-cap-nav is-prev"
              aria-label="Previous leg"
              disabled={lit === 0}
              onClick={() => stepTo(lit - 1)}
            >
              ‹
            </button>
            <div className="dive-cap-viewport">
              <div className="dive-cap-track" style={{ transform: `translateX(-${lit * 100}%)` }}>
                {legs.map((leg, i) => (
                  <div className="dive-cap-slide" key={`slide${i}`} aria-hidden={i !== lit}>
                    <span className="dive-cap-head">
                      <span className="dive-cap-n">
                        {i + 1} of {legs.length}
                      </span>
                      <b>{legTitle(leg)}</b>
                      {leg.ref && <span className="dive-cap-ref">{leg.ref}</span>}
                    </span>
                    <p
                      className={`dive-cap-text clamp${leg.silent ? ' is-muted' : ''}`}
                      onClick={toggleText}
                    >
                      {leg.silent ? (
                        (leg.note ?? 'The text is silent here.')
                      ) : leg.ref && legText[leg.ref] ? (
                        <Marked
                          text={legText[leg.ref]!}
                          names={[leg.from.name, leg.to.name, leg.via ?? '']}
                        />
                      ) : (
                        ' '
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="dive-cap-nav is-next"
              aria-label="Next leg"
              disabled={lit === legs.length - 1}
              onClick={() => stepTo(lit + 1)}
            >
              ›
            </button>
          </div>
        </>
      )}
      {!route && (
        <p className="dive-cap-places">
          <b>Where this chapter happens</b>
          <span>{placeList(places.map(p => p.name))}</span>
        </p>
      )}
      {onOpenWhole && (
        <button type="button" className="dive-map-whole" onClick={onOpenWhole}>
          The whole map →
        </button>
      )}
    </div>
  )
}

function placeList(names: string[]): string {
  const list = [...new Set(names)]
  if (list.length <= 1) return list[0] ?? ''
  const last = list.pop()
  return `${list.join(', ')} and ${last}`
}

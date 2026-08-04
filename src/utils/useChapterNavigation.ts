import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { bookByNumber } from './bibleBooks'

/* ─── Cross-chapter reading ───────────────────────────────────────────────────
   Moving to the next chapter should feel like turning a page, not like using a
   picker. Three pieces make that true, and they are deliberately separate:

   1. RESOLUTION (adjacentChapter) — pure. Where does "next" go from here,
      including across a book boundary, and where does it stop? No DOM, no
      React, so every canon edge (Genesis 1 has no previous, Revelation 22 has
      no next, Malachi 4 → Matthew 1) is a plain unit test.
   2. THE GESTURE (swipeDecision / axisLock / dragOffset) — also pure. What a
      released drag MEANS is the part that decides whether the feel is right,
      so it is decided by functions you can test rather than by thresholds
      buried in an event handler.
   3. THE MACHINERY (useChapterSwipe / useChapterPreload) — the React/DOM edge.

   This is NOT infinite scroll, on purpose: Lantern's notes are anchored per
   chapter, so a chapter stays a discrete unit and only one chapter is ever the
   current one. The smoothness comes from PRELOADING the neighbours (so the
   incoming chapter has its text already) rather than from blurring the
   boundary between them. See docs/BACKLOG.md.
   ──────────────────────────────────────────────────────────────────────────── */

export interface ChapterRef {
  bookNumber: number
  bookName: string
  chapter: number
}

/** "Acts 1" — the label the prev/next affordances show. */
export function chapterLabel(ref: ChapterRef): string {
  return `${ref.bookName} ${ref.chapter}`
}

/** Stable identity for a chapter, for cache keys and React keys. */
export function chapterKeyOf(ref: ChapterRef): string {
  return `${ref.bookNumber}:${ref.chapter}`
}

/**
 * The chapter `delta` steps from (bookNumber, chapter), rolling over book
 * boundaries in canonical order, or null when there is nowhere to go.
 *
 * Book-relative rather than a flat chapter index on purpose: chapter counts
 * live in bibleBooks.ts and the caller needs the book NAME back (scripture is
 * fetched by reference), so resolving through the book table is both the
 * shorter path and the one that cannot drift from the canon list.
 */
export function adjacentChapter(
  bookNumber: number,
  chapter: number,
  delta: number
): ChapterRef | null {
  if (delta !== 1 && delta !== -1) return null
  const book = bookByNumber(bookNumber)
  if (!book) return null
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return null

  const within = chapter + delta
  if (within >= 1 && within <= book.chapters) {
    return { bookNumber: book.number, bookName: book.name, chapter: within }
  }

  // Off the end of the book: roll into the neighbouring book, landing on the
  // chapter you'd actually be reading next (its first, or its last going back).
  // bookByNumber returns undefined outside 1-66, which is exactly the graceful
  // stop at Genesis 1 and Revelation 22.
  const neighbour = bookByNumber(book.number + delta)
  if (!neighbour) return null
  return {
    bookNumber: neighbour.number,
    bookName: neighbour.name,
    chapter: delta === 1 ? 1 : neighbour.chapters
  }
}

/* ─── Gesture feel ──────────────────────────────────────────────────────────── */

/** Travel (px) on either axis before a drag is claimed by one of them. */
export const SWIPE_AXIS_LOCK = 10
/** Fraction of the pane's width a slow drag must cross to commit. */
export const SWIPE_COMMIT_FRACTION = 0.26
/** px/ms at which a short drag still counts as a flick. */
export const SWIPE_FLICK_VELOCITY = 0.4
/** A flick still has to be a real movement, not a jittery tap. */
export const SWIPE_FLICK_MIN_DISTANCE = 24
/** How much of the finger's travel a dead end (Genesis 1 / Revelation 22) gives. */
export const SWIPE_EDGE_RESISTANCE = 0.28
/** Settle animation for a committed swipe / a tapped affordance. */
export const SWIPE_SETTLE_MS = 260
/** Snap-back animation when a drag is released short of committing. */
export const SWIPE_SNAPBACK_MS = 200

export type AxisLock = 'none' | 'horizontal' | 'vertical'

/**
 * Which axis owns this gesture yet. Locking (rather than reacting to every
 * move) is what stops a thumb drifting sideways during a vertical scroll from
 * dragging the chapter half off screen.
 */
export function axisLock(dx: number, dy: number): AxisLock {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < SWIPE_AXIS_LOCK && ay < SWIPE_AXIS_LOCK) return 'none'
  return ax > ay ? 'horizontal' : 'vertical'
}

export interface SwipeRelease {
  /** Horizontal travel; negative = dragged left = reaching for the next chapter. */
  dx: number
  /** Width of the pane being dragged. */
  width: number
  /** Duration of the gesture, for the flick test. */
  elapsedMs: number
}

/**
 * What a released drag means: 1 = go to the next chapter, -1 = previous,
 * 0 = snap back.
 *
 * Two ways to commit, because two gestures mean the same thing to a reader: a
 * deliberate drag past roughly a quarter of the screen, or a quick flick that
 * never travels that far. Requiring distance alone makes flicking feel broken;
 * accepting velocity alone makes a fast scroll-correction turn the page.
 */
export function swipeDecision(release: SwipeRelease): number {
  const distance = Math.abs(release.dx)
  if (distance === 0) return 0
  const direction = release.dx < 0 ? 1 : -1
  const width = release.width > 0 ? release.width : 1

  if (distance >= width * SWIPE_COMMIT_FRACTION) return direction

  const velocity = release.elapsedMs > 0 ? distance / release.elapsedMs : 0
  if (velocity >= SWIPE_FLICK_VELOCITY && distance >= SWIPE_FLICK_MIN_DISTANCE) return direction

  return 0
}

/**
 * How far the pane actually moves for a given finger travel. 1:1 when there is
 * a chapter that way (the page should track the finger), heavily damped when
 * there isn't — the rubber-band that says "this is the end" without a dialog.
 */
export function dragOffset(dx: number, hasTarget: boolean): number {
  return hasTarget ? dx : dx * SWIPE_EDGE_RESISTANCE
}

/* ─── Reduced motion ────────────────────────────────────────────────────────── */

/**
 * Live `prefers-reduced-motion: reduce`. The CSS layer already refuses to
 * animate for these readers (see motion.css); the gesture needs the same fact
 * in JS so it can swap chapters instantly instead of sliding them.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (): void => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/* ─── Neighbour preload ─────────────────────────────────────────────────────── */

/** Neighbours retained at once. Small: a chapter of text is not free. */
const PRELOAD_CACHE_LIMIT = 6

function idle(run: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const handle = w.requestIdleCallback(run, { timeout: 1200 })
    return () => w.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(run, 250)
  return () => window.clearTimeout(handle)
}

/**
 * Fetch the given neighbours in the background and hand back whatever has
 * arrived. `load` is injected so this stays free of the scripture layer (and
 * so a caller can decline to preload a metered translation).
 *
 * Loading is scheduled at idle: the chapter you are actually reading must
 * never queue behind the one you might read next.
 */
export function useChapterPreload<T>(
  targets: (ChapterRef | null)[],
  cacheKey: (ref: ChapterRef) => string,
  load: (ref: ChapterRef) => Promise<T>,
  enabled: boolean
): (ref: ChapterRef | null) => T | undefined {
  const cache = useRef(new Map<string, T>())
  const inFlight = useRef(new Set<string>())
  const [, bump] = useState(0)

  const loadRef = useRef(load)
  loadRef.current = load
  const cacheKeyRef = useRef(cacheKey)
  cacheKeyRef.current = cacheKey

  // Effects key off a stable string, not the array identity a render rebuilds.
  const signature = targets.map(t => (t ? cacheKey(t) : '-')).join('|')
  const targetsRef = useRef(targets)
  targetsRef.current = targets

  useEffect(() => {
    if (!enabled) return
    return idle(() => {
      for (const target of targetsRef.current) {
        if (!target) continue
        const key = cacheKeyRef.current(target)
        if (cache.current.has(key) || inFlight.current.has(key)) continue
        inFlight.current.add(key)
        loadRef
          .current(target)
          .then(value => {
            cache.current.set(key, value)
            // Keep the map bounded — Map preserves insertion order, so the
            // oldest entry is simply the first key.
            while (cache.current.size > PRELOAD_CACHE_LIMIT) {
              const oldest = cache.current.keys().next().value
              if (oldest === undefined) break
              cache.current.delete(oldest)
            }
            bump(n => n + 1)
          })
          .catch(() => {
            /* a neighbour that won't load just isn't preloaded */
          })
          .finally(() => inFlight.current.delete(key))
      }
    })
  }, [signature, enabled])

  return useCallback((ref: ChapterRef | null): T | undefined => {
    if (!ref) return undefined
    return cache.current.get(cacheKeyRef.current(ref))
  }, [])
}

/* ─── The gesture itself ────────────────────────────────────────────────────── */

export interface ChapterSwipeOptions {
  /** The element that slides. Transform is written straight to it, never via state. */
  trackRef: React.RefObject<HTMLElement | null>
  /** Identity of the chapter on screen; a change ends the settle animation. */
  chapterKey: string
  /** Is there a chapter in this direction (1 = next, -1 = previous)? */
  canGo: (delta: number) => boolean
  /** Commit: move the app to the chapter `delta` steps away. */
  onNavigate: (delta: number) => void
  reducedMotion: boolean
  enabled: boolean
}

export interface ChapterSwipeState {
  /** Which neighbour to render alongside the current chapter: -1, 0 or 1. */
  peek: number
  /** True while a finger owns the gesture or a settle is running. */
  sliding: boolean
  /**
   * True for exactly the render in which a committed swipe's destination has
   * become the current chapter but `peek` has not been torn down yet.
   *
   * That single render is the handover: the neighbour already on screen IS the
   * new chapter, so the caller must render it as the primary pane (same React
   * key, hence the same DOM — no remount, no flash) and must NOT mount a fresh
   * neighbour for the chapter beyond it, which would be built and thrown away
   * one frame later.
   */
  promoting: boolean
  onPointerDown: (e: React.PointerEvent) => void
  /** Same transition, driven by the prev/next affordances. */
  go: (delta: number) => void
}

/**
 * Touch-drag between chapters.
 *
 * Two decisions worth knowing about:
 *
 * - The transform is written imperatively to the track on each pointermove
 *   (coalesced into one rAF). Routing finger position through React state
 *   would re-render the whole chapter — notes, rail and all — dozens of times
 *   per gesture, which is exactly how a 60fps drag becomes a 20fps one.
 * - TOUCH ONLY. A mouse drag over scripture is already the marquee verse
 *   selection (see useVerseMarquee, which guards the same way from the other
 *   side); desktop navigates with the prev/next affordances instead.
 */
export function useChapterSwipe(options: ChapterSwipeOptions): ChapterSwipeState {
  const { trackRef, chapterKey, canGo, onNavigate, reducedMotion, enabled } = options

  const [peek, setPeek] = useState(0)
  const [sliding, setSliding] = useState(false)

  const gesture = useRef<{
    pointerId: number
    startX: number
    startY: number
    startedAt: number
    lock: AxisLock
    dx: number
  } | null>(null)
  // Set from the moment a commit begins until the new chapter has rendered, so
  // a second swipe can't start mid-flight.
  const settling = useRef(false)
  const frame = useRef(0)
  const settleTimer = useRef(0)
  // A `go()` that has mounted its neighbour and is waiting for the layout
  // effect below to start the animation.
  const queued = useRef(0)
  // The chapter the deck was showing when the current commit started. While the
  // settle runs it equals `chapterKey`; the moment the navigation lands they
  // differ, and that difference is the handover render (see `promoting`).
  const committedFrom = useRef<string | null>(null)

  const latest = useRef({ canGo, onNavigate, reducedMotion, enabled, chapterKey })
  latest.current = { canGo, onNavigate, reducedMotion, enabled, chapterKey }

  const writeTransform = useCallback(
    (x: number): void => {
      const el = trackRef.current
      if (!el) return
      el.style.transform = x === 0 ? '' : `translate3d(${x}px, 0, 0)`
    },
    [trackRef]
  )

  const clearTrack = useCallback((): void => {
    const el = trackRef.current
    if (el) {
      el.style.transition = ''
      el.style.transform = ''
    }
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    if (settleTimer.current) {
      window.clearTimeout(settleTimer.current)
      settleTimer.current = 0
    }
  }, [trackRef])

  // The committed chapter has rendered — drop the animation and the neighbour
  // in the same frame the new content lands in, so nothing flashes.
  useLayoutEffect(() => {
    if (!settling.current) return
    settling.current = false
    committedFrom.current = null
    clearTrack()
    setPeek(0)
    setSliding(false)
  }, [chapterKey, clearTrack])

  const commit = useCallback(
    (delta: number): void => {
      const el = trackRef.current
      // How far the pane must travel to put the neighbour exactly where the
      // real chapter will render. MEASURED from the mounted neighbour rather
      // than assumed to be the pane width, so the gutter between chapters can
      // change in CSS without the landing drifting by that many pixels.
      const peekPane = el?.querySelector('.chapter-pane--peek') as HTMLElement | null
      const width = peekPane ? Math.abs(peekPane.offsetLeft) : (el?.offsetWidth ?? 0)
      if (!el || width === 0 || latest.current.reducedMotion) {
        clearTrack()
        setPeek(0)
        setSliding(false)
        latest.current.onNavigate(delta)
        return
      }

      settling.current = true
      committedFrom.current = latest.current.chapterKey
      setSliding(true)
      el.style.transition = `transform ${SWIPE_SETTLE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
      // One frame of headroom so the browser has a start value to animate FROM
      // (a transform set in the same frame the transition is declared jumps).
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        writeTransform(-delta * width)
      })

      const finish = (): void => {
        el.removeEventListener('transitionend', onEnd)
        if (settleTimer.current) {
          window.clearTimeout(settleTimer.current)
          settleTimer.current = 0
        }
        latest.current.onNavigate(delta)
        // Nothing re-rendered (a navigation that changed nothing, or an
        // unchanged key) — never strand the reader on a shifted pane.
        settleTimer.current = window.setTimeout(() => {
          settleTimer.current = 0
          if (!settling.current) return
          settling.current = false
          clearTrack()
          setPeek(0)
          setSliding(false)
        }, 60)
      }
      const onEnd = (e: TransitionEvent): void => {
        if (e.target === el && e.propertyName === 'transform') finish()
      }
      el.addEventListener('transitionend', onEnd)
      // transitionend can be missed (a backgrounded tab, an interrupted
      // animation); the swap must happen regardless.
      settleTimer.current = window.setTimeout(finish, SWIPE_SETTLE_MS + 80)
    },
    [trackRef, clearTrack, writeTransform]
  )

  const snapBack = useCallback((): void => {
    const el = trackRef.current
    if (!el) {
      setPeek(0)
      setSliding(false)
      return
    }
    el.style.transition = `transform ${SWIPE_SNAPBACK_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
    writeTransform(0)
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = 0
      clearTrack()
      setPeek(0)
      setSliding(false)
    }, SWIPE_SNAPBACK_MS + 40)
  }, [trackRef, writeTransform, clearTrack])

  // A tapped affordance runs the same slide: mount the neighbour first, then
  // animate on the next commit (there is nothing to slide in otherwise).
  useLayoutEffect(() => {
    if (queued.current === 0 || peek !== queued.current) return
    const delta = queued.current
    queued.current = 0
    commit(delta)
  }, [peek, commit])

  const go = useCallback(
    (delta: number): void => {
      if (settling.current || !latest.current.canGo(delta)) return
      if (latest.current.reducedMotion || !trackRef.current) {
        latest.current.onNavigate(delta)
        return
      }
      queued.current = delta
      setPeek(delta)
    },
    [trackRef]
  )

  const onPointerDown = useCallback((e: React.PointerEvent): void => {
    if (!latest.current.enabled) return
    if (e.pointerType !== 'touch') return
    if (settling.current || gesture.current) return
    const target = e.target as HTMLElement
    // Anything that handles its own drag or press keeps it.
    if (
      target.closest(
        'button, a, input, textarea, [contenteditable], .chapter-selector, .verse-action-bar'
      )
    )
      return
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startedAt: performance.now(),
      lock: 'none',
      dx: 0
    }
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY

      if (g.lock === 'none') {
        const lock = axisLock(dx, dy)
        if (lock === 'none') return
        if (lock === 'vertical') {
          // The reader is scrolling; this gesture is not ours.
          gesture.current = null
          return
        }
        g.lock = 'horizontal'
      }

      const direction = dx < 0 ? 1 : -1
      const hasTarget = latest.current.canGo(direction)
      g.dx = dragOffset(dx, hasTarget)

      if (latest.current.reducedMotion) return

      // Mount the neighbour the moment we know which way this is going.
      setPeek(prev => (hasTarget && prev !== direction ? direction : prev))
      setSliding(true)
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const current = gesture.current
        if (!current) return
        const el = trackRef.current
        if (el) el.style.transition = ''
        writeTransform(current.dx)
      })
    }

    const onUp = (e: PointerEvent): void => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      gesture.current = null
      if (g.lock !== 'horizontal') return

      if (frame.current) {
        cancelAnimationFrame(frame.current)
        frame.current = 0
      }

      const width = trackRef.current?.offsetWidth ?? 0
      const delta = swipeDecision({
        dx: g.dx,
        width,
        elapsedMs: performance.now() - g.startedAt
      })

      if (delta !== 0 && latest.current.canGo(delta)) commit(delta)
      else snapBack()
    }

    const onCancel = (e: PointerEvent): void => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      gesture.current = null
      if (g.lock === 'horizontal') snapBack()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [trackRef, writeTransform, commit, snapBack])

  useEffect(() => clearTrack, [clearTrack])

  // Read, never written, during render — the refs it consults are only ever
  // written from effects and handlers, so a StrictMode double render sees the
  // same answer twice.
  const promoting =
    settling.current && committedFrom.current !== null && committedFrom.current !== chapterKey

  return { peek, sliding, promoting, onPointerDown, go }
}

import { useCallback, useEffect, useRef } from 'react'

// Keyboard-aware, flash-free composer reveal (mobile capture).
//
// The problem this solves: focusing a field near the bottom of a long chapter
// makes the on-screen keyboard rise AND makes the browser do its own "scroll the
// focused field into view" jump. Those two happen on different frames, so the
// composer visibly flashes at the wrong place before settling — on iOS it also
// fights any scroll we do ourselves.
//
// The fix, ported from design/mobile-note-capture.html:
//   1. keep the composer invisible (opacity 0) so it never paints at the wrong spot
//   2. SNAP its resting box to the centre of the band above the keyboard while
//      nothing is visible — one instant, invisible scroll, and nothing left for
//      the browser to correct
//   3. focus with preventScroll, in-gesture, so the keyboard rises
//   4. breathe the composer in with the calm curve — the only motion the eye
//      tracks is that settle, riding up with the keyboard
//
// Pure web: visualViewport where available, a cached per-device height otherwise.

// Last measured keyboard height for THIS device, so even the first compose after
// a reload predicts the right height (before that first measurement we fall back
// to a fraction of the viewport). New key — nothing existing is renamed.
const KB_HEIGHT_KEY = 'berean.keyboardHeight'

function readCachedKb(): number {
  try {
    return parseInt(localStorage.getItem(KB_HEIGHT_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}

function writeCachedKb(px: number): void {
  try {
    localStorage.setItem(KB_HEIGHT_KEY, String(px))
  } catch {
    /* ignore — a storage-denied browser just re-measures each time */
  }
}

// Only a genuinely large viewport shrink is a keyboard; a URL bar collapsing is
// not, and caching that would centre every future composer too low.
const MIN_KEYBOARD_PX = 120

// The scroll container the composer actually lives in. On a phone the reading
// surface scrolls .book-detail-layout, not the window (the header/chapter strip
// are sticky siblings of the scripture) — so scrolling `window` would move
// nothing at all. Walk up to whichever ancestor really scrolls.
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    const oy = style.overflowY
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Grow a textarea to fit its content — the composer never shows an inner
// scrollbar, so its final height is known before we centre it.
export function autoGrow(field: HTMLTextAreaElement): void {
  field.style.height = 'auto'
  field.style.height = `${field.scrollHeight}px`
}

export interface KeyboardCompose {
  // Reveal `el` (the composer) with `field` focused, centred in the band between
  // `headerBottom` (viewport px, where usable space starts) and the keyboard.
  reveal: (el: HTMLElement, field: HTMLTextAreaElement, headerBottom: number) => void
  // Best current estimate of the on-screen keyboard height, in px.
  keyboardHeight: () => number
}

export function useKeyboardCompose(): KeyboardCompose {
  const cachedKb = useRef<number>(0)
  if (cachedKb.current === 0) cachedKb.current = readCachedKb()

  // Publish the live keyboard height as --kb so layout (the composer's scroll
  // headroom) can reserve space for it in CSS rather than in JS.
  useEffect(() => {
    const update = (): void => {
      const vv = window.visualViewport
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
      document.documentElement.style.setProperty('--kb', `${kb}px`)
      if (kb > MIN_KEYBOARD_PX && kb !== cachedKb.current) {
        cachedKb.current = kb
        writeCachedKb(kb)
      }
    }
    update()
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--kb')
    }
  }, [])

  const keyboardHeight = useCallback((): number => {
    // Exact once this device has opened a keyboard even once; a sane guess before.
    return cachedKb.current || Math.round(window.innerHeight * 0.42)
  }, [])

  const reveal = useCallback(
    (el: HTMLElement, field: HTMLTextAreaElement, headerBottom: number): void => {
      // (1) hidden — it can never paint at the wrong spot
      el.style.opacity = '0'

      // Size the field to its content FIRST (matters when editing a saved note),
      // so the composer's final height is known before we centre it.
      autoGrow(field)

      // (2) snap the resting box to the centre of the band above the keyboard.
      // The SAME target every time, so the composer always appears in one place.
      const winH = window.innerHeight
      const region = winH - keyboardHeight() - headerBottom
      const desiredTop = headerBottom + Math.max(14, (region - el.offsetHeight) / 2)
      const delta = el.getBoundingClientRect().top - desiredTop
      const container = scrollParent(el)
      if (container) container.scrollTop += delta
      else window.scrollBy(0, delta)

      // (3) focus in-gesture so the keyboard rises; preventScroll so the browser
      // doesn't add its own jump on top of the one we just made.
      field.focus({ preventScroll: true })

      // (4) breathe it in. Commit the from-state with a forced reflow (reliable
      // regardless of paint throttling), then flip to the resting state.
      const reduce = prefersReducedMotion()
      el.style.transform = 'translateY(28px)'
      void el.offsetWidth
      el.style.transition = reduce
        ? 'none'
        : 'opacity 500ms var(--ease-calm), transform 560ms var(--ease-calm)'
      el.style.opacity = '1'
      el.style.transform = 'none'
    },
    [keyboardHeight]
  )

  return { reveal, keyboardHeight }
}

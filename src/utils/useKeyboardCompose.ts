import { useCallback, useEffect } from 'react'

// Keyboard-aware compose plumbing for the mobile note composer.
//
// The problem this solves: on a phone, focusing a textarea raises the software
// keyboard AND makes the browser run its own "scroll the focused field into
// view" pass. If we also scroll, the eye sees two competing jumps — and if the
// composer paints before either lands, it flashes at the wrong place first.
//
// The fix (ported verbatim in spirit from design/mobile-note-capture.html):
//   1. keep the composer invisible while we position it,
//   2. SNAP the page so the composer's resting box already sits centred in the
//      band above where the keyboard will be — nothing visible moved, and
//      there is nothing left for the browser to "fix",
//   3. focus with `preventScroll` inside the tap gesture so the keyboard rises,
//   4. breathe the composer in with the calm curve — the only motion the eye
//      tracks is that gentle settle.
//
// The keyboard height is cached per device (localStorage) so even the FIRST
// compose after a reload predicts the right height rather than guessing.

// Persisted keyboard height. Namespaced like every other stored key in this app
// (`berean.*` — see CLAUDE.md: the internal prefix is deliberately unchanged).
const KB_KEY = 'berean.keyboardHeight'

// Below this a viewport shrink is chrome (URL bar collapsing), not a keyboard.
const KB_MIN = 120

// Fallback share of the window a keyboard occupies, used only until we have
// measured a real one on this device.
const KB_FALLBACK_RATIO = 0.42

// Never let the composer ride up under the sticky reading header.
const MIN_GAP_BELOW_HEADER = 14

let cachedKb = 0

function readCachedKb(): number {
  if (cachedKb) return cachedKb
  try {
    cachedKb = parseInt(window.localStorage.getItem(KB_KEY) || '0', 10) || 0
  } catch {
    cachedKb = 0
  }
  return cachedKb
}

function writeCachedKb(kb: number): void {
  cachedKb = kb
  try {
    window.localStorage.setItem(KB_KEY, String(kb))
  } catch {
    // Private mode / quota — the in-memory value still helps this session.
  }
}

// Current software-keyboard height in CSS pixels, from the visual viewport.
// 0 when there is no keyboard (or no visualViewport support).
export function measureKeyboardHeight(): number {
  const vv = window.visualViewport
  if (!vv) return 0
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
}

/**
 * Where the composer's top edge should end up: centred in the band between the
 * header and the keyboard, but never tucked under the header. Pure so the
 * geometry is reasoned about (and eyeballed) without a browser.
 */
export function composerTop(opts: {
  windowHeight: number
  keyboardHeight: number
  // Viewport y of the header's bottom edge — a rect, not a height, because the
  // reading chrome is sticky inside its own scroller and slides away on scroll.
  headerBottom: number
  composerHeight: number
}): number {
  const region = opts.windowHeight - opts.keyboardHeight - opts.headerBottom
  return opts.headerBottom + Math.max(MIN_GAP_BELOW_HEADER, (region - opts.composerHeight) / 2)
}

// The reading surface scrolls an ELEMENT on mobile (.book-detail-layout), not
// the window, so "scroll by n" has to find whichever ancestor actually moves.
function scrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function scrollBy(el: HTMLElement, delta: number): void {
  const scroller = scrollableAncestor(el)
  if (scroller) scroller.scrollTop += delta
  else window.scrollBy(0, delta)
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

interface KeyboardCompose {
  // Call once, in the tap gesture that opened the composer, with the composer
  // element and the textarea to focus.
  reveal: (composer: HTMLElement, field: HTMLTextAreaElement) => void
}

/**
 * Tracks the software keyboard (publishing its height as the `--kb` custom
 * property on :root, so CSS can reserve room for it) and hands back the
 * single deterministic `reveal` used to open the composer flash-free.
 */
export function useKeyboardCompose(headerSelector: string): KeyboardCompose {
  useEffect(() => {
    const update = (): void => {
      const kb = measureKeyboardHeight()
      document.documentElement.style.setProperty('--kb', `${kb}px`)
      if (kb > KB_MIN && kb !== readCachedKb()) writeCachedKb(kb)
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

  return {
    reveal: useCallback(
      (composer: HTMLElement, field: HTMLTextAreaElement) => {
        // Hidden while we position: it never paints at the wrong spot.
        composer.style.opacity = '0'

        // Size the textarea to its content FIRST (matters when editing a saved
        // note), so the composer's final height is known before we centre it.
        field.style.height = 'auto'
        field.style.height = `${field.scrollHeight}px`

        const header = document.querySelector(headerSelector) as HTMLElement | null
        const desiredTop = composerTop({
          windowHeight: window.innerHeight,
          // Exact after the first keyboard on this device; a sane guess before.
          keyboardHeight: readCachedKb() || Math.round(window.innerHeight * KB_FALLBACK_RATIO),
          headerBottom: Math.max(0, header?.getBoundingClientRect().bottom ?? 0),
          composerHeight: composer.offsetHeight
        })
        // Instant and invisible — the one and only scroll of this open.
        scrollBy(composer, composer.getBoundingClientRect().top - desiredTop)

        // In-gesture, and the composer is already above the keyboard, so the
        // browser has nothing it wants to scroll on top of us.
        field.focus({ preventScroll: true })

        const reduce = prefersReducedMotion()
        // Commit the from-state with a forced reflow (reliable regardless of
        // paint throttling), then flip to the resting state so the transition
        // breathes it in rather than cutting.
        composer.style.transform = 'translateY(28px)'
        void composer.offsetWidth
        composer.style.transition = reduce
          ? 'none'
          : 'opacity var(--dur-4) var(--ease-calm), transform var(--dur-4) var(--ease-calm)'
        composer.style.opacity = '1'
        composer.style.transform = 'none'
      },
      [headerSelector]
    )
  }
}

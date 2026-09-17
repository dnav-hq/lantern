// Growing a clamped text to its full height, and back, between MEASURED
// heights — docs/proposals/dive-in-2.md, "Motion".
//
// A max-height transition to a fixed cap only looks right when the cap equals
// the content: growing, the visible motion stops when the text ends while the
// transition carries on to the cap; shrinking, nothing moves until the cap
// passes the real height. So both directions measure. The element carries
// `.clamp` (a two-line ellipsis) when closed and `.is-open` when open; while it
// moves it carries `.is-growing`, which is what the CSS transition is scoped
// to (motion.css, inside the reduced-motion guard — under reduced motion the
// state simply flips).
//
// Nothing here may import a Node API — this file lives under src/ and obeys
// the pure-web rule in CLAUDE.md.

function reduced(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function settle(el: HTMLElement, done: () => void): void {
  const finish = (): void => {
    el.removeEventListener('transitionend', finish)
    el.style.height = ''
    el.classList.remove('is-growing')
    done()
  }
  el.addEventListener('transitionend', finish)
  // A transition that never fires (display toggled, tab hidden) must not
  // leave the element pinned at a height.
  window.setTimeout(() => {
    if (el.classList.contains('is-growing')) finish()
  }, 900)
}

/** Open: release the clamp and grow from the clamped height to the full one. */
export function growOpen(el: HTMLElement, afterContent?: () => void): void {
  const from = el.getBoundingClientRect().height
  el.classList.remove('clamp')
  afterContent?.()
  el.classList.add('is-open')
  if (reduced()) return
  const to = el.scrollHeight
  el.style.height = `${from}px`
  void el.offsetHeight
  el.classList.add('is-growing')
  el.style.height = `${to}px`
  settle(el, () => undefined)
}

/** Close: shrink from the full height to the clamped one, then re-clamp. */
export function growClosed(el: HTMLElement, afterClosed?: () => void): void {
  const from = el.getBoundingClientRect().height
  el.classList.remove('is-open')
  const finish = (): void => {
    el.classList.add('clamp')
    afterClosed?.()
  }
  if (reduced()) {
    finish()
    return
  }
  el.classList.add('clamp')
  const to = el.getBoundingClientRect().height
  el.classList.remove('clamp')
  el.style.height = `${from}px`
  void el.offsetHeight
  el.classList.add('is-growing')
  el.style.height = `${to}px`
  settle(el, finish)
}

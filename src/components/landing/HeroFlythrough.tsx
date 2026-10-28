import React, { useLayoutEffect, useRef } from 'react'
import Wordmark from '../Wordmark'
import { useClipLoop, usePrefersReducedMotion, type Loop } from './useClipLoop'

// The landing hero, ported from design/lantern-hero.html (the APPROVED spec).
//
// Concept: start like a normal reading view and make two real notes (a
// single-verse inline note, then a multi-verse rail note). Then glide down
// through a long, densely annotated John 1 at full readable size, showing the
// volume of study, and loop back to the top seamlessly.
//
// READ design/README.md BEFORE CHANGING THIS. Two things look over-engineered
// and are load-bearing; removing either visibly breaks the loop:
//
//   1. The chapter is CLONED. Scrolling exactly one chapter-height brings the
//      duplicate's top to the same screen position as the real top, so the
//      scroll can reset to 0 with no visible jump. That is what makes the loop
//      seamless rather than a fade.
//   2. The verse-1 note is COLLAPSED MID-SCROLL WITH A translateY COMPENSATION.
//      The note must open when written (no pre-reserved gap) but be gone before
//      the top comes back around, or the reset would show a mismatch. So it
//      collapses and the scroll shifts by the exact same measured amount in the
//      same instant — on-screen content does not move. The scroll is `linear`
//      for the same reason: constant velocity keeps the splice invisible.
//
// Deviation from the spec, deliberate: the spec's topbar carried a small lamp
// icon from the retired pictorial mark. The identity is wordmark-only now (see
// Wordmark.tsx), and this bar mimics the app's real top bar, which shows the
// wordmark — so it shows the wordmark here too.

// Tunables, as in the spec's own CONFIG block. noteClearance is how far past the
// verse-1 note's bottom edge to scroll before collapsing it (see B1 below).
const CONFIG = { scrollMs: 8000, typeSpeed: 30, noteClearance: 97 }

const NOTE_1_TEXT = 'With God, and was God. Two claims, one line.'
const NOTE_2_TEXT = "Before time, and I'm only meeting him now."

export default function HeroFlythrough(): React.JSX.Element {
  const reduce = usePrefersReducedMotion()

  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<SVGSVGElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const pillTextRef = useRef<HTMLSpanElement>(null)
  const taglineRef = useRef<HTMLDivElement>(null)

  const v1Ref = useRef<HTMLDivElement>(null)
  const v2Ref = useRef<HTMLDivElement>(null)
  const v3Ref = useRef<HTMLDivElement>(null)
  const uNote1Ref = useRef<HTMLDivElement>(null)
  const uNote2Ref = useRef<HTMLDivElement>(null)
  const ph1Ref = useRef<HTMLSpanElement>(null)
  const ph2Ref = useRef<HTMLSpanElement>(null)
  const typed1Ref = useRef<HTMLSpanElement>(null)
  const typed2Ref = useRef<HTMLSpanElement>(null)
  const caret1Ref = useRef<HTMLSpanElement>(null)
  const caret2Ref = useRef<HTMLSpanElement>(null)

  // The clone is created once, in a layout effect, rather than inside the loop
  // script: the script restarts every time the hero scrolls back into view, and
  // cloning there would stack up a new duplicate on every re-entry. Layout
  // effects run before the loop's own (passive) effect, so it always exists by
  // the time the script measures against it.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reduce) return
    const spread1 = canvas.querySelector('.lh-spread')
    if (!spread1) return
    const spread2 = spread1.cloneNode(true) as HTMLElement
    spread2.classList.add('lh-clone')
    spread2.setAttribute('aria-hidden', 'true')
    canvas.appendChild(spread2)
    return () => {
      spread2.remove()
    }
  }, [reduce])

  useClipLoop(
    frameRef,
    async ({ wait }: Loop) => {
      const frame = frameRef.current!
      const canvas = canvasRef.current!
      const cursor = cursorRef.current!
      const pill = pillRef.current!
      const pillText = pillTextRef.current!
      const v1 = v1Ref.current!
      const v2 = v2Ref.current!
      const v3 = v3Ref.current!
      const uNote1 = uNote1Ref.current!
      const uNote2 = uNote2Ref.current!
      const ph1 = ph1Ref.current!
      const ph2 = ph2Ref.current!
      const typed1 = typed1Ref.current!
      const typed2 = typed2Ref.current!
      const caret1 = caret1Ref.current!
      const caret2 = caret2Ref.current!

      const spreads = canvas.querySelectorAll<HTMLElement>('.lh-spread')
      const spread1 = spreads[0]
      const spread2 = spreads[1]
      if (!spread2) return // clone missing (reduced motion) — nothing to loop

      const pos = (el: Element): { x: number; y: number; w: number; h: number } => {
        const s = frame.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }
      }
      const moveCursor = (x: number, y: number, o = 1): void => {
        cursor.style.transform = `translate(${x}px,${y}px)`
        cursor.style.opacity = String(o)
      }
      const showPill = (anchor: Element, text: string, dx = 0, dy = 6): void => {
        const p = pos(anchor)
        pillText.textContent = text
        pill.style.left = `${p.x + dx}px`
        pill.style.top = `${p.y + p.h + dy}px`
        pill.classList.add('show')
      }
      const typeInto = async (
        span: HTMLElement,
        caret: HTMLElement,
        text: string
      ): Promise<void> => {
        caret.classList.add('on')
        for (let i = 0; i <= text.length; i++) {
          span.textContent = text.slice(0, i)
          await wait(CONFIG.typeSpeed + (text[i - 1] === ' ' ? 28 : 0))
        }
        await wait(360)
        caret.classList.remove('on')
      }

      const makeNotes = async (): Promise<void> => {
        moveCursor(pos(v1).x + 130, pos(v1).y + 12)
        await wait(680)
        v1.classList.add('sel', 'sel-single')
        await wait(300)
        showPill(v1, 'Quick note', 140)
        await wait(440)
        {
          const p = pos(pill)
          moveCursor(p.x + 15, p.y + 13)
        }
        await wait(540)
        pill.classList.add('press')
        await wait(150)
        pill.classList.remove('press')
        pill.classList.remove('show')
        v1.classList.remove('sel', 'sel-single')
        v1.classList.add('anch')
        uNote1.classList.add('show')
        await wait(150)
        {
          const p = pos(uNote1)
          moveCursor(p.x + 64, p.y + 28)
        }
        caret1.classList.add('on')
        await wait(600)
        ph1.style.opacity = '0'
        {
          const p = pos(uNote1)
          moveCursor(p.x - 22, p.y + 28)
        }
        await typeInto(typed1, caret1, NOTE_1_TEXT)
        await wait(460)

        moveCursor(pos(v2).x + 50, pos(v2).y + 10)
        await wait(500)
        v2.classList.add('sel', 'sel-first')
        await wait(190)
        moveCursor(pos(v3).x + 120, pos(v3).y + 10)
        v3.classList.add('sel', 'sel-last')
        await wait(400)
        showPill(v3, 'Note on 2–3', 150)
        await wait(440)
        {
          const p = pos(pill)
          moveCursor(p.x + 15, p.y + 13)
        }
        await wait(540)
        pill.classList.add('press')
        await wait(150)
        pill.classList.remove('press')
        pill.classList.remove('show')
        v2.classList.add('anch')
        v3.classList.add('anch')
        uNote2.classList.add('show')
        await wait(150)
        {
          const p = pos(uNote2)
          moveCursor(p.x + 36, p.y + 34)
        }
        caret2.classList.add('on')
        await wait(600)
        ph2.style.opacity = '0'
        {
          const p = pos(uNote2)
          moveCursor(p.x - 20, p.y + 34)
        }
        await typeInto(typed2, caret2, NOTE_2_TEXT)
        await wait(420)
      }

      const clearUserNotes = (): void => {
        uNote1.classList.remove('show')
        uNote2.classList.remove('show')
        typed1.textContent = ''
        typed2.textContent = ''
        ph1.style.opacity = '1'
        ph2.style.opacity = '1'
        v1.className = 'lh-v lh-v1'
        v1.style.setProperty('--c', 'var(--cat-observation)')
        v2.className = 'lh-v'
        v2.style.setProperty('--c', 'var(--cat-personal)')
        v3.className = 'lh-v'
        v3.style.setProperty('--c', 'var(--cat-personal)')
      }

      canvas.style.transition = 'none'
      canvas.style.transform = 'translateY(0)'
      await wait(150)

      for (;;) {
        uNote1.style.transition = '' // restore the note's own open animation
        clearUserNotes()
        canvas.style.transition = 'none'
        canvas.style.transform = 'translateY(0)'
        void canvas.offsetHeight
        moveCursor(pos(v1).x + 220, pos(v1).y + 150, 0)
        await wait(450)

        await makeNotes() // the note OPENS here (pushes verses), stationary
        await wait(450)
        moveCursor(pos(v1).x + 220, pos(v1).y + 150, 0) // cursor away
        await wait(180)

        // One constant velocity across the whole scroll (linear) so the
        // mid-scroll collapse compensation is invisible.
        const wrapOpen = spread2.offsetTop - spread1.offsetTop // chapter height, note open
        const v = wrapOpen / CONFIG.scrollMs

        // How far to scroll before the verse-1 note is safely off-screen above.
        // MEASURED, not the spec's hardcoded 210px: the note's height and the
        // verse it hangs off both depend on the column width, so one fixed value
        // that clears the note on a desktop card leaves it in plain sight on a
        // phone — and the collapse below then becomes a visible jump instead of
        // an invisible splice. NOTE_CLEARANCE is the slack the spec's 210 gave at
        // desktop, so this reproduces 210 there and adapts everywhere else.
        const noteBottom = uNote1.offsetTop - canvas.offsetTop + uNote1.offsetHeight
        const B1 = noteBottom + CONFIG.noteClearance

        // ── B1: scroll until the verse-1 note is off-screen above ──
        const t1 = B1 / v
        canvas.style.transition = `transform ${t1}ms linear`
        canvas.style.transform = `translateY(${-B1}px)`
        await wait(t1)

        // ── COMPENSATE: collapse the note off-screen and shift the scroll by the
        //    same amount in one instant, so on-screen content does not move; the
        //    top comes around clean (matching the duplicate) for a seamless reset.
        const pBefore = spread2.offsetTop
        uNote1.style.transition = 'none' // instant collapse, no animation
        clearUserNotes() // also resets rail note + verse tints
        void canvas.offsetHeight
        const delta = pBefore - spread2.offsetTop // the note's collapsed layout height
        canvas.style.transition = 'none'
        canvas.style.transform = `translateY(${-B1 + delta}px)`
        void canvas.offsetHeight

        // ── B2: continue at the same velocity to the clean duplicate top ──
        const wrapClosed = spread2.offsetTop - spread1.offsetTop
        const t2 = Math.max(200, (wrapClosed - (B1 - delta)) / v)
        canvas.style.transition = `transform ${t2}ms linear`
        canvas.style.transform = `translateY(${-wrapClosed}px)`
        await wait(t2)

        // ── SEAMLESS RESET: duplicate top == real top, both clean ──
        canvas.style.transition = 'none'
        canvas.style.transform = 'translateY(0)'
        void canvas.offsetHeight
        await wait(100)
      }
    },
    reduce
  )

  // Reduced motion: the annotated chapter at rest, with the two notes already
  // written and no scroll.
  const shown = reduce ? ' show' : ''

  return (
    <div className="lh-hero" aria-hidden="true">
      <div className="lh-topbar">
        <span className="lh-dot" />
        <span className="lh-dot" />
        <span className="lh-dot" />
        <span className="lh-ref">John 1</span>
        <span className="lh-grow" />
        <Wordmark size={12} className="lh-topbar-mark" />
      </div>

      <div className="lh-frame" ref={frameRef}>
        <div className="lh-canvas" ref={canvasRef}>
          <div className="lh-spread">
            <div
              className={`lh-v lh-v1${reduce ? ' anch' : ''}`}
              ref={v1Ref}
              style={{ gridRow: 1, '--c': 'var(--cat-observation)' } as React.CSSProperties}
            >
              <span className="lh-vn">1</span>In the beginning was the Word, and the Word was with
              God, and the Word was God.
            </div>
            <div
              className={`lh-note inline${shown}`}
              ref={uNote1Ref}
              style={{ gridRow: 2, '--c': 'var(--cat-observation)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Observation</div>
              <div className="lh-bd">
                <span className="lh-ph" ref={ph1Ref} style={reduce ? { opacity: 0 } : undefined}>
                  Type what you notice…
                </span>
                <span ref={typed1Ref}>{reduce ? NOTE_1_TEXT : ''}</span>
                <span className="lh-caret" ref={caret1Ref} />
              </div>
            </div>

            <div
              className={`lh-v${reduce ? ' anch' : ''}`}
              ref={v2Ref}
              style={{ gridRow: 3, '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <span className="lh-vn">2</span>He was with God in the beginning.
            </div>
            <div
              className={`lh-v${reduce ? ' anch' : ''}`}
              ref={v3Ref}
              style={{ gridRow: 4, '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <span className="lh-vn">3</span>Through Him all things were made, and without Him
              nothing was made that has been made.
            </div>
            <div
              className={`lh-note rail${shown}`}
              ref={uNote2Ref}
              style={{ gridRow: '3 / 5', '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Personal</div>
              <div className="lh-bd">
                <span className="lh-ph" ref={ph2Ref} style={reduce ? { opacity: 0 } : undefined}>
                  Type what you notice…
                </span>
                <span ref={typed2Ref}>{reduce ? NOTE_2_TEXT : ''}</span>
                <span className="lh-caret" ref={caret2Ref} />
              </div>
            </div>

            <div
              className="lh-v anch"
              style={{ gridRow: 5, '--c': 'var(--cat-application)' } as React.CSSProperties}
            >
              <span className="lh-vn">4</span>In Him was life, and that life was the light of men.
            </div>
            <div
              className="lh-note inline pre"
              style={{ gridRow: 6, '--c': 'var(--cat-application)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Application</div>
              <div className="lh-bd">Light to walk by, not only to look at.</div>
            </div>

            <div
              className="lh-v anch"
              style={{ gridRow: 7, '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <span className="lh-vn">5</span>The Light shines in the darkness, and the darkness has
              not overcome it.
            </div>
            <div
              className="lh-note inline pre"
              style={{ gridRow: 8, '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Personal</div>
              <div className="lh-bd">The dark never won. Hold onto that.</div>
            </div>

            <div
              className="lh-v anch"
              style={{ gridRow: 9, '--c': 'var(--cat-historical)' } as React.CSSProperties}
            >
              <span className="lh-vn">6</span>There came a man who was sent from God. His name was
              John.
            </div>
            <div
              className="lh-v anch"
              style={{ gridRow: 10, '--c': 'var(--cat-historical)' } as React.CSSProperties}
            >
              <span className="lh-vn">7</span>He came as a witness to testify about the Light, so
              that through him everyone might believe.
            </div>
            <div
              className="lh-note rail pre"
              style={{ gridRow: '9 / 11', '--c': 'var(--cat-historical)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Historical</div>
              <div className="lh-bd">The witness motif. John's Gospel is framed as testimony.</div>
            </div>

            <div
              className="lh-v anch"
              style={{ gridRow: 11, '--c': 'var(--cat-observation)' } as React.CSSProperties}
            >
              <span className="lh-vn">8</span>He himself was not the Light, but he came to testify
              about the Light.
            </div>
            <div
              className="lh-note inline pre"
              style={{ gridRow: 12, '--c': 'var(--cat-observation)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Observation</div>
              <div className="lh-bd">"Light" three times in two verses. The theme is set.</div>
            </div>

            <div
              className="lh-v"
              style={{ gridRow: 13, '--c': 'var(--cat-application)' } as React.CSSProperties}
            >
              <span className="lh-vn">9</span>The true Light, who gives light to everyone, was
              coming into the world.
            </div>
            <div
              className="lh-v anch"
              style={{ gridRow: 14, '--c': 'var(--cat-application)' } as React.CSSProperties}
            >
              <span className="lh-vn">10</span>He was in the world, and though the world was made
              through Him, the world did not recognize Him.
            </div>
            <div
              className="lh-note rail pre"
              style={{ gridRow: '13 / 15', '--c': 'var(--cat-application)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Application</div>
              <div className="lh-bd">Made by him, and still missed. Slow down and look.</div>
            </div>

            <div
              className="lh-v anch"
              style={{ gridRow: 15, '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <span className="lh-vn">11</span>He came to His own, and His own did not receive Him.
            </div>
            <div
              className="lh-v anch"
              style={{ gridRow: 16, '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <span className="lh-vn">12</span>But to all who did receive Him, to those who believed
              in His name, He gave the right to become children of God—
            </div>
            <div
              className="lh-note rail pre"
              style={{ gridRow: '15 / 17', '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Personal</div>
              <div className="lh-bd">Receiving, not earning. That is the whole door.</div>
            </div>

            <div
              className="lh-v"
              style={{ gridRow: 17, '--c': 'var(--cat-historical)' } as React.CSSProperties}
            >
              <span className="lh-vn">13</span>children born not of blood, nor of the desire or will
              of man, but born of God.
            </div>
            <div
              className="lh-v anch"
              style={{ gridRow: 18, '--c': 'var(--cat-historical)' } as React.CSSProperties}
            >
              <span className="lh-vn">14</span>The Word became flesh and made His dwelling among us.
              We have seen His glory, the glory of the one and only Son from the Father, full of
              grace and truth.
            </div>
            <div
              className="lh-note inline pre"
              style={{ gridRow: 19, '--c': 'var(--cat-historical)' } as React.CSSProperties}
            >
              <div className="lh-lbl">Historical</div>
              <div className="lh-bd">"Dwelling" = tabernacled. A deliberate Exodus echo.</div>
            </div>
          </div>
        </div>

        <div className="lh-pill" ref={pillRef}>
          <span ref={pillTextRef}>Quick note</span>
        </div>
        <svg className="lh-cursor" ref={cursorRef} viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 3l14 8-6 1.4L16 20l-2.4 1L10.5 13 5 17z" />
        </svg>
        {/* Faithful to the spec: the tagline appears only under reduced motion.
            The spec's script declares it but never shows it during the loop, so
            the approved animation does not include it. */}
        <div className={`lh-tagline${reduce ? ' show' : ''}`} ref={taglineRef}>
          <span className="lh-tagline-t">Your study, kept beside the Word.</span>
        </div>
      </div>
    </div>
  )
}

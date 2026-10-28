import React, { useRef } from 'react'
import { useClipLoop, usePrefersReducedMotion, type Loop } from './useClipLoop'

// The landing's three feature clips, ported from design/lantern-features.html
// (the APPROVED spec), in the hero's visual language: cursor, typing, category
// colours, cream and serif.
//
//   1  Four lenses       — one verse gathering a note of each category.
//   2  Notes on the verse — set in the STUDY VIEW (notes editor + scripture
//                           pane, matching the app's real split), showing a note
//                           and its anchored verse light up together.
//   3  Find and return   — type a reference to jump to a chapter, then the
//                           journal of past studies grouped by book.
//
// Each clip loops independently and only while on screen (see useClipLoop).
// Under reduced motion each renders its own resting state and never animates.

// A cursor is created imperatively in the spec; here it is just markup.
function Cursor({ innerRef }: { innerRef: React.RefObject<SVGSVGElement> }): React.JSX.Element {
  return (
    <svg className="lf-cursor" ref={innerRef} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 3l14 8-6 1.4L16 20l-2.4 1L10.5 13 5 17z" />
    </svg>
  )
}

function at(frame: HTMLElement, el: HTMLElement, dx = 0, dy = 0): { x: number; y: number } {
  const f = frame.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return { x: r.left - f.left + dx, y: r.top - f.top + dy }
}

function move(cur: SVGSVGElement, p: { x: number; y: number }, o = 1): void {
  cur.style.transform = `translate(${p.x}px,${p.y}px)`
  cur.style.opacity = String(o)
}

// ── Clip 1: four lenses ──────────────────────────────────────────────────────
function ClipFourLenses({ reduce }: { reduce: boolean }): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)

  useClipLoop(
    frameRef,
    async ({ wait }: Loop) => {
      const f = frameRef.current!
      const notes = [...f.querySelectorAll<HTMLElement>('.lf-note')]
      for (;;) {
        notes.forEach(n => n.classList.remove('show'))
        await wait(900)
        for (const n of notes) {
          n.classList.add('show')
          await wait(680)
        }
        await wait(2400)
      }
    },
    reduce
  )

  const shown = reduce ? ' show' : ''

  return (
    <div className="lf-frame" ref={frameRef} aria-hidden="true">
      <div className="lf-bar">
        <span className="lf-d" />
        <span className="lf-d" />
        <span className="lf-d" />
        <span className="lf-t">John 1</span>
      </div>
      <div className="lf-stage">
        <div className="lf-v">
          <span className="lf-vn">5</span>The Light shines in the darkness, and the darkness has not
          overcome it.
        </div>
        <div className="lf-lens-notes">
          <div
            className={`lf-note${shown}`}
            style={{ '--c': 'var(--cat-observation)' } as React.CSSProperties}
          >
            <div className="lf-lbl">Observation</div>
            <div className="lf-bd">"Light" and "darkness" set against each other.</div>
          </div>
          <div
            className={`lf-note${shown}`}
            style={{ '--c': 'var(--cat-historical)' } as React.CSSProperties}
          >
            <div className="lf-lbl">Historical</div>
            <div className="lf-bd">John's readers knew Genesis 1 by heart.</div>
          </div>
          <div
            className={`lf-note${shown}`}
            style={{ '--c': 'var(--cat-application)' } as React.CSSProperties}
          >
            <div className="lf-lbl">Application</div>
            <div className="lf-bd">Light to walk by, not only to look at.</div>
          </div>
          <div
            className={`lf-note${shown}`}
            style={{ '--c': 'var(--cat-personal)' } as React.CSSProperties}
          >
            <div className="lf-lbl">Personal</div>
            <div className="lf-bd">The dark never won. Hold onto that.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Clip 2: study view, note ↔ verse ─────────────────────────────────────────
function ClipNotesOnVerse({ reduce }: { reduce: boolean }): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<SVGSVGElement>(null)

  useClipLoop(
    frameRef,
    async ({ wait }: Loop) => {
      const f = frameRef.current!
      const cur = cursorRef.current!
      const lines = [...f.querySelectorAll<HTMLElement>('.lf-noteline')]
      const verses = [...f.querySelectorAll<HTMLElement>('.lf-v[data-sv]')]
      const clear = (): void => {
        lines.forEach(l => l.classList.remove('active'))
        verses.forEach(v => v.classList.remove('lit'))
      }
      for (;;) {
        clear()
        move(cur, at(f, lines[0], 90, 40), 0)
        await wait(700)
        for (const l of lines) {
          move(cur, at(f, l, 60, 14))
          await wait(620)
          clear()
          l.classList.add('active')
          const target = verses.find(v => v.dataset.sv === l.dataset.nl)
          if (target) target.classList.add('lit')
          await wait(1300)
        }
        move(cur, at(f, lines[0], 90, 60), 0)
        await wait(900)
      }
    },
    reduce
  )

  return (
    <div className="lf-frame" ref={frameRef} aria-hidden="true">
      <div className="lf-bar">
        <span className="lf-d" />
        <span className="lf-d" />
        <span className="lf-d" />
        <span className="lf-t">Study · John 1:1–5</span>
      </div>
      <div className="lf-stage">
        <div className="lf-split">
          <div className="lf-pane">
            <div className="lf-pane-h">Notes</div>
            <div
              className="lf-noteline"
              data-nl="1"
              style={{ '--c': 'var(--cat-observation)' } as React.CSSProperties}
            >
              <div className="lf-lbl">Observation</div>
              <div className="lf-bd">With God, and was God.</div>
            </div>
            <div
              className="lf-noteline"
              data-nl="3"
              style={{ '--c': 'var(--cat-historical)' } as React.CSSProperties}
            >
              <div className="lf-lbl">Historical</div>
              <div className="lf-bd">Echoes Genesis 1.</div>
            </div>
            <div
              className="lf-noteline"
              data-nl="5"
              style={{ '--c': 'var(--cat-personal)' } as React.CSSProperties}
            >
              <div className="lf-lbl">Personal</div>
              <div className="lf-bd">The dark never won.</div>
            </div>
          </div>
          <div className="lf-pane">
            <div className="lf-pane-h">Scripture</div>
            <div className="lf-v" data-sv="1">
              <span className="lf-vn">1</span>In the beginning was the Word…
            </div>
            <div className="lf-v" data-sv="2">
              <span className="lf-vn">2</span>He was with God in the beginning.
            </div>
            <div className="lf-v" data-sv="3">
              <span className="lf-vn">3</span>Through Him all things were made.
            </div>
            <div className="lf-v" data-sv="4">
              <span className="lf-vn">4</span>In Him was life, the light of men.
            </div>
            <div className="lf-v" data-sv="5">
              <span className="lf-vn">5</span>The Light shines in the darkness…
            </div>
          </div>
        </div>
      </div>
      {/* The cursor is a child of the FRAME, not the stage: at() measures every
          coordinate relative to the frame's own rect (as the spec does). */}
      <Cursor innerRef={cursorRef} />
    </div>
  )
}

// ── Clip 3: search → jump, then journal ──────────────────────────────────────
function ClipFindAndReturn({ reduce }: { reduce: boolean }): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<SVGSVGElement>(null)

  useClipLoop(
    frameRef,
    async ({ wait }: Loop) => {
      const f = frameRef.current!
      const cur = cursorRef.current!
      const q = f.querySelector<HTMLElement>('.lf-q')!
      const caret = f.querySelector<HTMLElement>('.lf-caret')!
      const ph = f.querySelector<HTMLElement>('.lf-searchbox .lf-ph')!
      const r = f.querySelector<HTMLElement>('.lf-result')!
      const a = f.querySelector<HTMLElement>('.lf-phase-search')!
      const b = f.querySelector<HTMLElement>('.lf-phase-journal')!
      const rows = [...f.querySelectorAll<HTMLElement>('.lf-jrow')]

      for (;;) {
        a.classList.add('on')
        b.classList.remove('on')
        q.textContent = ''
        ph.style.display = ''
        r.classList.remove('show', 'hot')
        caret.classList.remove('on')
        rows.forEach(x => x.classList.remove('hot'))
        move(cur, at(f, a, 200, 120), 0)
        await wait(700)

        // click the field and type
        move(cur, at(f, a, 60, 12))
        await wait(600)
        ph.style.display = 'none'
        caret.classList.add('on')
        await wait(400)
        for (const ch of 'john 1') {
          q.textContent += ch
          await wait(110)
        }
        await wait(300)
        caret.classList.remove('on')
        r.classList.add('show')
        await wait(600)

        // click the result
        move(cur, at(f, r, 40, 12))
        await wait(600)
        r.classList.add('hot')
        await wait(500)

        // → journal
        a.classList.remove('on')
        b.classList.add('on')
        move(cur, at(f, b, 200, 130), 0)
        await wait(900)
        move(cur, at(f, rows[0], 60, 14))
        await wait(700)
        rows[0].classList.add('hot')
        await wait(1400)
        move(cur, at(f, rows[0], 200, 90), 0)
        await wait(700)
      }
    },
    reduce
  )

  return (
    <div className="lf-frame" ref={frameRef} aria-hidden="true">
      <div className="lf-bar">
        <span className="lf-d" />
        <span className="lf-d" />
        <span className="lf-d" />
        <span className="lf-t">Lantern</span>
      </div>
      <div className="lf-stage">
        <div className="lf-phase lf-phase-search on">
          <div className="lf-searchbox">
            <svg
              className="lf-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="lf-q">{reduce ? 'john 1' : ''}</span>
            <span className="lf-caret" />
            <span className="lf-ph" style={reduce ? { display: 'none' } : undefined}>
              Search a reference or a note…
            </span>
          </div>
          <div className={`lf-result${reduce ? ' show' : ''}`}>
            <span className="lf-r">John 1</span>
            <span className="lf-k">Open chapter</span>
          </div>
        </div>
        <div className="lf-phase lf-phase-journal">
          <div className="lf-jgroup">John</div>
          <div className="lf-jrow">
            <div className="lf-jtop">
              <span className="lf-rf">John 1:1–5</span>
              <span className="lf-dt">Jul 14</span>
            </div>
            <div className="lf-pv">4 notes · With God, and was God.</div>
          </div>
          <div className="lf-jrow">
            <div className="lf-jtop">
              <span className="lf-rf">John 3:1–8</span>
              <span className="lf-dt">Jul 9</span>
            </div>
            <div className="lf-pv">2 notes · Born of the Spirit.</div>
          </div>
          <div className="lf-jgroup lf-jgroup--spaced">Romans</div>
          <div className="lf-jrow">
            <div className="lf-jtop">
              <span className="lf-rf">Romans 8:28–39</span>
              <span className="lf-dt">Jul 2</span>
            </div>
            <div className="lf-pv">6 notes · Nothing separates.</div>
          </div>
        </div>
      </div>
      <Cursor innerRef={cursorRef} />
    </div>
  )
}

// ── The section ──────────────────────────────────────────────────────────────
export default function FeatureClips(): React.JSX.Element {
  const reduce = usePrefersReducedMotion()

  return (
    <>
      <section className="lf-feature" id="lenses">
        <div className="lf-copy">
          <div className="eyebrow">Four lenses</div>
          <h2 className="serif">One passage, seen four ways.</h2>
          <p>
            Every note is one of four kinds. Over time a passage fills in from every angle, and you
            can read it back lens by lens.
          </p>
        </div>
        <ClipFourLenses reduce={reduce} />
      </section>

      <section className="lf-feature lf-feature--flip" id="study">
        <div className="lf-copy">
          <div className="eyebrow">In the study</div>
          <h2 className="serif">Your notes live on the verse.</h2>
          <p>
            Write in the study and every note stays anchored to its exact verse. Touch a note and
            the Scripture it belongs to lights up.
          </p>
        </div>
        <ClipNotesOnVerse reduce={reduce} />
      </section>

      <section className="lf-feature" id="find">
        <div className="lf-copy">
          <div className="eyebrow">Find and return</div>
          <h2 className="serif">Everything you've studied, waiting.</h2>
          <p>
            Type a reference to jump straight to a chapter. Every study you've done is kept in a
            journal, grouped by book.
          </p>
        </div>
        <ClipFindAndReturn reduce={reduce} />
      </section>
    </>
  )
}

import React from 'react'

// The landing's fourth feature section: the dive-in beneath a verse. Unlike the
// three clips in FeatureClips this one is STATIC: a hand-built card in the same
// visual language (lf- frame, bar, serif verse, category/accent tokens), with
// no loop to run. The dive-in is a thing you look at, not a motion, so a still
// card tells it better than another cursor would.
//
// The content mirrors what the app's DiveIn.tsx actually shows for Galatians
// 1:17 (the verse, "Where Scripture picks this up" with each passage's section
// heading, and a map card because the verse travels), so the page does not
// promise a view the app does not have.
//
// The route sketch is a bare SVG: three dots and one curve, accent-coloured, no
// basemap. Every colour is a token, so dark mode comes for free as it does for
// the rest of landing.css.

const PICKS_UP = [
  { ref: 'Acts 9:20–25', heading: 'Saul Preaches in Damascus' },
  { ref: 'Acts 9:26', heading: 'Saul in Jerusalem' }
]

function RouteSketch(): React.JSX.Element {
  // Rough bearings only: Damascus to the north-east, Jerusalem south-west of
  // it, Arabia off to the south. The curve runs Jerusalem, Damascus, Arabia so
  // the eye reads the verse's own movement, into Arabia and back to Damascus.
  return (
    <svg className="lf-route" viewBox="0 0 220 140" aria-hidden="true">
      <path
        className="lf-route-line"
        d="M48 92 C 70 64, 118 36, 160 34 S 150 92, 128 114"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="4 3"
      />
      <g className="lf-route-stop">
        <circle cx="160" cy="34" r="4" />
        <text x="160" y="22" textAnchor="middle">
          Damascus
        </text>
      </g>
      <g className="lf-route-stop">
        <circle cx="128" cy="114" r="4" />
        <text x="128" y="131" textAnchor="middle">
          Arabia
        </text>
      </g>
      <g className="lf-route-stop lf-route-stop--faint">
        <circle cx="48" cy="92" r="4" />
        <text x="48" y="109" textAnchor="middle">
          Jerusalem
        </text>
      </g>
    </svg>
  )
}

export default function DiveInCard(): React.JSX.Element {
  return (
    <section className="lf-feature lf-feature--flip" id="dive">
      <div className="lf-copy">
        <div className="eyebrow">Beneath the verse</div>
        <h2 className="serif">See where a verse leads.</h2>
        <p>
          Choose a verse and Lantern shows the passages that pick it up, each with its heading, and
          a map when the text travels. Nothing is written for you. It only shows you where to look.
        </p>
      </div>

      <div className="lf-frame lf-frame--dive" aria-hidden="true">
        <div className="lf-bar">
          <span className="lf-d" />
          <span className="lf-d" />
          <span className="lf-d" />
          <span className="lf-t">Galatians 1</span>
        </div>
        <div className="lf-stage lf-dive">
          <div className="lf-dive-text">
            <div className="lf-v lit">
              <span className="lf-vn">17</span>nor did I go up to Jerusalem to the apostles who came
              before me, but I went into Arabia and later returned to Damascus.
            </div>
            <div className="lf-dive-label">Where Scripture picks this up</div>
            {PICKS_UP.map(p => (
              <div className="lf-xrow" key={p.ref}>
                <span className="lf-rf">{p.ref}</span>
                <span className="lf-xh">{p.heading}</span>
              </div>
            ))}
          </div>
          <div className="lf-dive-map">
            <RouteSketch />
            <div className="lf-dive-map-cap">Damascus to Arabia, and back</div>
          </div>
        </div>
      </div>
    </section>
  )
}

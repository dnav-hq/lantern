import React, { useEffect, useMemo, useState } from 'react'
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
  selectLabels,
  type PlaceMarker
} from '../utils/mapDataLoader'

// The Bible map — slice 2 of docs/proposals/bible-map-v1.md: it DRAWS.
//
// Deliberately read-only and deliberately unfinished. This slice exists so the
// interaction design can be a critique of something real instead of a blank
// page, so it stops exactly where taste begins. NOT here, on purpose:
//   • how the map is reached from a verse or a passage (today: a temporary
//     `?map` entry in App.tsx, marked there and easy to delete);
//   • pan, zoom and gesture feel (brief section 4.4) — the whole world is drawn at
//     one fixed viewBox and nothing moves;
//   • marker clustering, off-canvas edge indicators for the ~65 outliers, and
//     tapping a place to open its candidates or its openbible.info page;
//   • any wiring into the reading or study surfaces.
//
// What IS here is the part the brief calls non-negotiable: the base artwork,
// the places, and confidence shown honestly (section 3.3).

/** The two base layers. `relief` fetches terrain.png; `plain` never touches it. */
export type MapBaseView = 'plain' | 'relief'

/**
 * How many labels the map draws before it stops. 1,342 places cannot all carry
 * a name; `selectLabels` awards them highest-confidence-first and this caps the
 * tail so the SVG stays small.
 */
const LABEL_LIMIT = 190

interface MapCanvasProps {
  artwork: MapBaseArtwork
  places: MapPlaceBundle
  view: MapBaseView
}

/**
 * The drawing itself, as a pure function of the two bundles. Split out from the
 * loading shell above it so it can be rendered — and asserted on — without a
 * DOM, a fetch or an effect (see MapView.test.tsx).
 */
export function MapCanvas({ artwork, places, view }: MapCanvasProps): React.ReactElement {
  const [, , vbWidth, vbHeight] = artwork.viewBox
  const model = useMemo(() => buildViewModel(places), [places])
  const labels = useMemo(() => selectLabels(model.markers, { limit: LABEL_LIMIT }), [model])
  const terrain = artwork.terrain

  return (
    <svg
      className="map-svg"
      viewBox={artwork.viewBox.join(' ')}
      role="img"
      aria-label={`The Bible world: ${model.markers.length} places from Genesis to Revelation, drawn on modern coastlines.`}
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
          <PlaceGlyph key={marker.index} marker={marker} />
        ))}
      </g>

      <g className="map-labels" aria-hidden="true">
        {labels.map(label => (
          <text key={label.index} className="map-label" x={label.x} y={label.y}>
            {label.name}
          </text>
        ))}
      </g>
    </svg>
  )
}

/**
 * One place. Confidence is carried by SHAPE and FILL, never by colour alone
 * (brief section 3.3 rule 1): an undisputed place is a solid disc, a moderate one a
 * hollow ring, a low-confidence one a dashed hollow ring. A contested place
 * additionally draws its rivals as small open marks tied to the best candidate
 * by a hairline — the brief's rule 2, that showing only the winner is exactly
 * the false certainty this map is supposed to refuse.
 */
function PlaceGlyph({ marker }: { marker: PlaceMarker }): React.ReactElement {
  const { point, band, contested, alternatives } = marker
  return (
    <g className={`map-place is-${band}${contested ? ' is-contested' : ''}`}>
      <title>{describeMarker(marker)}</title>
      {alternatives.map((alt, i) => (
        <React.Fragment key={i}>
          <line
            className="map-place-link"
            x1={point.x}
            y1={point.y}
            x2={alt.x}
            y2={alt.y}
            vectorEffect="non-scaling-stroke"
          />
          <circle className="map-place-alt" cx={alt.x} cy={alt.y} r={1.6} />
        </React.Fragment>
      ))}
      <circle
        className="map-place-dot"
        cx={point.x}
        cy={point.y}
        r={band === 'settled' ? 2.6 : 2.2}
      />
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
 * The map surface: loads both bundles lazily on mount (nothing fetches them at
 * app start — see `loadMapPlaces`), then draws.
 */
export default function MapView(): React.ReactElement {
  const [artwork, setArtwork] = useState<MapBaseArtwork | null>(null)
  const [places, setPlaces] = useState<MapPlaceBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<MapBaseView>('plain')

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

  return (
    <div className="map-view">
      <header className="map-view-head">
        <div>
          <p className="map-view-eyebrow">Preview — read only</p>
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
            <MapCanvas artwork={artwork} places={places} view={view} />
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
              . Linking each place to its own page needs a tap target, which is the design pass.
            </p>
          </footer>
        </>
      )}
    </div>
  )
}

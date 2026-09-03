import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapCanvas } from './MapView'
import type { MapBaseArtwork, MapPlaceBundle } from '../utils/mapData'

// No jsdom, no @testing-library — this repo has neither and the brief forbids
// adding a dependency for a preview slice. `renderToStaticMarkup` comes from
// react-dom, which is already here, and it is enough: MapCanvas is a pure
// function of the two bundles precisely so the drawing can be asserted on
// without a browser. (What a browser is for — that it LOOKS right in both
// themes — is the screenshots, not this file.)

const ARTWORK: MapBaseArtwork = {
  v: 1,
  attribution: 'Base map: Natural Earth (public domain)',
  source_commit: 'ca96624',
  generated: '2026-09-03',
  extent: { minLon: 10, maxLon: 60, minLat: 20, maxLat: 45 },
  viewBox: [0, 0, 1000, 572.58],
  layers: {
    coastline: ['M10,10L20,20'],
    lakes: ['M30,30L40,40L30,40Z'],
    rivers: ['M50,50L60,60']
  },
  terrain: {
    url: '/map/terrain.png',
    width: 1600,
    height: 916,
    bytes: 701424,
    attribution: 'Base map: Natural Earth (public domain)'
  }
}

const PLACES: MapPlaceBundle = {
  v: 1,
  attribution: 'OpenBible.info Bible Geocoding Data by Stephen Smith, CC BY 4.0',
  source_commit: '7eb18a5',
  generated: '2026-09-03',
  p: [
    {
      n: 'Jerusalem',
      t: 'settlement',
      sl: 'a15257a/jerusalem',
      c: [{ ll: [35.2342, 31.7767], s: 1000, m: 'Jerusalem' }]
    },
    {
      n: 'Ai 1',
      t: 'settlement',
      sl: 'a7e13e1/ai-1',
      c: [
        { ll: [35.2611, 31.9169], s: 522, m: 'Et Tell' },
        { ll: [35.2496, 31.9148], s: 75, m: 'Khirbet el Maqatir' }
      ]
    },
    { n: 'Nod', t: 'region', sl: 'a000nod/nod', c: [] }
  ],
  ch: {},
  vs: {}
}

const render = (view: 'plain' | 'relief'): string =>
  renderToStaticMarkup(<MapCanvas artwork={ARTWORK} places={PLACES} view={view} />)

describe('MapCanvas', () => {
  it('draws the base artwork on the bundle’s own viewBox', () => {
    const html = render('plain')
    expect(html).toContain('viewBox="0 0 1000 572.58"')
    expect(html).toContain('M10,10L20,20')
    expect(html).toContain('M30,30L40,40L30,40Z')
    expect(html).toContain('M50,50L60,60')
  })

  it('does not reference terrain.png in the plain view — that is what makes it lazy', () => {
    expect(render('plain')).not.toContain('terrain.png')
    expect(render('relief')).toContain('/map/terrain.png')
  })

  it('encodes confidence in the marker class, not only in colour', () => {
    const html = render('plain')
    expect(html).toContain('map-place is-settled')
    expect(html).toContain('map-place is-moderate is-contested')
  })

  it('draws a contested place’s rival location, not just its winner', () => {
    expect(render('plain')).toContain('map-place-alt')
  })

  it('never draws a marker for a place nobody can locate', () => {
    const html = render('plain')
    expect(html).toContain('Jerusalem')
    expect(html).not.toContain('Nod')
  })

  it('states the confidence in the accessible name of each place', () => {
    const html = render('plain')
    expect(html).toContain('<title>Jerusalem — Undisputed (1000/1000); identified as Jerusalem')
    expect(html).toContain('1 competing location also proposed')
  })
})
